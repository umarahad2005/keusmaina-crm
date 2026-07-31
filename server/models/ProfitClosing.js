const mongoose = require('mongoose');

// A month-end profit close.
//
// At the end of a month the accrual net profit — the same figure the P&L report
// shows (booked revenue − supplier COGS − operating expenses) — is divided into
// N equal shares: one for the office and one per partner. N is entered at
// closing time because the number of partners is not always the same.
//
// The computed figures are SNAPSHOTTED onto this document rather than
// recalculated on read. A close is a decision made on a date with the numbers
// as they stood; back-dated invoices or a corrected expense must not silently
// change what partners were told they were owed. To restate a month, delete
// the close and take it again — the audit log records both actions.
//
// Shares are a record of entitlement, not a payment. Nothing is posted to a
// ledger here.

const shareSchema = new mongoose.Schema({
    label: { type: String, required: true, trim: true },
    // 'office' is the house share; 'partner' rows are the investors.
    kind: { type: String, enum: ['office', 'partner'], default: 'partner' },
    amountPKR: { type: Number, required: true }
}, { _id: false });

const profitClosingSchema = new mongoose.Schema({
    // 'YYYY-MM'. Unique so a month cannot be closed twice.
    periodMonth: { type: String, required: true, unique: true, match: /^\d{4}-\d{2}$/ },
    periodFrom: { type: Date, required: true },
    periodTo: { type: Date, required: true },

    // Which measure the shares were taken from.
    //   cash    — money actually received minus money actually paid out. This
    //             is what can genuinely be handed out, so it is the default.
    //   accrual — what the month earned, counting unpaid sales and unpaid
    //             supplier bills. Better for judging performance, but you can
    //             distribute more than you hold.
    basis: { type: String, enum: ['cash', 'accrual'], default: 'cash' },

    // The figure that was actually divided into shares.
    distributedPKR: { type: Number, default: 0 },

    // Accrual snapshot (the P&L view of the month).
    revenuePKR: { type: Number, default: 0 },
    cogsPKR: { type: Number, default: 0 },
    opexPKR: { type: Number, default: 0 },
    netProfitPKR: { type: Number, default: 0 },

    // Cash snapshot — both are stored whichever basis was used, so a close can
    // always be explained afterwards and the two compared.
    cashInPKR: { type: Number, default: 0 },
    supplierPaidPKR: { type: Number, default: 0 },
    opexPaidPKR: { type: Number, default: 0 },
    netCashPKR: { type: Number, default: 0 },

    // How the net was divided.
    parts: { type: Number, required: true, min: 1 },
    shares: { type: [shareSchema], default: [] },
    // Rounding remainder in PKR; assigned to the office share so the parts
    // always add back up to netProfitPKR exactly.
    roundingPKR: { type: Number, default: 0 },

    notes: { type: String, trim: true },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    closedAt: { type: Date, default: Date.now }
}, { timestamps: true });

profitClosingSchema.index({ periodFrom: -1 });

module.exports = mongoose.model('ProfitClosing', profitClosingSchema);
