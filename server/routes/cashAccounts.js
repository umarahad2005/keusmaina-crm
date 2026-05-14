const express = require('express');
const mongoose = require('mongoose');
const CashAccount = require('../models/CashAccount');
const LedgerEntry = require('../models/LedgerEntry');
const SupplierLedger = require('../models/SupplierLedger');
const Expense = require('../models/Expense');
const { protect } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/auditLog');
const router = express.Router();

router.use(protect);
router.use(auditMiddleware('CashAccount'));

// Sum up movements per account across all three transaction sources
async function buildBalanceMap() {
    const [clientAgg, supplierAgg, expenseAgg] = await Promise.all([
        // Client payments received = money INTO the account (clientType=credit)
        // Client refunds out (credit type 'refund') skipped — single-flow assumption
        LedgerEntry.aggregate([
            { $match: { isActive: true, cashAccount: { $ne: null } } },
            {
                $group: {
                    _id: '$cashAccount',
                    inflow: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, { $ifNull: ['$amountPKR', '$amount'] }, 0] } },
                    outflow: { $sum: { $cond: [{ $eq: ['$type', 'debit'] }, 0, 0] } }
                }
            }
        ]),
        // Supplier payments made = money OUT (type=credit in supplier ledger means WE PAID)
        SupplierLedger.aggregate([
            { $match: { cashAccount: { $ne: null } } },
            {
                $group: {
                    _id: '$cashAccount',
                    outflow: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, { $ifNull: ['$amountPKR', '$amount'] }, 0] } }
                }
            }
        ]),
        // Operating expenses = money OUT
        Expense.aggregate([
            { $match: { isActive: true, cashAccount: { $ne: null } } },
            { $group: { _id: '$cashAccount', outflow: { $sum: { $ifNull: ['$amountPKR', '$amount'] } } } }
        ])
    ]);

    const map = new Map();
    const ensure = (id) => { const k = String(id); if (!map.has(k)) map.set(k, { inflow: 0, outflow: 0 }); return map.get(k); };

    clientAgg.forEach(r => { const b = ensure(r._id); b.inflow += r.inflow; });
    supplierAgg.forEach(r => { const b = ensure(r._id); b.outflow += r.outflow; });
    expenseAgg.forEach(r => { const b = ensure(r._id); b.outflow += r.outflow; });
    return map;
}

