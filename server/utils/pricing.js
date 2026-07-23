// The PKR sell price of a package.
//
// A "fixed"-source package (sold from the Fixed Package inventory) carries a
// hard PKR price that must NEVER be recomputed from the SAR exchange rate —
// it's a contracted amount. Every other package derives its PKR total from the
// SAR pricing at the current rate. Keeping this in one place ensures invoices,
// payment-before-travel alerts, and profit reports all agree.
function packageSellPKR(pkg, sarToPkr) {
    if (pkg?.source === 'fixed') return Math.round(pkg.pricingSummary?.finalPricePKR || 0);
    return Math.round((pkg?.pricingSummary?.finalPriceSAR || 0) * (sarToPkr || 0));
}

module.exports = { packageSellPKR };
