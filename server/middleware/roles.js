// Central role policy for write (create / edit / delete) authorization.
//
// Existing roles (see models/User.js): admin, sales, accounts, visa, operations.
// New users default to `operations`, so WITHOUT these guards any logged-in
// staffer could edit money and records in departments that aren't theirs.
//
// Money and pricing-master-data are kept tight; operational data is a little
// more permissive so daily work isn't blocked. `admin` is in every group.
// If your team is organised differently, edit the arrays below and
// restart/redeploy — every route imports from here, so it's a one-place change.

module.exports = {
    // Money: expenses, suppliers + supplier ledger, cash accounts, ledger edits.
    FINANCE: ['admin', 'accounts'],

    // Client (pilgrim / agent) records — PII.
    CLIENTS: ['admin', 'accounts', 'sales'],

    // Package building & pricing.
    PACKAGES: ['admin', 'accounts', 'sales', 'operations'],

    // Visa tracking updates.
    VISA: ['admin', 'operations', 'visa', 'sales'],

    // Departures + master catalog data (airlines, hotels, ziyarat, transport,
    // special services). These drive pricing everywhere, so keep them tight.
    OPS: ['admin', 'operations'],
};
