const express = require('express');
const CurrencySettings = require('../models/CurrencySettings');
const Airline = require('../models/Airline');
const HotelMakkah = require('../models/HotelMakkah');
const HotelMadinah = require('../models/HotelMadinah');
const Ziyarat = require('../models/Ziyarat');
const Transport = require('../models/Transport');
const SpecialService = require('../models/SpecialService');
const { protect, authorize } = require('../middleware/auth');
const { createAuditLog } = require('../middleware/auditLog');
const router = express.Router();

router.use(protect);

// @route   GET /api/currency
// @desc    Get current rate + history
router.get('/', async (req, res) => {
    try {
        const settings = await CurrencySettings.getRate();
        res.json({ success: true, data: settings });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// @route   PUT /api/currency
// @desc    Update SAR to PKR rate (admin only) — triggers global recalculation
router.put('/', authorize('admin'), async (req, res) => {
    try {
        const { sarToPkr } = req.body;
        if (!sarToPkr || sarToPkr <= 0) {
            return res.status(400).json({ success: false, message: 'Valid SAR to PKR rate is required' });
        }

        const settings = await CurrencySettings.updateRate(sarToPkr, req.user._id);

        // Recalculate all PKR prices across all collections
        const rate = sarToPkr;

        // Airlines
        const airlines = await Airline.find({});
        for (const airline of airlines) {
            airline.ticketPricePKR = airline.ticketPriceSAR * rate;
            await airline.save();
        }

        // Hotels Makkah
        const hotelsMakkah = await HotelMakkah.find({});
        for (const hotel of hotelsMakkah) {
            hotel.roomTypes = hotel.roomTypes.map(rt => ({ ...rt.toObject(), ratePKR: rt.rateSAR * rate }));
            await hotel.save();
        }

        // Hotels Madinah
        const hotelsMadinah = await HotelMadinah.find({});
        for (const hotel of hotelsMadinah) {
            hotel.roomTypes = hotel.roomTypes.map(rt => ({ ...rt.toObject(), ratePKR: rt.rateSAR * rate }));
            await hotel.save();
        }

        // Ziyarats
        const ziyarats = await Ziyarat.find({});
        for (const z of ziyarats) {
            z.ratePerPersonPKR = z.ratePerPersonSAR * rate;
            z.ratePerGroupPKR = z.ratePerGroupSAR * rate;
            await z.save();
        }

        // Transport
        const transports = await Transport.find({});
        for (const t of transports) {
            t.ratePerPersonPKR = t.ratePerPersonSAR * rate;
            t.ratePerVehiclePKR = t.ratePerVehicleSAR * rate;
            await t.save();
        }

        // Special Services
        const services = await SpecialService.find({});
        for (const s of services) {
            s.ratePKR = s.rateSAR * rate;
            await s.save();
        }

        createAuditLog(req.user._id, req.user.name, 'update', 'CurrencySettings', settings._id, { sarToPkr }, req.ip);

        res.json({
            success: true,
            data: settings,
            message: `Rate updated to ${sarToPkr}. All PKR prices recalculated.`
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
