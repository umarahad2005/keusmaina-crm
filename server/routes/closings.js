const express = require('express');
const SupplierLedger = require('../models/SupplierLedger');
const LedgerEntry = require('../models/LedgerEntry');
const Expense = require('../models/Expense');
const CurrencySettings = require('../models/CurrencySettings');
const ProfitClosing = require('../models/ProfitClosing');
const { protect, authorize } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/auditLog');
const { FINANCE } = require('../middleware/roles');
const { bookedRevenuePKR } = require('../utils/revenue');
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

// Both measures of the month, so a close can be taken on either and the two
// can always be compared.
//
//   accrual — what the month EARNED: booked revenue (including sales not yet
//             paid for) less supplier invoices (including bills not yet
//             settled) less expenses. Matches the P&L report.
//   cash    — what the month COLLECTED: client payments received, less
//             supplier payments made and expenses. This is the money that
//             actually exists to hand out.
//
// They diverge whenever a sale is unpaid or a supplier bill is outstanding.
async function computeMonth(periodMonth) {
    const { from, to } = monthWindow(periodMonth);
    const currency = await CurrencySettings.getRate();
    const rate = currency.sarToPkr;
    const inWindow = { $gte: from, $lt: to };

    const sumPKR = (agg) => Math.round(agg[0]?.total || 0);

    const [booked, cogsInvoiced, cogsPaid, opexAgg, clientCredits] = await Promise.all([
        bookedRevenuePKR({ from, to, rate }),
        SupplierLedger.aggregate([
            { $match: { type: 'debit', date: inWindow } },
            { $group: { _id: null, total: { $sum: '$amountPKR' } } }
        ]),
        SupplierLedger.aggregate([
            { $match: { type: 'credit', date: inWindow } },
            { $group: { _id: null, total: { $sum: '$amountPKR' } } }
        ]),
        Expense.aggregate([
            { $match: { isActive: true, date: inWindow } },
            { $group: { _id: null, total: { $sum: '$amountPKR' } } }
        ]),
        // Client payments received. Mixed currency, so convert per row rather
        // than summing raw amounts.
        LedgerEntry.aggregate([
            { $match: { isActive: true, type: 'credit', date: inWindow } },
            { $group: { _id: '$currency', total: { $sum: '$amount' } } }
        ])
    ]);

    const revenuePKR = booked.totalPKR;
    const cogsPKR = sumPKR(cogsInvoiced);
    const opexPKR = sumPKR(opexAgg);
    const supplierPaidPKR = sumPKR(cogsPaid);
    const cashInPKR = Math.round(
        clientCredits.reduce((s, r) => s + (r.total || 0) * (r._id === 'SAR' ? rate : 1), 0)
    );

    return {
        periodMonth, periodFrom: from, periodTo: to,
        packageCount: booked.packageCount,
        directChargeCount: booked.directCount,

        revenuePKR, cogsPKR, opexPKR,
        netProfitPKR: revenuePKR - cogsPKR - opexPKR,

        cashInPKR, supplierPaidPKR, opexPaidPKR: opexPKR,
        netCashPKR: cashInPKR - supplierPaidPKR - opexPKR
    };
}

// Which figure a given basis divides up.
const amountForBasis = (figures, basis) =>
    basis === 'accrual' ? figures.netProfitPKR : figures.netCashPKR;

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
        const basis = req.query.basis === 'accrual' ? 'accrual' : 'cash';
        const figures = await computeMonth(month);
        const distributedPKR = amountForBasis(figures, basis);
        const { shares, roundingPKR } = splitShares(distributedPKR, parts);
        const existing = await ProfitClosing.findOne({ periodMonth: month }).select('_id closedAt');
        res.json({
            success: true,
            data: {
                ...figures, parts, basis, distributedPKR, shares, roundingPKR,
                alreadyClosed: !!existing, closedAt: existing?.closedAt || null
            }
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

        const basis = req.body.basis === 'accrual' ? 'accrual' : 'cash';
        const figures = await computeMonth(month);
        const distributedPKR = amountForBasis(figures, basis);
        const labels = Array.isArray(req.body.partnerLabels) ? req.body.partnerLabels.map(String) : [];
        const { shares, roundingPKR } = splitShares(distributedPKR, parts);
        shares.forEach((s, i) => { if (i > 0 && labels[i - 1]) s.label = labels[i - 1].trim() || s.label; });

        const closing = await ProfitClosing.create({
            ...figures, parts, basis, distributedPKR, shares, roundingPKR,
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
