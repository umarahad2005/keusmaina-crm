const express = require('express');
const Package = require('../models/Package');
const SupplierLedger = require('../models/SupplierLedger');
const Expense = require('../models/Expense');
const CurrencySettings = require('../models/CurrencySettings');
const ProfitClosing = require('../models/ProfitClosing');
const { protect, authorize } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/auditLog');
const { FINANCE } = require('../middleware/roles');
const { packageSellPKRExpr } = require('../utils/pricing');
const router = express.Router();

router.use(protect);
router.use(auditMiddleware('ProfitClosing'));

// Closing the books is a finance action (admin + accounts).
const CLOSING_ROLES = FINANCE;

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// A month runs [1st 00:00, 1st of next month 00:00) — the same half-open window
// the P&L report uses, so the two always agree.
function monthWindow(periodMonth) {
    const [y, m] = periodMonth.split('-').map(Number);
    return { from: new Date(y, m - 1, 1), to: new Date(y, m, 1) };
}

// Accrual net profit for the window, computed exactly as /reports/pnl does.
async function computeMonth(periodMonth) {
    const { from, to } = monthWindow(periodMonth);
    const currency = await CurrencySettings.getRate();

    const [revAgg, cogsAgg, opexAgg] = await Promise.all([
        Package.aggregate([
            { $match: { isActive: true, status: { $in: ['confirmed', 'completed'] }, createdAt: { $gte: from, $lt: to } } },
            { $group: { _id: null, total: { $sum: packageSellPKRExpr(currency.sarToPkr) }, count: { $sum: 1 } } }
        ]),
        SupplierLedger.aggregate([
            { $match: { type: 'debit', date: { $gte: from, $lt: to } } },
            { $group: { _id: null, total: { $sum: '$amountPKR' } } }
        ]),
        Expense.aggregate([
            { $match: { isActive: true, date: { $gte: from, $lt: to } } },
            { $group: { _id: null, total: { $sum: '$amountPKR' } } }
        ])
    ]);

    const revenuePKR = Math.round(revAgg[0]?.total || 0);
    const cogsPKR = Math.round(cogsAgg[0]?.total || 0);
    const opexPKR = Math.round(opexAgg[0]?.total || 0);

    return {
        periodMonth, periodFrom: from, periodTo: to,
        revenuePKR, cogsPKR, opexPKR,
        packageCount: revAgg[0]?.count || 0,
        netProfitPKR: revenuePKR - cogsPKR - opexPKR
    };
}

// Split into `parts` equal shares: part 1 is the office, the rest are partners.
// Integer division leaves a remainder of at most (parts − 1) paisa-free rupees;
// it goes to the office so the shares add back to the net exactly.
function splitShares(netProfitPKR, parts, partnerLabels = []) {
    const each = Math.floor(netProfitPKR / parts);
    const remainder = netProfitPKR - each * parts;
    const shares = [{ label: 'Office', kind: 'office', amountPKR: each + remainder }];
    for (let i = 1; i < parts; i++) {
        shares.push({
            label: (partnerLabels[i - 1] || '').trim() || `Partner ${i}`,
            kind: 'partner',
            amountPKR: each
        });
    }
    return { shares, roundingPKR: remainder };
}

// GET /api/closings — history, newest first
router.get('/', async (req, res) => {
    try {
        const items = await ProfitClosing.find().sort('-periodFrom').limit(60).populate('closedBy', 'name');
        res.json({ success: true, data: items, count: items.length });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// GET /api/closings/preview?month=YYYY-MM&parts=6 — what a close would record
router.get('/preview', async (req, res) => {
    try {
        const month = String(req.query.month || '');
        if (!MONTH_RE.test(month)) {
            return res.status(400).json({ success: false, message: 'month must be YYYY-MM' });
        }
        const parts = Math.max(1, parseInt(req.query.parts, 10) || 1);
        const figures = await computeMonth(month);
        const { shares, roundingPKR } = splitShares(figures.netProfitPKR, parts);
        const existing = await ProfitClosing.findOne({ periodMonth: month }).select('_id closedAt');
        res.json({
            success: true,
            data: { ...figures, parts, shares, roundingPKR, alreadyClosed: !!existing, closedAt: existing?.closedAt || null }
        });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// POST /api/closings — take the close
router.post('/', authorize(...CLOSING_ROLES), async (req, res) => {
    try {
        const month = String(req.body.month || '');
        if (!MONTH_RE.test(month)) {
            return res.status(400).json({ success: false, message: 'month must be YYYY-MM' });
        }
        const parts = parseInt(req.body.parts, 10);
        if (!Number.isFinite(parts) || parts < 1 || parts > 50) {
            return res.status(400).json({ success: false, message: 'parts must be between 1 and 50' });
        }
        if (await ProfitClosing.findOne({ periodMonth: month })) {
            return res.status(409).json({ success: false, message: `${month} is already closed. Delete that close first to restate it.` });
        }
        // Refuse to close a month that has not finished — the figures would keep
        // moving after the shares were agreed.
        const { to } = monthWindow(month);
        if (to > new Date()) {
            return res.status(400).json({ success: false, message: `${month} has not ended yet.` });
        }

        const figures = await computeMonth(month);
        const labels = Array.isArray(req.body.partnerLabels) ? req.body.partnerLabels.map(String) : [];
        const { shares, roundingPKR } = splitShares(figures.netProfitPKR, parts);
        shares.forEach((s, i) => { if (i > 0 && labels[i - 1]) s.label = labels[i - 1].trim() || s.label; });

        const closing = await ProfitClosing.create({
            ...figures, parts, shares, roundingPKR,
            notes: req.body.notes, closedBy: req.user._id, closedAt: new Date()
        });
        res.status(201).json({ success: true, data: closing });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// DELETE /api/closings/:id — reopen a month so it can be restated
router.delete('/:id', authorize(...CLOSING_ROLES), async (req, res) => {
    try {
        const gone = await ProfitClosing.findByIdAndDelete(req.params.id);
        if (!gone) return res.status(404).json({ success: false, message: 'Closing not found' });
        res.json({ success: true, message: `${gone.periodMonth} reopened` });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

module.exports = router;
