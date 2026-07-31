const express = require('express');
const mongoose = require('mongoose');
const CashAccount = require('../models/CashAccount');
const LedgerEntry = require('../models/LedgerEntry');
const SupplierLedger = require('../models/SupplierLedger');
const Expense = require('../models/Expense');
const CashTransfer = require('../models/CashTransfer');
const { protect, authorize } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/auditLog');
const router = express.Router();

router.use(protect);
router.use(auditMiddleware('CashAccount'));

// Sum up movements per account across all three transaction sources.
//
// Canonical cash rule (must stay identical to the transaction feed in GET /:id
// and to the dashboard in routes/reports.js):
//   An entry moves cash only when it points at a cashAccount.
//     • Client ledger:  credit = client paid us  → inflow
//                       debit  = paid to client (refund/payout) → outflow
//     • Supplier ledger: credit = we paid them    → outflow
//                        debit  = supplier refunded us (rare) → inflow
//     • Expense:        always → outflow
async function buildBalanceMap() {
    const [clientAgg, supplierAgg, expenseAgg] = await Promise.all([
        LedgerEntry.aggregate([
            { $match: { isActive: true, cashAccount: { $ne: null } } },
            {
                $group: {
                    _id: '$cashAccount',
                    inflow: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, { $ifNull: ['$amountPKR', '$amount'] }, 0] } },
                    outflow: { $sum: { $cond: [{ $eq: ['$type', 'debit'] }, { $ifNull: ['$amountPKR', '$amount'] }, 0] } }
                }
            }
        ]),
        SupplierLedger.aggregate([
            { $match: { cashAccount: { $ne: null } } },
            {
                $group: {
                    _id: '$cashAccount',
                    outflow: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, { $ifNull: ['$amountPKR', '$amount'] }, 0] } },
                    inflow: { $sum: { $cond: [{ $eq: ['$type', 'debit'] }, { $ifNull: ['$amountPKR', '$amount'] }, 0] } }
                }
            }
        ]),
        Expense.aggregate([
            { $match: { isActive: true, cashAccount: { $ne: null } } },
            { $group: { _id: '$cashAccount', outflow: { $sum: { $ifNull: ['$amountPKR', '$amount'] } } } }
        ])
    ]);

    // Internal transfers move money between our own accounts: out of one, into
    // the other. They are NOT income or expense, which is exactly why they live
    // in their own collection and never touch the profit reports.
    const [transferOut, transferIn] = await Promise.all([
        CashTransfer.aggregate([
            { $match: { isActive: true } },
            { $group: { _id: '$fromAccount', outflow: { $sum: '$amountPKR' } } }
        ]),
        CashTransfer.aggregate([
            { $match: { isActive: true } },
            { $group: { _id: '$toAccount', inflow: { $sum: '$amountPKR' } } }
        ])
    ]);

    const map = new Map();
    const ensure = (id) => { const k = String(id); if (!map.has(k)) map.set(k, { inflow: 0, outflow: 0 }); return map.get(k); };

    clientAgg.forEach(r => { const b = ensure(r._id); b.inflow += r.inflow; b.outflow += r.outflow; });
    supplierAgg.forEach(r => { const b = ensure(r._id); b.outflow += r.outflow; b.inflow += r.inflow; });
    expenseAgg.forEach(r => { const b = ensure(r._id); b.outflow += r.outflow; });
    transferOut.forEach(r => { const b = ensure(r._id); b.outflow += r.outflow; });
    transferIn.forEach(r => { const b = ensure(r._id); b.inflow += r.inflow; });
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

        const [clientRows, supplierRows, expenseRows, transferRows] = await Promise.all([
            LedgerEntry.find({ cashAccount: oid, isActive: true, ...dateMatch })
                .populate('client', 'fullName companyName agentCode')
                .populate('package', 'voucherId')
                .lean(),
            SupplierLedger.find({ cashAccount: oid, ...dateMatch })
                .populate('supplier', 'name type')
                .populate('package', 'voucherId')
                .lean(),
            Expense.find({ cashAccount: oid, isActive: true, ...dateMatch }).lean(),
            CashTransfer.find({ isActive: true, $or: [{ fromAccount: oid }, { toAccount: oid }], ...dateMatch })
                .populate('fromAccount', 'name type')
                .populate('toAccount', 'name type')
                .lean()
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
            })),
            // One transfer produces one row per account it touches: an outflow
            // on the source, an inflow on the destination.
            ...transferRows.map(r => {
                const outgoing = String(r.fromAccount?._id || r.fromAccount) === String(oid);
                const other = outgoing ? r.toAccount : r.fromAccount;
                return {
                    _id: r._id, source: 'transfer', type: outgoing ? 'debit' : 'credit',
                    direction: outgoing ? 'out' : 'in',
                    date: r.date,
                    party: other?.name || '—',
                    partyMeta: outgoing ? 'transferred to' : 'transferred from',
                    description: r.description || (outgoing ? `Transfer to ${other?.name || 'account'}` : `Transfer from ${other?.name || 'account'}`),
                    reference: r.referenceNumber,
                    amount: r.amountPKR, currency: 'PKR', amountPKR: r.amountPKR,
                    linked: null
                };
            })
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