// GET /api/cash-accounts — list with balances
router.get('/', async (req, res) => {
    try {
        const { status } = req.query;
        const q = {};
        if (status === 'active') q.isActive = true;
        if (status === 'inactive') q.isActive = false;

        const accounts = await CashAccount.find(q).sort('-isActive name').lean();
        const balMap = await buildBalanceMap();

        const data = accounts.map(a => {
            const b = balMap.get(String(a._id)) || { inflow: 0, outflow: 0 };
            return {
                ...a,
                inflowPKR: b.inflow,
                outflowPKR: b.outflow,
                balancePKR: (a.openingBalancePKR || 0) + b.inflow - b.outflow
            };
        });

        const totalCashOnHand = data.filter(a => a.isActive).reduce((s, a) => s + a.balancePKR, 0);
        res.json({ success: true, data, totalCashOnHand, count: data.length });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// GET /api/cash-accounts/summary — for dashboard
router.get('/summary', async (req, res) => {
    try {
        const accounts = await CashAccount.find({ isActive: true }).lean();
        const balMap = await buildBalanceMap();
        let totalCashOnHand = 0;
        const byType = { cash: 0, bank: 0, wallet: 0, card: 0, other: 0 };
        accounts.forEach(a => {
            const b = balMap.get(String(a._id)) || { inflow: 0, outflow: 0 };
            const bal = (a.openingBalancePKR || 0) + b.inflow - b.outflow;
            totalCashOnHand += bal;
            byType[a.type] = (byType[a.type] || 0) + bal;
        });
        res.json({ success: true, data: { totalCashOnHand, byType, accountCount: accounts.length } });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// GET /api/cash-accounts/:id — with transaction feed
router.get('/:id', async (req, res) => {
    try {
        const acc = await CashAccount.findById(req.params.id).lean();
        if (!acc) return res.status(404).json({ success: false, message: 'Account not found' });

        const { dateFrom, dateTo, limit = 200 } = req.query;
        const oid = new mongoose.Types.ObjectId(req.params.id);
        const dateMatch = {};
        if (dateFrom || dateTo) {
            dateMatch.date = {};
            if (dateFrom) dateMatch.date.$gte = new Date(dateFrom);
            if (dateTo) { const e = new Date(dateTo); e.setHours(23, 59, 59, 999); dateMatch.date.$lte = e; }
        }

        const [clientRows, supplierRows, expenseRows] = await Promise.all([
            LedgerEntry.find({ cashAccount: oid, isActive: true, ...dateMatch })
                .populate('client', 'fullName companyName agentCode')
                .populate('package', 'voucherId')
                .lean(),
            SupplierLedger.find({ cashAccount: oid, ...dateMatch })
                .populate('supplier', 'name type')
                .populate('package', 'voucherId')
                .lean(),
            Expense.find({ cashAccount: oid, isActive: true, ...dateMatch }).lean()
        ]);

        // Normalize to a unified shape
        const txns = [
            ...clientRows.map(r => ({
                _id: r._id, source: 'client', type: r.type,
                direction: r.type === 'credit' ? 'in' : 'out', // credit on client ledger = client paid us
                date: r.date,
                party: r.client?.fullName || r.client?.companyName || '—',
                partyMeta: r.clientType,
                description: r.description,
                reference: r.referenceNumber,
                amount: r.amount, currency: r.currency, amountPKR: r.amountPKR ?? r.amount,
                linked: r.package?.voucherId
            })),
            ...supplierRows.map(r => ({
                _id: r._id, source: 'supplier', type: r.type,
                direction: r.type === 'credit' ? 'out' : 'in', // credit on supplier ledger = we paid them
                date: r.date,
                party: r.supplier?.name || '—',
                partyMeta: r.supplier?.type,
                description: r.description,
                reference: r.referenceNumber,
                amount: r.amount, currency: r.currency, amountPKR: r.amountPKR ?? r.amount,
                linked: r.package?.voucherId
            })),
            ...expenseRows.map(r => ({
                _id: r._id, source: 'expense', type: 'debit',
                direction: 'out',
                date: r.date,
                party: r.paidTo || r.category,
                partyMeta: r.category,
                description: r.description,
                reference: r.referenceNumber,
                amount: r.amount, currency: r.currency, amountPKR: r.amountPKR ?? r.amount,
                linked: null
            }))
        ];

        // Sort ascending then attach running balance
        txns.sort((a, b) => new Date(a.date) - new Date(b.date));
        let running = acc.openingBalancePKR || 0;
        txns.forEach(t => {
            running += t.direction === 'in' ? t.amountPKR : -t.amountPKR;
            t.runningBalancePKR = running;
        });
        // Then return newest first to the UI
        txns.reverse();
        const trimmed = txns.slice(0, parseInt(limit));

        // Summary across the entire (unfiltered) account
        const balMap = await buildBalanceMap();
        const b = balMap.get(String(acc._id)) || { inflow: 0, outflow: 0 };
        const totals = {
            inflowPKR: b.inflow,
            outflowPKR: b.outflow,
            balancePKR: (acc.openingBalancePKR || 0) + b.inflow - b.outflow
        };

        res.json({ success: true, data: { ...acc, ...totals, transactions: trimmed, transactionCount: txns.length } });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// POST /api/cash-accounts
router.post('/', async (req, res) => {
    try {
        req.body.createdBy = req.user._id;
        const a = await CashAccount.create(req.body);
        res.status(201).json({ success: true, data: a });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// PUT /api/cash-accounts/:id
router.put('/:id', async (req, res) => {
    try {
        req.body.updatedBy = req.user._id;
        const a = await CashAccount.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!a) return res.status(404).json({ success: false, message: 'Account not found' });
        res.json({ success: true, data: a });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// DELETE /api/cash-accounts/:id — soft (refuses if linked transactions exist)
router.delete('/:id', async (req, res) => {
    try {
        const [c1, c2, c3] = await Promise.all([
            LedgerEntry.countDocuments({ cashAccount: req.params.id }),
            SupplierLedger.countDocuments({ cashAccount: req.params.id }),
            Expense.countDocuments({ cashAccount: req.params.id })
        ]);
        const total = c1 + c2 + c3;
        if (total > 0) {
            // Soft delete only — preserve history
            const a = await CashAccount.findByIdAndUpdate(req.params.id, { isActive: false, updatedBy: req.user._id }, { new: true });
            if (!a) return res.status(404).json({ success: false, message: 'Account not found' });
            return res.json({ success: true, data: a, message: `Account deactivated (${total} linked transactions kept)` });
        }
        // Hard delete only when nothing references it
        const a = await CashAccount.findByIdAndDelete(req.params.id);
        if (!a) return res.status(404).json({ success: false, message: 'Account not found' });
        res.json({ success: true, message: 'Account deleted' });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

module.exports = router;
