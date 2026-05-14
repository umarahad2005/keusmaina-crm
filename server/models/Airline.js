const mongoose = require('mongoose');

const airlineSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Airline name is required'],
        trim: true
    },
    flightNumber: {
        type: String,
        trim: true
    },
    departureCity: {
        type: String,
        required: [true, 'Departure city is required'],
        trim: true
    },
    departureAirportCode: {
        type: String,
        trim: true,
        uppercase: true
    },
    arrivalCity: {
        type: String,
        required: [true, 'Arrival city is required'],
        trim: true
    },
    arrivalAirportCode: {
        type: String,
        trim: true,
        uppercase: true
    },
    departureDateTime: {
        type: Date
    },
    arrivalDateTime: {
        type: Date
    },
    returnDateTime: {
        type: Date
    },
    seatClass: {
        type: String,
        enum: ['Economy', 'Business', 'First'],
        default: 'Economy'
    },
    ticketPriceSAR: {
        type: Number,
        required: [true, 'Ticket price in SAR is required'],
        min: 0
    },
    ticketPricePKR: {
        type: Number,
        min: 0
    },
    totalSeats: {
        type: Number,
        min: 0,
        default: 0
    },
    soldSeats: {
        type: Number,
        min: 0,
        default: 0
    },
    baggageAllowance: {
        type: Number,
        min: 0,
        default: 23
    },
    transitDetails: {
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

// Index for search
airlineSchema.index({ name: 'text', flightNumber: 'text', departureCity: 'text', arrivalCity: 'text' });

module.exports = mongoose.model('Airline', airlineSchema);
