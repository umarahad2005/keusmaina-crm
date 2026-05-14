const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
    filename: { type: String, required: true },
    originalName: { type: String },
    url: { type: String, required: true },
    mimeType: { type: String },
    size: { type: Number },
    category: { type: String, default: 'payment_proof' },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { _id: true });

// One row per money event with a client (B2C pilgrim or B2B agent).
//   debit  = we charged the client (sale / invoice — they owe us more)
//   credit = client paid us
//
// Outstanding receivable = sum(debit) − sum(credit).
// When linked to a Package or Departure, the entry shows up in that
// booking's account statement / profit report.

const ledgerEntrySchema = new mongoose.Schema({
    // Client reference (B2C or B2B)
    client: { type: mongoose.Schema.Types.ObjectId, refPath: 'clientModel', required: true },
    clientModel: { type: String, enum: ['ClientB2C', 'ClientB2B'], required: true },
    clientType: { type: String, enum: ['B2C', 'B2B'], required: true },

    // Linkage
    package: { type: mongoose.Schema.Types.ObjectId, ref: 'Package' },
    departure: { type: mongoose.Schema.Types.ObjectId, ref: 'Departure' },
    voucherId: { type: String },

    // Transaction details
    type: { type: String, enum: ['credit', 'debit'], required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ['SAR', 'PKR'], default: 'PKR' },
    amountPKR: { type: Number }, // converted at entry time, for cross-currency reports

    // What the charge / payment was for
    category: {
        type: String,
        enum: ['package_sale', 'extra_service', 'visa', 'transport', 'hotel', 'airline', 'refund', 'adjustment', 'other'],
        default: 'package_sale'
    },

    // Payment method
    paymentMethod: {
        type: String,
        enum: ['cash', 'bank_transfer', 'online', 'cheque', 'adjustment'],
        default: 'cash'
    },
    // Which cash/bank account the money moved through (set for credit/payment entries)
    cashAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'CashAccount' },
    reconciled: { type: Boolean, default: false },
    reconciledAt: { type: Date },
    referenceNumber: { type: String }, // bank ref, cheque #, etc.

    description: { type: String, required: true },
    date: { type: Date, default: Date.now },

    documents: { type: [documentSchema], default: [] },

    notes: { type: String },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

ledgerEntrySchema.index({ client: 1, date: -1 });
ledgerEntrySchema.index({ clientType: 1, date: -1 });
ledgerEntrySchema.index({ package: 1 });
ledgerEntrySchema.index({ departure: 1 });

// Static method: Get client balance
ledgerEntrySchema.statics.getClientBalance = async function (clientId, clientModel) {
    const result = await this.aggregate([
        { $match: { client: new mongoose.Types.ObjectId(clientId), clientModel, isActive: true } },
        {
            $group: {
                _id: null,
                totalCredit: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0] } },
                totalDebit: { $sum: { $cond: [{ $eq: ['$type', 'debit'] }, '$amount', 0] } },
                totalCreditPKR: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, { $ifNull: ['$amountPKR', '$amount'] }, 0] } },
                totalDebitPKR: { $sum: { $cond: [{ $eq: ['$type', 'debit'] }, { $ifNull: ['$amountPKR', '$amount'] }, 0] } },
                count: { $sum: 1 }
            }
        }
    ]);

    if (result.length === 0) return { totalCredit: 0, totalDebit: 0, balance: 0, totalCreditPKR: 0, totalDebitPKR: 0, balancePKR: 0, count: 0 };

    const { totalCredit, totalDebit, totalCreditPKR, totalDebitPKR, count } = result[0];
    return {
        totalCredit, totalDebit, balance: totalDebit - totalCredit,
        totalCreditPKR, totalDebitPKR, balancePKR: totalDebitPKR - totalCreditPKR,
        count
    };
};

module.exports = mongoose.model('LedgerEntry', ledgerEntrySchema);
