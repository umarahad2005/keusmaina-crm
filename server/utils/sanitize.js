// Shared request-sanitization helpers used across all routes.
//
// These close a family of loopholes found in the security audit:
//   • operator injection  — ?field[$ne]= turning a string filter into an object
//   • unbounded queries    — ?limit=100000000 forcing a huge scan on serverless
//   • regex injection/ReDoS — raw user input dropped into $regex
//   • mass assignment      — client setting fields it must never control
//     (isActive, reconciled, amountPKR, pricingSummary, createdBy, …)

// Coerce a query param to a plain string. Express's default parser (qs) will
// happily build { $ne: '' } from ?type[$ne]= — forcing a string kills that.
const qStr = (v) => {
    if (v == null) return undefined;
    return typeof v === 'string' ? v : String(v);
};

// Clamp a user-supplied pagination limit into a safe range.
const clampLimit = (v, { def = 50, max = 200 } = {}) => {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n) || n <= 0) return def;
    return Math.min(n, max);
};

// Escape a string so it can be used literally inside a RegExp (no ReDoS / no
// injected regex metacharacters).
const escapeRegex = (s = '') => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Build a safe case-insensitive "contains" regex from user input.
const safeSearchRegex = (s) => ({ $regex: escapeRegex(qStr(s) || ''), $options: 'i' });

// Remove fields the client must never set directly. Mutates and returns body.
const stripFields = (body, fields) => {
    if (!body || typeof body !== 'object') return body;
    for (const f of fields) delete body[f];
    return body;
};

// Server-controlled fields that should never come from the request body on any
// create/update. Individual routes add their own computed fields (amountPKR,
// pricingSummary, ticketPricePKR, …) on top of this base set.
const PROTECTED_FIELDS = ['createdBy', 'updatedBy', 'reconciled', 'reconciledAt', '_id', '__v', 'createdAt', 'updatedAt'];

module.exports = { qStr, clampLimit, escapeRegex, safeSearchRegex, stripFields, PROTECTED_FIELDS };
