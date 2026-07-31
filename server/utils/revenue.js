const Package = require('../models/Package');
const LedgerEntry = require('../models/LedgerEntry');
const { packageSellPKRExpr } = require('./pricing');

// Booked (accrual) revenue for a window, in PKR.
//
// Revenue arrives two ways in this CRM and BOTH have to count:
//
//   1. a package — built in Package Maker or sold from fixed inventory
//   2. a charge raised straight onto a client's ledger, with no package behind
//      it (selling a couple of tickets, a visa, a hotel-only booking)
//
// Counting only packages made every ledger-only sale invisible: the supplier
// cost still landed in COGS, so a profitable month reported as a pure loss.
//
// Charges that ARE linked to a package are excluded here, because that package
// is already counted in (1) — including them would double-count the same sale.
// Refunds and adjustments are money corrections, not sales, so they are out.
//
// Every screen that reports revenue — the dashboard, the P&L and the month-end
// closing — goes through this one function, so they cannot disagree.

const NON_REVENUE_CATEGORIES = ['refund', 'adjustment'];

function windowMatch(from, to) {
    if (!from && !to) return {};
    const range = {};
    if (from) range.$gte = from;
    if (to) range.$lt = to;
    return range;
}

async function bookedRevenuePKR({ from, to, rate }) {
    const pkgMatch = { isActive: true, status: { $in: ['confirmed', 'completed'] } };
    const range = windowMatch(from, to);
    if (Object.keys(range).length) pkgMatch.createdAt = range;

    const ledgerMatch = {
        isActive: true,
        type: 'debit',
        // null also matches documents where the field is absent.
        package: null,
        category: { $nin: NON_REVENUE_CATEGORIES }
    };
    if (Object.keys(range).length) ledgerMatch.date = range;

    const [pkgAgg, directAgg] = await Promise.all([
        Package.aggregate([
            { $match: pkgMatch },
            { $group: { _id: null, total: { $sum: packageSellPKRExpr(rate) }, count: { $sum: 1 } } }
        ]),
        LedgerEntry.aggregate([
            { $match: ledgerMatch },
            { $group: { _id: null, total: { $sum: { $ifNull: ['$amountPKR', '$amount'] } }, count: { $sum: 1 } } }
        ])
    ]);

    const packagePKR = Math.round(pkgAgg[0]?.total || 0);
    const directPKR = Math.round(directAgg[0]?.total || 0);

    return {
        totalPKR: packagePKR + directPKR,
        packagePKR,
        directPKR,
        packageCount: pkgAgg[0]?.count || 0,
        directCount: directAgg[0]?.count || 0
    };
}

// Same rule, grouped by calendar month — for the P&L trend chart.
async function monthlyBookedRevenuePKR({ from, to, rate }) {
    const [pkgRows, directRows] = await Promise.all([
        Package.aggregate([
            { $match: { isActive: true, status: { $in: ['confirmed', 'completed'] }, createdAt: { $gte: from, $lt: to } } },
            { $group: { _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } }, total: { $sum: packageSellPKRExpr(rate) } } }
        ]),
        LedgerEntry.aggregate([
            { $match: { isActive: true, type: 'debit', package: null, category: { $nin: NON_REVENUE_CATEGORIES }, date: { $gte: from, $lt: to } } },
            { $group: { _id: { y: { $year: '$date' }, m: { $month: '$date' } }, total: { $sum: { $ifNull: ['$amountPKR', '$amount'] } } } }
        ])
    ]);

    const out = {};
    for (const rows of [pkgRows, directRows]) {
        for (const r of rows) {
            const key = `${r._id.y}-${String(r._id.m).padStart(2, '0')}`;
            out[key] = (out[key] || 0) + Math.round(r.total || 0);
        }
    }
    return out;
}

module.exports = { bookedRevenuePKR, monthlyBookedRevenuePKR, NON_REVENUE_CATEGORIES };
