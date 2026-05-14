const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
    filename: { type: String, required: true },
    originalName: { type: String },
    url: { type: String, required: true },
    mimeType: { type: String },
    size: { type: Number },
    category: { type: String, default: 'other' },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { _id: true });

const clientB2CSchema = new mongoose.Schema({
    fullName: { type: String, required: true, trim: true },
    cnic: { type: String, trim: true },
    passportNumber: { type: String, trim: true },
    passportExpiry: { type: Date },
    dob: { type: Date },
    gender: { type: String, enum: ['Male', 'Female'], required: true },

    // Mahram details — required if gender is Female
    mahramDetails: {
        name: { type: String },
        relation: { type: String },
        cnic: { type: String }
    },

    phone: { type: String, required: true },
    whatsapp: { type: String },
    address: { type: String },
    city: { type: String },

    emergencyContact: {
        name: { type: String },
        phone: { type: String },
        relation: { type: String }
    },

    documents: { type: [documentSchema], default: [] },

    notes: { type: String },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Validate mahram for female pilgrims
clientB2CSchema.pre('validate', function () {
    if (this.gender === 'Female') {
        if (!this.mahramDetails?.name) {
            this.invalidate('mahramDetails.name', 'Mahram name is required for female pilgrims');
        }
        if (!this.mahramDetails?.relation) {
            this.invalidate('mahramDetails.relation', 'Mahram relation is required for female pilgrims');
        }
    }
});

module.exports = mongoose.model('ClientB2C', clientB2CSchema);
