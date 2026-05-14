const mongoose = require('mongoose');

const rateHistorySchema = new mongoose.Schema({
    rate: {
        type: Number,
        required: true
    },
    date: {
        type: Date,
        default: Date.now
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { _id: true });

const currencySettingsSchema = new mongoose.Schema({
    sarToPkr: {
        type: Number,
        required: [true, 'SAR to PKR rate is required'],
        min: 0
    },
    rateHistory: [rateHistorySchema],
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Ensure only one document exists (singleton)
currencySettingsSchema.statics.getRate = async function () {
    let settings = await this.findOne();
    if (!settings) {
        settings = await this.create({ sarToPkr: 75.0, rateHistory: [{ rate: 75.0 }] });
    }
    return settings;
};

currencySettingsSchema.statics.updateRate = async function (newRate, userId) {
    let settings = await this.findOne();
    if (!settings) {
        settings = new this({ sarToPkr: newRate, rateHistory: [] });
    }
    settings.sarToPkr = newRate;
    settings.rateHistory.push({ rate: newRate, updatedBy: userId });
    settings.updatedBy = userId;
    await settings.save();
    return settings;
};

module.exports = mongoose.model('CurrencySettings', currencySettingsSchema);