// Managing accounts (create / edit / delete) is restricted to finance roles.
// Reading (the GET routes above) stays open to any signed-in user so that e.g.
// a sales user can pick which account a client payment landed in.
const FINANCE_ROLES = ['admin', 'accounts'];

// POST /api/cash-accounts
// ── Internal transfers ────────────────────────────────────────────────────
// Moving our own money between our own accounts: a bank withdrawal into the
// cash drawer, a cash deposit into a bank, or bank to bank. It changes where
// the money sits, not how much of it there is — so it must never appear as
// income or expense, or every withdrawal would inflate the P&L and the
// partners' share along with it.

// GET /api/cash-accounts/transfers — history
router.get('/transfers/list', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 100, 300);
        const q = { isActive: true };
        if (req.query.account) {
            q.$or = [{ fromAccount: req.query.account }, { toAccount: req.query.account }];
        }
        const items = await CashTransfer.find(q)
            .sort('-date -createdAt')
            .limit(limit)
            .populate('fromAccount', 'name type')
            .populate('toAccount', 'name type')
            .populate('createdBy', 'name')
            .lean();
        res.json({ success: true, data: items, count: items.length });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// POST /api/cash-accounts/transfers — record a transfer
router.post('/transfers', authorize(...FINANCE_ROLES), async (req, res) => {
    try {
        const amountPKR = Math.round(Number(req.body.amountPKR ?? req.body.amount) || 0);
        if (!(amountPKR > 0)) {
            return res.status(400).json({ success: false, message: 'Enter an amount greater than zero' });
        }
        const { fromAccount, toAccount } = req.body;
        if (!fromAccount || !toAccount) {
            return res.status(400).json({ success: false, message: 'Select both the source and destination account' });
        }
        if (String(fromAccount) === String(toAccount)) {
            return res.status(400).json({ success: false, message: 'The destination account must be different from the source account' });
        }

        const [src, dst] = await Promise.all([
            CashAccount.findById(fromAccount).lean(),
            CashAccount.findById(toAccount).lean()
        ]);
        if (!src || src.isActive === false) return res.status(400).json({ success: false, message: 'Source account not found' });
        if (!dst || dst.isActive === false) return res.status(400).json({ success: false, message: 'Destination account not found' });

        // You cannot withdraw money an account does not hold. Catching it here
        // keeps a mistyped amount from pushing an account negative, which would
        // quietly corrupt the cash position.
        const balances = await buildBalanceMap();
        const b = balances.get(String(src._id)) || { inflow: 0, outflow: 0 };
        const available = (src.openingBalancePKR || 0) + b.inflow - b.outflow;
        if (amountPKR > available) {
            return res.status(400).json({
                success: false,
                message: `${src.name} only holds PKR ${Math.round(available).toLocaleString()}. Transfer that or less.`
            });
        }

        const transfer = await CashTransfer.create({
            fromAccount, toAccount, amountPKR,
            date: req.body.date || new Date(),
            referenceNumber: req.body.referenceNumber,
            description: req.body.description || `Transfer from ${src.name} to ${dst.name}`,
            notes: req.body.notes,
            createdBy: req.user._id
        });
        const populated = await CashTransfer.findById(transfer._id)
            .populate('fromAccount', 'name type')
            .populate('toAccount', 'name type');
        res.status(201).json({ success: true, data: populated });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// DELETE /api/cash-accounts/transfers/:id — reverse a transfer
router.delete('/transfers/:id', authorize(...FINANCE_ROLES), async (req, res) => {
    try {
        const t = await CashTransfer.findById(req.params.id);
        if (!t || t.isActive === false) return res.status(404).json({ success: false, message: 'Transfer not found' });
        t.isActive = false;
        t.updatedBy = req.user._id;
        await t.save();
        res.json({ success: true, message: 'Transfer reversed' });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/', authorize(...FINANCE_ROLES), async (req, res) => {
    try {
        const body = { ...req.body, createdBy: req.user._id };
        delete body.updatedBy;
        const a = await CashAccount.create(body);
        res.status(201).json({ success: true, data: a });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// PUT /api/cash-accounts/:id
router.put('/:id', authorize(...FINANCE_ROLES), async (req, res) => {
    try {
        const body = { ...req.body, updatedBy: req.user._id };
        // Fields that must never be overwritten from the request body.
        delete body.createdBy;
        // The opening balance directly shifts cash-on-hand, so only an admin may
        // change it after the account is created — an accounts user editing the
        // name/notes can't silently move the books.
        if (req.user.role !== 'admin') delete body.openingBalancePKR;
        const a = await CashAccount.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
        if (!a) return res.status(404).json({ success: false, message: 'Account not found' });
        res.json({ success: true, data: a });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// DELETE /api/cash-accounts/:id — soft (refuses if linked transactions exist)
router.delete('/:id', authorize(...FINANCE_ROLES), async (req, res) => {
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
