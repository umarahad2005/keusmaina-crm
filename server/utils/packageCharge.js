const LedgerEntry = require('../models/LedgerEntry');
const CurrencySettings = require('../models/CurrencySettings');
const { packageSellPKR } = require('./pricing');

// Raise the client's receivable for a sold package.
//
// Selling a package used to create the package and, for fixed inventory, the
// supplier payable — but never the charge to the client. The invoice showed a
// total due while the client's ledger showed they owed nothing, so somebody had
// to type the charge in by hand and remember to link it to the package. Miss
// that and the receivable, the statement and the payment history all disagree
// with the invoice.
//
// The charge is created the moment a package becomes a real sale, linked to the
// package, so payments recorded later land against it.
//
// Idempotent: a package has at most one auto-raised charge. Calling this again
// (status edited, package updated, bulk action re-run) will not duplicate it.

// Statuses that mean the client has actually bought. Draft and quoted are
// proposals — raising a receivable for those would invent debt.
const SOLD_STATUSES = ['confirmed', 'deposit_received', 'fully_paid', 'completed'];

const isSold = (status) => SOLD_STATUSES.includes(status);

async function ensurePackageCharge(pkg, userId) {
    if (!pkg || !isSold(pkg.status) || pkg.isActive === false) return null;
    // A package with no client can't owe anything yet.
    if (!pkg.client || !pkg.clientModel || !pkg.clientType) return null;

    const currency = await CurrencySettings.getRate();
    const amountPKR = packageSellPKR(pkg, currency.sarToPkr);
    if (!(amountPKR > 0)) return null;

    const existing = await LedgerEntry.findOne({
        package: pkg._id,
        type: 'debit',
        category: 'package_sale',
        isActive: true
    });

    if (existing) {
        // The price can still change while nothing has been paid — a corrected
        // markup, a different room type. Once any payment has landed the charge
        // is left alone: silently rewriting an amount the client has already
        // paid against would make their statement impossible to follow.
        if (Math.round(existing.amountPKR ?? existing.amount) === amountPKR) return existing;

        const paid = await LedgerEntry.countDocuments({ package: pkg._id, type: 'credit', isActive: true });
        if (paid > 0) return existing;

        existing.amount = amountPKR;
        existing.amountPKR = amountPKR;
        existing.currency = 'PKR';
        existing.description = `Package ${pkg.voucherId || ''} — ${pkg.packageName || 'sale'} (${pkg.numberOfPilgrims || 1} pax)`.trim();
        existing.updatedBy = userId;
        await existing.save();
        return existing;
    }

    return LedgerEntry.create({
        client: pkg.client,
        clientModel: pkg.clientModel,
        clientType: pkg.clientType,
        package: pkg._id,
        voucherId: pkg.voucherId,
        departure: pkg.departure || undefined,
        type: 'debit',
        amount: amountPKR,
        currency: 'PKR',
        amountPKR,
        category: 'package_sale',
        date: new Date(),
        description: `Package ${pkg.voucherId || ''} — ${pkg.packageName || 'sale'} (${pkg.numberOfPilgrims || 1} pax)`.trim(),
        createdBy: userId
    });
}

module.exports = { ensurePackageCharge, SOLD_STATUSES, isSold };
