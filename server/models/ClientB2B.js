const mongoose = require('mongoose');

const subPilgrimSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    cnic: { type: String },
    passportNumber: { type: String },
    passportExpiry: { type: Date },
    dob: { type: Date },
    gender: { type: String, enum: ['Male', 'Female'] },
    phone: { type: String },
    mahramDetails: {
        name: { type: String },
        relation: { type: String },
        cnic: { type: String }
    }
}, { _id: true });

const clientB2BSchema = new mongoose.Schema({
    companyName: { type: String, required: true, trim: true },
    contactPerson: { type: String, required: true, trim: true },
    phone: { type: String, required: true },
    whatsapp: { type: String },
    email: { type: String, trim: true, lowercase: true },
    city: { type: String },
    address: { type: String },

    // Commission
    commissionType: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
    commissionValue: { type: Number, default: 0 },

    // Auto-generated agent code
    agentCode: { type: String, unique: true },

    // Sub-pilgrims managed by this agent
    subPilgrims: [subPilgrimSchema],

    notes: { type: String },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Auto-generate agent code
clientB2BSchema.pre('save', async function () {
    if (!this.agentCode) {
        const count = await mongoose.model('ClientB2B').countDocuments();
        this.agentCode = `AG-${String(count + 1).padStart(4, '0')}`;
    }
});

module.exports = mongoose.model('ClientB2B', clientB2BSchema);
