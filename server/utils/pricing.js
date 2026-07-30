// The PKR sell price of a package.
//
// A "fixed"-source package (sold from the Fixed Package inventory) carries a
// hard PKR price that must NEVER be recomputed from the SAR exchange rate —
// it's a contracted amount. Every other package derives its PKR total from the
// SAR pricing at the current rate. Keeping this in one place ensures invoices,
// payment-before-travel alerts, and profit reports all agree.
function packageSellPKR(pkg, sarToPkr) {
    if (pkg?.source === 'fixed') return Math.round(pkg.pricingSummary?.finalPricePKR || 0);

    // Priced with per-item exchange rates: those rates were frozen onto the
    // package when it was costed, so bill the stored PKR total. Re-deriving it
    // from today's global rate would both ignore the per-item rates and change
    // the price of a package the client has already been quoted.
    if (pkg?.pricingSummary?.rateFrozen) return Math.round(pkg.pricingSummary.finalPricePKR || 0);

    // Legacy packages costed before per-item rates existed.
    return Math.round((pkg?.pricingSummary?.finalPriceSAR || 0) * (sarToPkr || 0));
}

// The same rule as a MongoDB aggregation expression, for report pipelines that
// sum many packages at once. Kept beside packageSellPKR so the two can't drift:
// if one changes, the other must.
function packageSellPKRExpr(sarToPkr) {
    return {
        $cond: [
            {
                $or: [
                    { $eq: ['$source', 'fixed'] },
                    { $eq: ['$pricingSummary.rateFrozen', true] }
                ]
            },
            { $ifNull: ['$pricingSummary.finalPricePKR', 0] },
            { $multiply: [{ $ifNull: ['$pricingSummary.finalPriceSAR', 0] }, sarToPkr || 0] }
        ]
    };
}

module.exports = { packageSellPKR, packageSellPKRExpr };
