const mongoose = require('mongoose');

// A real place where money actually sits: cash drawer, bank account, mobile
// wallet, etc. Every payment in the system (client received, supplier paid,
// expense paid) can point to one of these so we know where the money moved.
// Live balance = openingBalancePKR + receipts in − payments out.

const cashAccountSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    type: {
        type: String,
        enum: ['cash', 'bank', 'wallet', 'card', 'other'],
        default: 'cash'
    },
    accountNumber: { type: String, trim: true }, // bank account / wallet ID
    bankName: { type: String, trim: true },
    branchOrIban: { type: String, trim: true },
    currency: { type: String, enum: ['PKR', 'SAR'], default: 'PKR' },
    openingBalancePKR: { type: Number, default: 0 },
    notes: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

cashAccountSchema.index({ name: 1 });
cashAccountSchema.index({ isActive: 1 });

module.exports = mongoose.model('CashAccount', cashAccountSchema);
