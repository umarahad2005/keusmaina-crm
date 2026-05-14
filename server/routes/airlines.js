const express = require('express');
const Airline = require('../models/Airline');
const Package = require('../models/Package');
const CurrencySettings = require('../models/CurrencySettings');
const { protect, authorize } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/auditLog');
const { CONSUMING_STATUSES } = require('../utils/allotment');
const router = express.Router();

router.use(protect);
router.use(auditMiddleware('Airline'));

// @route   GET /api/airlines
// @desc    Get all airlines (with search, pagination)
router.get('/', async (req, res) => {
    try {
        const { search, page = 1, limit = 50, status } = req.query;
        const query = {};

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { flightNumber: { $regex: search, $options: 'i' } },
                { departureCity: { $regex: search, $options: 'i' } },
                { arrivalCity: { $regex: search, $options: 'i' } }
            ];
        }

        if (status === 'active') query.isActive = true;
        if (status === 'inactive') query.isActive = false;

        const total = await Airline.countDocuments(query);
        const airlines = await Airline.find(query)
            .sort('-createdAt')
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .populate('createdBy', 'name')
            .populate('updatedBy', 'name');

        res.json({
            success: true,
            data: airlines,
            count: airlines.length,
            total,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// @route   POST /api/airlines/recompute-allotment (admin)
// Rebuilds soldSeats by scanning confirmed/completed packages — useful if data drifts.
router.post('/recompute-allotment', authorize('admin'), async (req, res) => {
    try {
        const pkgs = await Package.find({ status: { $in: CONSUMING_STATUSES }, 'components.airline': { $ne: null } })
            .select('components.airline numberOfPilgrims').lean();
        const totals = new Map();
        for (const p of pkgs) {
            const id = String(p.components?.airline || '');
            if (!id) continue;
            totals.set(id, (totals.get(id) || 0) + (Number(p.numberOfPilgrims) || 0));
        }
        await Airline.updateMany({}, { $set: { soldSeats: 0 } });
        for (const [id, seats] of totals.entries()) {
            await Airline.findByIdAndUpdate(id, { $set: { soldSeats: seats } });
        }
        res.json({ success: true, message: `Recomputed soldSeats for ${totals.size} airline(s).`, data: Object.fromEntries(totals) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// @route   GET /api/airlines/:id
router.get('/:id', async (req, res) => {
    try {
        const airline = await Airline.findById(req.params.id)
            .populate('createdBy', 'name')
            .populate('updatedBy', 'name');
        if (!airline) return res.status(404).json({ success: false, message: 'Airline not found' });
        res.json({ success: true, data: airline });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// @route   POST /api/airlines
router.post('/', async (req, res) => {
    try {
        const currency = await CurrencySettings.getRate();
        req.body.ticketPricePKR = req.body.ticketPriceSAR * currency.sarToPkr;
        req.body.createdBy = req.user._id;

        const airline = await Airline.create(req.body);
        res.status(201).json({ success: true, data: airline });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// @route   PUT /api/airlines/:id
router.put('/:id', async (req, res) => {
    try {
        if (req.body.ticketPriceSAR) {
            const currency = await CurrencySettings.getRate();
            req.body.ticketPricePKR = req.body.ticketPriceSAR * currency.sarToPkr;
        }
        req.body.updatedBy = req.user._id;

        const airline = await Airline.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });
        if (!airline) return res.status(404).json({ success: false, message: 'Airline not found' });
        res.json({ success: true, data: airline });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// @route   DELETE /api/airlines/:id (soft delete)
router.delete('/:id', async (req, res) => {
    try {
        const airline = await Airline.findByIdAndUpdate(
            req.params.id,
            { isActive: false, updatedBy: req.user._id },
            { new: true }
        );
        if (!airline) return res.status(404).json({ success: false, message: 'Airline not found' });
        res.json({ success: true, data: airline, message: 'Airline deactivated' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
