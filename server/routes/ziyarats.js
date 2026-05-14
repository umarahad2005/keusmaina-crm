const express = require('express');
const Ziyarat = require('../models/Ziyarat');
const CurrencySettings = require('../models/CurrencySettings');
const { protect } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/auditLog');
const router = express.Router();

router.use(protect);
router.use(auditMiddleware('Ziyarat'));

router.get('/', async (req, res) => {
    try {
        const { search, page = 1, limit = 50, status, location } = req.query;
        const query = {};
        if (search) query.name = { $regex: search, $options: 'i' };
        if (status === 'active') query.isActive = true;
        if (status === 'inactive') query.isActive = false;
        if (location) query.location = location;

        const total = await Ziyarat.countDocuments(query);
        const ziyarats = await Ziyarat.find(query).sort('-createdAt').skip((page - 1) * limit).limit(parseInt(limit)).populate('createdBy', 'name');
        res.json({ success: true, data: ziyarats, count: ziyarats.length, total, pagination: { page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const ziyarat = await Ziyarat.findById(req.params.id).populate('createdBy', 'name');
        if (!ziyarat) return res.status(404).json({ success: false, message: 'Ziyarat not found' });
        res.json({ success: true, data: ziyarat });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/', async (req, res) => {
    try {
        const currency = await CurrencySettings.getRate();
        if (req.body.ratePerPersonSAR) req.body.ratePerPersonPKR = req.body.ratePerPersonSAR * currency.sarToPkr;
        if (req.body.ratePerGroupSAR) req.body.ratePerGroupPKR = req.body.ratePerGroupSAR * currency.sarToPkr;
        req.body.createdBy = req.user._id;
        const ziyarat = await Ziyarat.create(req.body);
        res.status(201).json({ success: true, data: ziyarat });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const currency = await CurrencySettings.getRate();
        if (req.body.ratePerPersonSAR) req.body.ratePerPersonPKR = req.body.ratePerPersonSAR * currency.sarToPkr;
        if (req.body.ratePerGroupSAR) req.body.ratePerGroupPKR = req.body.ratePerGroupSAR * currency.sarToPkr;
        req.body.updatedBy = req.user._id;
        const ziyarat = await Ziyarat.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!ziyarat) return res.status(404).json({ success: false, message: 'Ziyarat not found' });
        res.json({ success: true, data: ziyarat });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const ziyarat = await Ziyarat.findByIdAndUpdate(req.params.id, { isActive: false, updatedBy: req.user._id }, { new: true });
        if (!ziyarat) return res.status(404).json({ success: false, message: 'Ziyarat not found' });
        res.json({ success: true, data: ziyarat, message: 'Ziyarat deactivated' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
