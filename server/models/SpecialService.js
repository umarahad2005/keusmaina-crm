const mongoose = require('mongoose');

const specialServiceSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Service name is required'],
        trim: true
    },
    rateSAR: {
        type: Number,
        required: [true, 'Rate in SAR is required'],
        min: 0
    },
    ratePKR: {
        type: Number,
        min: 0
    },
    pricingType: {
        type: String,
        enum: ['perPerson', 'perGroup', 'fixed'],
        default: 'perPerson'
    },
    description: {
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

specialServiceSchema.index({ name: 'text' });

module.exports = mongoose.model('SpecialService', specialServiceSchema);
