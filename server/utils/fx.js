// Currency conversion for money entries — one definition, used by the client
// ledger, the supplier ledger and expenses.
//
// This lived as three separate copies of the same two lines, which is exactly
// how the reports drifted apart earlier: fix one, miss another.
//
// The important rule: a SAR entry converts at the rate THAT ENTRY was agreed
// at, not automatically the global one. The global rate is what riyals are
// bought at; every client and supplier deals at their own rate, so the figure
// has to be settable per entry. Blank means "use the global rate", which keeps
// existing behaviour for anyone who doesn't need the override.

const toPKR = (amount, currency, rate) =>
    currency === 'SAR' ? Number(amount) * rate : Number(amount);

// Explicit override when it is a sane positive number, otherwise the global
// rate. Zero, negative, empty and garbage all fall back rather than posting a
// zero-value entry.
const resolveEntryRate = (body, globalRate) => {
    const override = Number(body?.exchangeRate);
    return Number.isFinite(override) && override > 0 ? override : globalRate;
};

// Apply both to a request body in place, and record the rate used so the entry
// can be explained later and never re-derived from a rate that has since moved.
// Returns the rate applied.
function applyEntryFx(body, globalRate) {
    const currency = body.currency || 'PKR';
    const rate = resolveEntryRate(body, globalRate);
    body.amountPKR = toPKR(body.amount, currency, rate);
    body.exchangeRate = currency === 'SAR' ? rate : undefined;
    return rate;
}

module.exports = { toPKR, resolveEntryRate, applyEntryFx };
