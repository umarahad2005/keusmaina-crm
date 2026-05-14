const mongoose = require('mongoose');

const ratePeriodSchema = new mongoose.Schema({
    label: {
        type: String,
        trim: true,
        default: 'Standard'
    },
    validFrom: {
        type: Date,
        required: [true, 'Rate period start date is required']
    },
    validTo: {
        type: Date,
        required: [true, 'Rate period end date is required']
    },
    rateSAR: {
        type: Number,
        required: [true, 'Rate in SAR is required'],
        min: 0
    },
    ratePKR: {
        type: Number,
        min: 0
    }
}, { _id: true });

const roomTypeSchema = new mongoose.Schema({
    typeName: {
        type: String,
        required: [true, 'Room type name is required'],
        trim: true
    },
    rates: {
        type: [ratePeriodSchema],
        validate: [v => Array.isArray(v) && v.length > 0, 'At least one rate period is required']
    },
    maxOccupancy: {
        type: Number,
        min: 1,
        default: 4
    },
    mealPlan: {
        type: String,
        enum: ['Bed Only', 'Breakfast', 'Half Board', 'Full Board'],
        default: 'Bed Only'
    }
}, { _id: true });

const hotelMadinahSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Hotel name is required'],
        trim: true
    },
    starRating: {
        type: Number,
        required: [true, 'Star rating is required'],
        min: 1,
        max: 5
    },
    distanceFromMasjidNabawi: {
        type: String,
        trim: true
    },
    roomTypes: [roomTypeSchema],
    totalRooms: {
        type: Number,
        min: 0
    },
    checkInPolicy: {
        type: String,
        trim: true
    },
    checkOutPolicy: {
        type: String,
        trim: true
    },
    notes: {
        type: String,
        trim: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

hotelMadinahSchema.index({ name: 'text' });

module.exports = mongoose.model('HotelMadinah', hotelMadinahSchema);
