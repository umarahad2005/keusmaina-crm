const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
    filename: { type: String, required: true },
    originalName: { type: String },
    url: { type: String, required: true },
    mimeType: { type: String },
    size: { type: Number },
    category: { type: String, default: 'invoice' },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { _id: true });

// One row per money event with a supplier.
//   debit  = supplier issued an invoice / we owe them more (cost incurred)
//   credit = we paid the supplier
//
// Outstanding payable = sum(debit) − sum(credit) + opening balance.
// When a debit entry is linked to a Package or Departure, it counts toward
// that booking's cost (used in profit reports).

const supplierLedgerSchema = new mongoose.Schema({
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },

    type: { type: String, enum: ['debit', 'credit'], required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ['PKR', 'SAR'], default: 'PKR' },
    amountPKR: { type: Number }, // converted at entry time

    paymentMethod: {
        type: String,
        enum: ['cash', 'bank_transfer', 'online', 'cheque', 'adjustment', 'invoice'],
        default: 'invoice'
    },
    // Which cash/bank account the money moved through (set for credit/payment entries)
    cashAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'CashAccount' },
    reconciled: { type: Boolean, default: false },
    reconciledAt: { type: Date },

    date: { type: Date, default: Date.now, required: true },
    description: { type: String, trim: true, required: true },
    referenceNumber: { type: String, trim: true },

    // Linkage for cost/profit reports — optional
    package: { type: mongoose.Schema.Types.ObjectId, ref: 'Package' },
    departure: { type: mongoose.Schema.Types.ObjectId, ref: 'Departure' },
    category: {
        type: String,
        enum: ['hotel_booking', 'airline_tickets', 'transport', 'visa', 'ziyarat', 'service', 'other'],
        default: 'other'
    },

    documents: { type: [documentSchema], default: [] },

    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

supplierLedgerSchema.index({ supplier: 1, date: -1 });
supplierLedgerSchema.index({ package: 1 });
supplierLedgerSchema.index({ departure: 1 });

module.exports = mongoose.model('SupplierLedger', supplierLedgerSchema);
