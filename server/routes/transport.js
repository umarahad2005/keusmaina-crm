const express = require('express');
const Transport = require('../models/Transport');
const CurrencySettings = require('../models/CurrencySettings');
const { protect } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/auditLog');
const router = express.Router();

router.use(protect);
router.use(auditMiddleware('Transport'));

router.get('/', async (req, res) => {
    try {
        const { search, page = 1, limit = 50, status } = req.query;
        const query = {};
        if (search) {
            query.$or = [
                { typeName: { $regex: search, $options: 'i' } },
                { route: { $regex: search, $options: 'i' } }
            ];
        }
        if (status === 'active') query.isActive = true;
        if (status === 'inactive') query.isActive = false;

        const total = await Transport.countDocuments(query);
        const items = await Transport.find(query).sort('-createdAt').skip((page - 1) * limit).limit(parseInt(limit)).populate('createdBy', 'name');
        res.json({ success: true, data: items, count: items.length, total, pagination: { page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const item = await Transport.findById(req.params.id).populate('createdBy', 'name');
        if (!item) return res.status(404).json({ success: false, message: 'Transport not found' });
        res.json({ success: true, data: item });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/', async (req, res) => {
    try {
        const currency = await CurrencySettings.getRate();
        if (req.body.ratePerPersonSAR) req.body.ratePerPersonPKR = req.body.ratePerPersonSAR * currency.sarToPkr;
        if (req.body.ratePerVehicleSAR) req.body.ratePerVehiclePKR = req.body.ratePerVehicleSAR * currency.sarToPkr;
        req.body.createdBy = req.user._id;
        const item = await Transport.create(req.body);
        res.status(201).json({ success: true, data: item });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const currency = await CurrencySettings.getRate();
        if (req.body.ratePerPersonSAR) req.body.ratePerPersonPKR = req.body.ratePerPersonSAR * currency.sarToPkr;
        if (req.body.ratePerVehicleSAR) req.body.ratePerVehiclePKR = req.body.ratePerVehicleSAR * currency.sarToPkr;
        req.body.updatedBy = req.user._id;
        const item = await Transport.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!item) return res.status(404).json({ success: false, message: 'Transport not found' });
        res.json({ success: true, data: item });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const item = await Transport.findByIdAndUpdate(req.params.id, { isActive: false, updatedBy: req.user._id }, { new: true });
        if (!item) return res.status(404).json({ success: false, message: 'Transport not found' });
        res.json({ success: true, data: item, message: 'Transport deactivated' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
