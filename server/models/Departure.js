const mongoose = require('mongoose');

// A Departure is a shared "batch" — many independently-booked packages travel
// on the same flight, stay in the same hotels, share the same bus. Holds the
// shared bits in one place so 50 pilgrims across 8 packages aren't entered 8
// times.
//
// Packages can either reference a Departure (inheriting its components) or
// stand on their own (legacy / VIP / custom flow). The pricing engine picks
// components from the departure when the link exists.

const departureSchema = new mongoose.Schema({
    code: { type: String, unique: true },
    name: { type: String, required: true, trim: true },
    season: { type: String, trim: true },

    travelDates: {
        departure: { type: Date, required: true },
        returnDate: { type: Date }
    },

    // Shared components — same shape as Package.components
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

    // Capacity at the batch level (e.g., we contracted 50 seats + 50 hotel beds)
    capacity: { type: Number, default: 0 },

    status: { type: String, enum: ['planning', 'open', 'closed', 'completed', 'cancelled'], default: 'planning' },
    notes: { type: String, trim: true },

    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Auto-generate code: KU-DEP-YYYY-NNNN
departureSchema.pre('save', async function () {
    if (!this.code) {
        const year = new Date().getFullYear();
        const count = await mongoose.model('Departure').countDocuments();
        this.code = `KU-DEP-${year}-${String(count + 1).padStart(4, '0')}`;
    }
});

module.exports = mongoose.model('Departure', departureSchema);
