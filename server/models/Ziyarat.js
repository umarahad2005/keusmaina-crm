const mongoose = require('mongoose');

const ziyaratSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Ziyarat name is required'],
        trim: true
    },
    location: {
        type: String,
        enum: ['Makkah', 'Madinah', 'Other'],
        required: [true, 'Location is required']
    },
    duration: {
        type: String,
        trim: true
    },
    transportIncluded: {
        type: Boolean,
        default: false
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
    ratePerGroupSAR: {
        type: Number,
        min: 0,
        default: 0
    },
    ratePerGroupPKR: {
        type: Number,
        min: 0,
        default: 0
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

ziyaratSchema.index({ name: 'text', location: 'text' });

module.exports = mongoose.model('Ziyarat', ziyaratSchema);
