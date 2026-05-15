const mongoose = require('mongoose');

// Visa workflow stages — ordered. Index helpers in utils/visa.js rely on this order.
const VISA_STAGES = [
    'not_started',
    'passport_collected',
    'mofa_submitted',
    'mofa_approved',
    'visa_issued',
    'cancelled'
];

const PASSPORT_STATES = ['not_collected', 'collected', 'returned'];

const documentSchema = new mongoose.Schema({
    filename: { type: String, required: true },
    originalName: { type: String },
    url: { type: String, required: true },
    mimeType: { type: String },
    size: { type: Number },
    category: { type: String, default: 'other' },
    storage: { type: String, enum: ['local', 'cloudinary'], default: 'local' },
    resourceType: { type: String },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { _id: true });

const visaTimelineSchema = new mongoose.Schema({
    status: { type: String, enum: VISA_STAGES, required: true },
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String, trim: true, default: '' }
}, { _id: true });

// Roster entry — one per pilgrim travelling under this package.
// pilgrim references the master ClientB2C record (passport, mahram, etc.).
// Per-trip details (room number, ticket, visa) live here, not on the master.
const pilgrimEntrySchema = new mongoose.Schema({
    pilgrim: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientB2C', required: true },
    makkahRoom: { type: String, trim: true, default: '' },
    madinahRoom: { type: String, trim: true, default: '' },
    ticketNumber: { type: String, trim: true, default: '' },
    visaNumber: { type: String, trim: true, default: '' },
    mutamirNumber: { type: String, trim: true, default: '' },

    // Visa workflow
    visaStatus: { type: String, enum: VISA_STAGES, default: 'not_started' },
    passportStatus: { type: String, enum: PASSPORT_STATES, default: 'not_collected' },
    mofaApplicationDate: { type: Date },
    visaIssuedDate: { type: Date },
    visaExpiryDate: { type: Date },
    visaTimeline: { type: [visaTimelineSchema], default: [] },
    documents: { type: [documentSchema], default: [] },

    notes: { type: String, trim: true, default: '' },
    addedAt: { type: Date, default: Date.now }
}, { _id: true });

const packageSchema = new mongoose.Schema({
    // Auto-generated Voucher ID: KU-YYYY-NNNN
    voucherId: { type: String, unique: true },

    packageName: { type: String, required: true, trim: true },
    packageType: { type: String, enum: ['Umrah', 'Ziyarat', 'Custom', 'VIP'], default: 'Umrah' },
    travelSeason: { type: String }, // e.g. "Ramadan 2026", "Off-Peak"
    duration: { type: String }, // e.g. "14 Days"
    numberOfPilgrims: { type: Number, default: 1 },

    // Optional link to a Departure batch — when set, the package inherits
    // shared components (airline, hotels, ziyarats, transport) from the
    // departure. The package keeps its own pricing markup, client, roster
    // and special services.
    departure: { type: mongoose.Schema.Types.ObjectId, ref: 'Departure' },

    travelDates: {
        departure: { type: Date },
        returnDate: { type: Date }
    },

    // Component references
    components: {
        airline: { type: mongoose.Schema.Types.ObjectId, ref: 'Airline' },

        makkahHotel: {
            hotel: { type: mongoose.Schema.Types.ObjectId, ref: 'HotelMakkah' },
            roomType: { type: String },
            nights: { type: Number, default: 0 },
            ratePerNightSAR: { type: Number, default: 0 }
        },

        madinahHotel: {
            hotel: { type: mongoose.Schema.Types.ObjectId, ref: 'HotelMadinah' },
            roomType: { type: String },
            nights: { type: Number, default: 0 },
            ratePerNightSAR: { type: Number, default: 0 }
        },

        ziyarats: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Ziyarat' }],
        transportation: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Transport' }],
        specialServices: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SpecialService' }]
    },

    // Pricing summary (calculated by pricing engine)
    pricingSummary: {
        airlineCostSAR: { type: Number, default: 0 },
        makkahHotelCostSAR: { type: Number, default: 0 },
        madinahHotelCostSAR: { type: Number, default: 0 },
        ziyaratsCostSAR: { type: Number, default: 0 },
        transportCostSAR: { type: Number, default: 0 },
        servicesCostSAR: { type: Number, default: 0 },

        subtotalSAR: { type: Number, default: 0 },
        subtotalPKR: { type: Number, default: 0 },

        markupType: { type: String, enum: ['percentage', 'fixed'], default: 'fixed' },
        markupValue: { type: Number, default: 0 },
        markupAmountSAR: { type: Number, default: 0 },

        finalPriceSAR: { type: Number, default: 0 },
        finalPricePKR: { type: Number, default: 0 },
        costPerPersonSAR: { type: Number, default: 0 },
        costPerPersonPKR: { type: Number, default: 0 }
    },

    // Client assignment (the booker — for B2C this is usually the head pilgrim,
    // for B2B it's the agency. The actual travelling pilgrims live in `pilgrims`.)
    client: { type: mongoose.Schema.Types.ObjectId, refPath: 'clientModel' },
    clientModel: { type: String, enum: ['ClientB2C', 'ClientB2B'] },
    clientType: { type: String, enum: ['B2C', 'B2B'] },

    // Travelling roster — actual pilgrim records on this trip
    pilgrims: { type: [pilgrimEntrySchema], default: [] },

    // Lifecycle progression: draft → quoted → confirmed → deposit_received →
    // fully_paid → completed (or cancelled at any point). The CONSUMING_STATUSES
    // constant in utils/allotment.js controls which of these reserve seats/rooms.
    status: {
        type: String,
        enum: ['draft', 'quoted', 'confirmed', 'deposit_received', 'fully_paid', 'completed', 'cancelled'],
        default: 'draft'
    },
    notes: { type: String },

    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Auto-generate voucher ID: KU-YYYY-NNNN
packageSchema.pre('save', async function () {
    if (!this.voucherId) {
        const year = new Date().getFullYear();
        const count = await mongoose.model('Package').countDocuments();
        this.voucherId = `KU-${year}-${String(count + 1).padStart(4, '0')}`;
    }
});

module.exports = mongoose.model('Package', packageSchema);
module.exports.VISA_STAGES = VISA_STAGES;
module.exports.PASSPORT_STATES = PASSPORT_STATES;
