const express = require('express');
const Package = require('../models/Package');
const ClientB2C = require('../models/ClientB2C');
const ClientB2B = require('../models/ClientB2B');
const LedgerEntry = require('../models/LedgerEntry');
const SupplierLedger = require('../models/SupplierLedger');
const Expense = require('../models/Expense');
const CashAccount = require('../models/CashAccount');
const CurrencySettings = require('../models/CurrencySettings');
const Airline = require('../models/Airline');
const HotelMakkah = require('../models/HotelMakkah');
const HotelMadinah = require('../models/HotelMadinah');
const { protect } = require('../middleware/auth');
const router = express.Router();

router.use(protect);

// @route   GET /api/reports/overview
// @desc    Dashboard overview stats
router.get('/overview', async (req, res) => {
    try {
        const [packages, b2cClients, b2bClients, airlines, hotelsMakkah, hotelsMadinah] = await Promise.all([
            Package.countDocuments({ isActive: true }),
            ClientB2C.countDocuments({ isActive: true }),
            ClientB2B.countDocuments({ isActive: true }),
            Airline.countDocuments({ isActive: true }),
            HotelMakkah.countDocuments({ isActive: true }),
            HotelMadinah.countDocuments({ isActive: true })
        ]);

        // Revenue & outstanding from ledger
        const ledgerSummary = await LedgerEntry.aggregate([
            { $match: { isActive: true } },
            {
                $group: {
                    _id: null,
                    totalDebit: { $sum: { $cond: [{ $eq: ['$type', 'debit'] }, '$amount', 0] } },
                    totalCredit: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0] } }
                }
            }
        ]);

        const revenue = ledgerSummary[0]?.totalCredit || 0;
        const outstanding = (ledgerSummary[0]?.totalDebit || 0) - revenue;

        // Package by type
        const packageByType = await Package.aggregate([
            { $match: { isActive: true } },
            { $group: { _id: '$packageType', count: { $sum: 1 } } }
        ]);

        // Package by status
        const packageByStatus = await Package.aggregate([
            { $match: { isActive: true } },
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);

        // Monthly revenue (last 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const monthlyRevenue = await LedgerEntry.aggregate([
            { $match: { isActive: true, type: 'credit', date: { $gte: sixMonthsAgo } } },
            {
                $group: {
                    _id: { year: { $year: '$date' }, month: { $month: '$date' } },
                    total: { $sum: '$amount' }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);

        res.json({
            success: true,
            data: {
                counts: { packages, b2cClients, b2bClients, airlines, hotelsMakkah, hotelsMadinah },
                financial: { revenue, outstanding },
                packageByType,
                packageByStatus,
                monthlyRevenue
            }
        });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// ──────────────────────────────────────────────────────────
// P&L roll-up
// Revenue (booked from packages), COGS (supplier debits), Opex (expenses)
// over a date range. Booked revenue uses package createdAt as the period
// anchor; all PKR conversion is at today's rate so old records don't drift.
// ──────────────────────────────────────────────────────────
router.get('/pnl', async (req, res) => {
    try {
        const now = new Date();
        const defaultFrom = new Date(now.getFullYear(), 0, 1); // Jan 1 of current year
        const from = req.query.from ? new Date(req.query.from) : defaultFrom;
        const to = req.query.to ? new Date(req.query.to) : new Date(now.getFullYear() + 1, 0, 1);

        const currency = await CurrencySettings.getRate();
        const rate = currency.sarToPkr;

        // ── Revenue ─────────────────────────────
        // Booked revenue from confirmed/completed packages created in window.
        // Convert SAR → PKR at today's rate.
        const bookedAgg = await Package.aggregate([
            { $match: { isActive: true, status: { $in: ['confirmed', 'completed'] }, createdAt: { $gte: from, $lt: to } } },
            { $group: { _id: null, sumSAR: { $sum: '$pricingSummary.finalPriceSAR' }, count: { $sum: 1 } } }
        ]);
        const bookedSAR = bookedAgg[0]?.sumSAR || 0;
        const bookedPKR = Math.round(bookedSAR * rate);
        const bookedCount = bookedAgg[0]?.count || 0;

        // Cash received = client ledger credits in window. Mixed currency:
        // PKR amounts pass through, SAR amounts convert at today's rate.
        const cashAgg = await LedgerEntry.aggregate([
            { $match: { isActive: true, type: 'credit', date: { $gte: from, $lt: to } } },
            { $group: {
                _id: '$currency',
                total: { $sum: '$amount' },
                count: { $sum: 1 }
            } }
        ]);
        let cashReceivedPKR = 0;
        for (const r of cashAgg) {
            cashReceivedPKR += r._id === 'SAR' ? r.total * rate : r.total;
        }
        cashReceivedPKR = Math.round(cashReceivedPKR);

        // ── COGS (supplier ledger debits = invoices received) ──
        const cogsAgg = await SupplierLedger.aggregate([
            { $match: { type: 'debit', date: { $gte: from, $lt: to } } },
            { $group: { _id: null, total: { $sum: '$amountPKR' }, count: { $sum: 1 } } }
        ]);
        const cogsInvoicedPKR = Math.round(cogsAgg[0]?.total || 0);

        const cogsPaidAgg = await SupplierLedger.aggregate([
            { $match: { type: 'credit', date: { $gte: from, $lt: to } } },
            { $group: { _id: null, total: { $sum: '$amountPKR' } } }
        ]);
        const cogsPaidPKR = Math.round(cogsPaidAgg[0]?.total || 0);

        // ── Opex (expenses) ──
        const opexAgg = await Expense.aggregate([
            { $match: { isActive: true, date: { $gte: from, $lt: to } } },
            { $group: { _id: null, total: { $sum: '$amountPKR' }, count: { $sum: 1 } } }
        ]);
        const opexTotalPKR = Math.round(opexAgg[0]?.total || 0);
        const opexCount = opexAgg[0]?.count || 0;

        const opexByCat = await Expense.aggregate([
            { $match: { isActive: true, date: { $gte: from, $lt: to } } },
            { $group: { _id: '$category', total: { $sum: '$amountPKR' }, count: { $sum: 1 } } },
            { $sort: { total: -1 } }
        ]);

        // ── Net profit (accrual basis: booked − invoiced cogs − opex) ──
        const netProfitPKR = bookedPKR - cogsInvoicedPKR - opexTotalPKR;
        const grossProfitPKR = bookedPKR - cogsInvoicedPKR;
        const grossMarginPct = bookedPKR > 0 ? Math.round((grossProfitPKR / bookedPKR) * 1000) / 10 : 0;
        const netMarginPct = bookedPKR > 0 ? Math.round((netProfitPKR / bookedPKR) * 1000) / 10 : 0;

        // Net cash flow (cash received − cogs paid − opex)
        const netCashFlowPKR = cashReceivedPKR - cogsPaidPKR - opexTotalPKR;

        // ── 12-month series (rolling, ending at `to`) ──
        const seriesStart = new Date(to);
        seriesStart.setMonth(seriesStart.getMonth() - 12);
        seriesStart.setDate(1);
        seriesStart.setHours(0, 0, 0, 0);

        const monthlyBooked = await Package.aggregate([
            { $match: { isActive: true, status: { $in: ['confirmed', 'completed'] }, createdAt: { $gte: seriesStart, $lt: to } } },
            { $group: {
                _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } },
                sumSAR: { $sum: '$pricingSummary.finalPriceSAR' }
            } }
        ]);
        const monthlyCogs = await SupplierLedger.aggregate([
            { $match: { type: 'debit', date: { $gte: seriesStart, $lt: to } } },
            { $group: { _id: { y: { $year: '$date' }, m: { $month: '$date' } }, total: { $sum: '$amountPKR' } } }
        ]);
        const monthlyOpex = await Expense.aggregate([
            { $match: { isActive: true, date: { $gte: seriesStart, $lt: to } } },
            { $group: { _id: { y: { $year: '$date' }, m: { $month: '$date' } }, total: { $sum: '$amountPKR' } } }
        ]);

        const keyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const lookup = (arr, valueKey, mult = 1) => Object.fromEntries(arr.map(x => [`${x._id.y}-${String(x._id.m).padStart(2, '0')}`, Math.round((x[valueKey] || 0) * mult)]));
        const bookedMap = lookup(monthlyBooked, 'sumSAR', rate);
        const cogsMap = lookup(monthlyCogs, 'total');
        const opexMap = lookup(monthlyOpex, 'total');

        const series = [];
        const cursor = new Date(seriesStart);
        while (cursor < to) {
            const k = keyOf(cursor);
            const rev = bookedMap[k] || 0;
            const cogs = cogsMap[k] || 0;
            const op = opexMap[k] || 0;
            series.push({ month: k, revenuePKR: rev, cogsPKR: cogs, opexPKR: op, netPKR: rev - cogs - op });
            cursor.setMonth(cursor.getMonth() + 1);
        }

        res.json({
            success: true,
            data: {
                period: { from, to },
                revenue: { bookedSAR, bookedPKR, bookedCount, cashReceivedPKR },
                cogs: { invoicedPKR: cogsInvoicedPKR, paidPKR: cogsPaidPKR },
                opex: { totalPKR: opexTotalPKR, count: opexCount, byCategory: opexByCat.map(c => ({ category: c._id, total: Math.round(c.total), count: c.count })) },
                grossProfitPKR, grossMarginPct,
                netProfitPKR, netMarginPct,
                netCashFlowPKR,
                series
            }
        });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// @route   GET /api/reports/accounts-dashboard
// @desc    Snapshot for the Accounts landing page
router.get('/accounts-dashboard', async (req, res) => {
    try {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        // ── 1. Receivables (clients owe us) ─────────────────────────────
        const clientAgg = await LedgerEntry.aggregate([
            { $match: { isActive: true } },
            {
                $group: {
                    _id: { client: '$client', clientModel: '$clientModel', clientType: '$clientType' },
                    debit: { $sum: { $cond: [{ $eq: ['$type', 'debit'] }, { $ifNull: ['$amountPKR', '$amount'] }, 0] } },
                    credit: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, { $ifNull: ['$amountPKR', '$amount'] }, 0] } },
                    lastEntry: { $max: '$date' }
                }
            }
        ]);
        const receivables = clientAgg
            .map(c => ({
                clientId: c._id.client, clientType: c._id.clientType, clientModel: c._id.clientModel,
                balancePKR: c.debit - c.credit, lastEntry: c.lastEntry
            }))
            .filter(c => c.balancePKR > 0);
        const totalReceivablePKR = receivables.reduce((s, c) => s + c.balancePKR, 0);

        // Resolve top-5 unpaid client names
        const topReceivables = [...receivables].sort((a, b) => b.balancePKR - a.balancePKR).slice(0, 5);
        const b2cIds = topReceivables.filter(c => c.clientType === 'B2C').map(c => c.clientId);
        const b2bIds = topReceivables.filter(c => c.clientType === 'B2B').map(c => c.clientId);
        const [b2cClients, b2bClients] = await Promise.all([
            ClientB2C.find({ _id: { $in: b2cIds } }).select('fullName phone').lean(),
            ClientB2B.find({ _id: { $in: b2bIds } }).select('companyName agentCode phone').lean()
        ]);
        const b2cMap = new Map(b2cClients.map(c => [String(c._id), c]));
        const b2bMap = new Map(b2bClients.map(c => [String(c._id), c]));
        const topReceivablesNamed = topReceivables.map(c => {
            const src = c.clientType === 'B2C' ? b2cMap.get(String(c.clientId)) : b2bMap.get(String(c.clientId));
            return {
                ...c,
                name: src?.fullName || src?.companyName || '—',
                meta: c.clientType === 'B2B' ? src?.agentCode : src?.phone
            };
        });

        // ── 2. Payables (we owe suppliers) ──────────────────────────────
        const Supplier = require('../models/Supplier');
        const suppliers = await Supplier.find({ isActive: true }).select('name type openingBalancePKR').lean();
        const supAgg = await SupplierLedger.aggregate([
            {
                $group: {
                    _id: '$supplier',
                    debit: { $sum: { $cond: [{ $eq: ['$type', 'debit'] }, { $ifNull: ['$amountPKR', '$amount'] }, 0] } },
                    credit: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, { $ifNull: ['$amountPKR', '$amount'] }, 0] } }
                }
            }
        ]);
        const supMap = new Map(supAgg.map(s => [String(s._id), s]));
        const payables = suppliers.map(s => {
            const m = supMap.get(String(s._id)) || { debit: 0, credit: 0 };
            const balance = (s.openingBalancePKR || 0) + m.debit - m.credit;
            return { supplierId: s._id, name: s.name, type: s.type, balancePKR: balance };
        }).filter(s => s.balancePKR > 0);
        const totalPayablePKR = payables.reduce((s, p) => s + p.balancePKR, 0);
        const topPayables = [...payables].sort((a, b) => b.balancePKR - a.balancePKR).slice(0, 5);

        // ── 3. Cash on hand ─────────────────────────────────────────────
        const accounts = await CashAccount.find({ isActive: true }).lean();
        const accountIds = accounts.map(a => a._id);
        const [cashClient, cashSup, cashExp] = await Promise.all([
            LedgerEntry.aggregate([
                { $match: { isActive: true, cashAccount: { $in: accountIds } } },
                { $group: { _id: '$cashAccount', inflow: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, { $ifNull: ['$amountPKR', '$amount'] }, 0] } } } }
            ]),
            SupplierLedger.aggregate([
                { $match: { cashAccount: { $in: accountIds } } },
                { $group: { _id: '$cashAccount', outflow: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, { $ifNull: ['$amountPKR', '$amount'] }, 0] } } } }
            ]),
            Expense.aggregate([
                { $match: { isActive: true, cashAccount: { $in: accountIds } } },
                { $group: { _id: '$cashAccount', outflow: { $sum: { $ifNull: ['$amountPKR', '$amount'] } } } }
            ])
        ]);
        const accBal = new Map(accounts.map(a => [String(a._id), { ...a, inflow: 0, outflow: 0 }]));
        cashClient.forEach(r => { const x = accBal.get(String(r._id)); if (x) x.inflow += r.inflow; });
        cashSup.forEach(r => { const x = accBal.get(String(r._id)); if (x) x.outflow += r.outflow; });
        cashExp.forEach(r => { const x = accBal.get(String(r._id)); if (x) x.outflow += r.outflow; });
        const cashByAccount = Array.from(accBal.values()).map(a => ({
            _id: a._id, name: a.name, type: a.type,
            balancePKR: (a.openingBalancePKR || 0) + a.inflow - a.outflow
        }));
        const totalCashOnHand = cashByAccount.reduce((s, a) => s + a.balancePKR, 0);

        // ── 4. This-month P&L snapshot ──────────────────────────────────
        const [monthIn, monthSupOut, monthExpOut] = await Promise.all([
            LedgerEntry.aggregate([
                { $match: { isActive: true, type: 'credit', date: { $gte: monthStart } } },
                { $group: { _id: null, total: { $sum: { $ifNull: ['$amountPKR', '$amount'] } } } }
            ]),
            SupplierLedger.aggregate([
                { $match: { type: 'credit', date: { $gte: monthStart } } },
                { $group: { _id: null, total: { $sum: { $ifNull: ['$amountPKR', '$amount'] } } } }
            ]),
            Expense.aggregate([
                { $match: { isActive: true, date: { $gte: monthStart } } },
                { $group: { _id: null, total: { $sum: { $ifNull: ['$amountPKR', '$amount'] } } } }
            ])
        ]);
        const monthCashIn = monthIn[0]?.total || 0;
        const monthSupplierPaid = monthSupOut[0]?.total || 0;
        const monthExpenses = monthExpOut[0]?.total || 0;
        const monthNet = monthCashIn - monthSupplierPaid - monthExpenses;

        // ── 5. Recent transactions feed (last 10 across all sources) ────
        const recentLimit = 10;
        const [rxClient, rxSup, rxExp] = await Promise.all([
            LedgerEntry.find({ isActive: true }).sort('-date -createdAt').limit(recentLimit)
                .populate('client', 'fullName companyName').populate('cashAccount', 'name').lean(),
            SupplierLedger.find({}).sort('-date -createdAt').limit(recentLimit)
                .populate('supplier', 'name').populate('cashAccount', 'name').lean(),
            Expense.find({ isActive: true }).sort('-date -createdAt').limit(recentLimit)
                .populate('cashAccount', 'name').lean()
        ]);
        const recent = [
            ...rxClient.map(r => ({
                _id: r._id, source: 'client', date: r.date,
                direction: r.type === 'credit' ? 'in' : 'out',
                party: r.client?.fullName || r.client?.companyName || '—',
                description: r.description,
                amountPKR: r.amountPKR ?? r.amount,
                account: r.cashAccount?.name
            })),
            ...rxSup.map(r => ({
                _id: r._id, source: 'supplier', date: r.date,
                direction: r.type === 'credit' ? 'out' : 'invoice',
                party: r.supplier?.name || '—',
                description: r.description,
                amountPKR: r.amountPKR ?? r.amount,
                account: r.cashAccount?.name
            })),
            ...rxExp.map(r => ({
                _id: r._id, source: 'expense', date: r.date,
                direction: 'out',
                party: r.paidTo || r.category,
                description: r.description,
                amountPKR: r.amountPKR ?? r.amount,
                account: r.cashAccount?.name
            }))
        ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, recentLimit);

        // Net position = AR + Cash − AP
        const netPositionPKR = totalReceivablePKR + totalCashOnHand - totalPayablePKR;

        res.json({
            success: true,
            data: {
                kpis: {
                    totalReceivablePKR,
                    totalPayablePKR,
                    totalCashOnHand,
                    netPositionPKR,
                    receivableClientCount: receivables.length,
                    payableSupplierCount: payables.length,
                    activeAccountCount: accounts.length
                },
                month: {
                    cashInPKR: monthCashIn,
                    supplierPaidPKR: monthSupplierPaid,
                    expensesPKR: monthExpenses,
                    netPKR: monthNet
                },
                cashByAccount,
                topReceivables: topReceivablesNamed,
                topPayables,
                recentTransactions: recent
            }
        });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

module.exports = router;
