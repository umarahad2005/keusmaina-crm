const mongoose = require('mongoose');

// Money moved between two of our own accounts — a bank withdrawal into the cash
// drawer, cash deposited into a bank, or a transfer between two banks.
//
// This is deliberately its OWN collection rather than a pair of ledger entries.
// A transfer is not income and not an expense: the business is no richer or
// poorer afterwards. Recording it as a client receipt would inflate revenue,
// and as an expense would inflate costs — either way the P&L, the month-end
// closing and the partner split would all be wrong. Keeping transfers here
// means account balances see them and the profit reports never do.
//
// Only the two account balances move: `from` goes down, `to` goes up.

const cashTransferSchema = new mongoose.Schema({
    fromAccount: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CashAccount',
        required: [true, 'Select the account the money is coming from']
    },
    toAccount: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CashAccount',
        required: [true, 'Select the account the money is going to']
    },

    amountPKR: { type: Number, required: [true, 'Amount is required'], min: [1, 'Amount must be greater than zero'] },

    date: { type: Date, default: Date.now },
    // Bank slip / cheque number / online reference for the movement.
    referenceNumber: { type: String, trim: true },
    description: { type: String, trim: true },
    notes: { type: String, trim: true },

    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Moving money to the account it came from would leave the balance unchanged
// while cluttering the statement, and usually means the form was half-filled.
cashTransferSchema.path('toAccount').validate(function (v) {
    return !v || !this.fromAccount || String(v) !== String(this.fromAccount);
}, 'The destination account must be different from the source account');

cashTransferSchema.index({ isActive: 1, date: -1 });
cashTransferSchema.index({ fromAccount: 1 });
cashTransferSchema.index({ toAccount: 1 });

module.exports = mongoose.model('CashTransfer', cashTransferSchema);
