const mongoose = require('mongoose');

const transportSchema = new mongoose.Schema({
    typeName: {
        type: String,
        required: [true, 'Transport type name is required'],
        trim: true
    },
    route: {
        type: String,
        trim: true
    },
    capacity: {
        type: Number,
        min: 1
    },
    ratePerPersonSAR: {
        type: Number,
        min: 0,
        default: 0
    },
    ratePerPersonPKR: {
        type: Number,
        min: 0,
        default: 0
    },
    ratePerVehicleSAR: {
        type: Number,
        min: 0,
        default: 0
    },
    ratePerVehiclePKR: {
        type: Number,
        min: 0,
        default: 0
    },
    vendor: {
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

transportSchema.index({ typeName: 'text', route: 'text' });

module.exports = mongoose.model('Transport', transportSchema);
