const mongoose = require('mongoose');

// Operating expenses — money the agency spends on running the business that
// is NOT a cost-of-goods (which lives in SupplierLedger). Examples: rent,
// salaries, utilities, marketing, office supplies. Single-entry outflow log.

const documentSchema = new mongoose.Schema({
    filename: { type: String, required: true },
    originalName: { type: String },
    url: { type: String, required: true },
    mimeType: { type: String },
    size: { type: Number },
    category: { type: String, default: 'receipt' },
    storage: { type: String, enum: ['local', 'cloudinary'], default: 'local' },
    resourceType: { type: String },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { _id: true });

const expenseSchema = new mongoose.Schema({
    date: { type: Date, default: Date.now, required: true },
    category: {
        type: String,
        enum: ['rent', 'salaries', 'utilities', 'marketing', 'office_supplies', 'communication', 'maintenance', 'legal_professional', 'travel_local', 'bank_charges', 'other'],
        default: 'other',
        required: true
    },
    description: { type: String, trim: true, required: true },
    paidTo: { type: String, trim: true }, // landlord, employee, vendor name — free text

    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ['PKR', 'SAR'], default: 'PKR' },
    amountPKR: { type: Number }, // converted at entry time

    paymentMethod: {
        type: String,
        enum: ['cash', 'bank_transfer', 'online', 'cheque', 'card', 'adjustment'],
        default: 'cash'
    },
    cashAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'CashAccount' },
    reconciled: { type: Boolean, default: false },
    reconciledAt: { type: Date },
    referenceNumber: { type: String, trim: true },

    documents: { type: [documentSchema], default: [] },

    notes: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

expenseSchema.index({ date: -1 });
expenseSchema.index({ category: 1 });

module.exports = mongoose.model('Expense', expenseSchema);
