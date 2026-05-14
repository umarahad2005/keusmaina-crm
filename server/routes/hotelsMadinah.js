const express = require('express');
const HotelMadinah = require('../models/HotelMadinah');
const CurrencySettings = require('../models/CurrencySettings');
const { protect } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/auditLog');
const { hotelAvailability } = require('../utils/allotment');
const router = express.Router();

router.use(protect);
router.use(auditMiddleware('HotelMadinah'));

// @route   GET /api/hotels-madinah
router.get('/', async (req, res) => {
    try {
        const { search, page = 1, limit = 50, status } = req.query;
        const query = {};
        if (search) query.name = { $regex: search, $options: 'i' };
        if (status === 'active') query.isActive = true;
        if (status === 'inactive') query.isActive = false;

        const total = await HotelMadinah.countDocuments(query);
        const hotels = await HotelMadinah.find(query).sort('-createdAt').skip((page - 1) * limit).limit(parseInt(limit)).populate('createdBy', 'name');
        res.json({ success: true, data: hotels, count: hotels.length, total, pagination: { page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// @route   GET /api/hotels-madinah/:id/availability?from=YYYY-MM-DD&to=YYYY-MM-DD[&excludePackageId=]
router.get('/:id/availability', async (req, res) => {
    try {
        const { from, to, excludePackageId } = req.query;
        if (!from || !to) return res.status(400).json({ success: false, message: 'from and to are required' });
        const data = await hotelAvailability({ hotelField: 'madinahHotel', hotelId: req.params.id, from, to, excludePackageId });
        if (!data) return res.status(404).json({ success: false, message: 'Hotel not found' });
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const hotel = await HotelMadinah.findById(req.params.id).populate('createdBy', 'name');
        if (!hotel) return res.status(404).json({ success: false, message: 'Hotel not found' });
        res.json({ success: true, data: hotel });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

const stampPKR = async (roomTypes) => {
    if (!Array.isArray(roomTypes)) return roomTypes;
    const currency = await CurrencySettings.getRate();
    return roomTypes.map(rt => ({
        ...rt,
        rates: Array.isArray(rt.rates)
            ? rt.rates.map(r => ({ ...r, ratePKR: Number(r.rateSAR || 0) * currency.sarToPkr }))
            : []
    }));
};

router.post('/', async (req, res) => {
    try {
        if (req.body.roomTypes) req.body.roomTypes = await stampPKR(req.body.roomTypes);
        req.body.createdBy = req.user._id;
        const hotel = await HotelMadinah.create(req.body);
        res.status(201).json({ success: true, data: hotel });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

router.put('/:id', async (req, res) => {
    try {
        if (req.body.roomTypes) req.body.roomTypes = await stampPKR(req.body.roomTypes);
        req.body.updatedBy = req.user._id;
        const hotel = await HotelMadinah.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!hotel) return res.status(404).json({ success: false, message: 'Hotel not found' });
        res.json({ success: true, data: hotel });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const hotel = await HotelMadinah.findByIdAndUpdate(req.params.id, { isActive: false, updatedBy: req.user._id }, { new: true });
        if (!hotel) return res.status(404).json({ success: false, message: 'Hotel not found' });
        res.json({ success: true, data: hotel, message: 'Hotel deactivated' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
