const mongoose = require('mongoose');

// A ready-made package bought from a supplier at a FIXED per-person price (PKR).
// We negotiate a discount ("minus") off the supplier's list price → our cost,
// and add a markup → our sell price. So:
//   cost   = basePricePKR − supplierDiscountPKR
//   sell   = basePricePKR + markupPKR
//   profit = sell − cost = markupPKR + supplierDiscountPKR   (per person)
//
// `status` is a manual availability toggle: 'active' = still sellable,
// 'closed' = the supplier's block is sold out / no longer offered. `isActive`
// is the soft-delete flag (separate concern). Trip details are informational
// and get copied onto the real Package created when the item is sold.

const fixedPackageSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },

    status: { type: String, enum: ['active', 'closed'], default: 'active' },

    // Informational trip details — same shape as Package.components.
    duration: { type: String, trim: true },
    travelDates: {
        departure: { type: Date },
        returnDate: { type: Date }
    },
    components: {
        airline: { type: mongoose.Schema.Types.ObjectId, ref: 'Airline' },
        makkahHotel: {
            hotel: { type: mongoose.Schema.Types.ObjectId, ref: 'HotelMakkah' },
            roomType: { type: String },
            nights: { type: Number, default: 0 }
        },
        madinahHotel: {
            hotel: { type: mongoose.Schema.Types.ObjectId, ref: 'HotelMadinah' },
            roomType: { type: String },
            nights: { type: Number, default: 0 }
        },
        ziyarats: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Ziyarat' }],
        transportation: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Transport' }]
    },

    // Pricing — PKR, per person, fixed amounts entered by hand.
    basePricePKR: { type: Number, required: true, min: 0 },     // supplier list price
    supplierDiscountPKR: { type: Number, default: 0, min: 0 },  // the "minus" we get
    markupPKR: { type: Number, default: 0, min: 0 },            // what we add on top

    notes: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Derived per-person figures — always sent to the client so they can't be faked.
fixedPackageSchema.virtual('costPricePKR').get(function () {
    return (this.basePricePKR || 0) - (this.supplierDiscountPKR || 0);
});
fixedPackageSchema.virtual('sellPricePKR').get(function () {
    return (this.basePricePKR || 0) + (this.markupPKR || 0);
});
fixedPackageSchema.virtual('profitPerPersonPKR').get(function () {
    return (this.markupPKR || 0) + (this.supplierDiscountPKR || 0);
});
fixedPackageSchema.set('toJSON', { virtuals: true });
fixedPackageSchema.set('toObject', { virtuals: true });

fixedPackageSchema.index({ status: 1, isActive: 1 });

module.exports = mongoose.model('FixedPackage', fixedPackageSchema);
