const mongoose = require('mongoose');

// A Supplier is anyone the agency BUYS from: hotel suppliers, airline ticket
// wholesalers, transport vendors, visa agents. Counterpart to ClientB2C/B2B
// (who the agency sells to). Drives real cost/profit reporting.

const supplierSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    type: {
        type: String,
        enum: ['hotel', 'airline', 'transport', 'visa_agent', 'ziyarat', 'other'],
        default: 'other'
    },
    contactPerson: { type: String, trim: true },
    phone: { type: String, trim: true },
    whatsapp: { type: String, trim: true },
    email: { type: String, trim: true },
    city: { type: String, trim: true },
    address: { type: String, trim: true },

    // The SAR→PKR rate negotiated with THIS supplier. Rates differ per party —
    // one supplier settles at 77, another at 76 — so a single global rate would
    // misprice them. Pre-fills the rate on any SAR entry for this supplier and
    // stays overridable on the entry itself. Blank = fall back to the global
    // CurrencySettings rate.
    sarExchangeRate: { type: Number, min: 0 },

    // Opening balance in PKR. Positive = we already owed them at the time
    // they were entered into the system.
    openingBalancePKR: { type: Number, default: 0 },

    notes: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

supplierSchema.index({ name: 'text', city: 'text' });

module.exports = mongoose.model('Supplier', supplierSchema);
