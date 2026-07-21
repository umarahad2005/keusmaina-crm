const express = require('express');
const Ziyarat = require('../models/Ziyarat');
const CurrencySettings = require('../models/CurrencySettings');
const { protect, authorize } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/auditLog');
const { OPS } = require('../middleware/roles');
const { qStr, clampLimit, safeSearchRegex, stripFields, PROTECTED_FIELDS } = require('../utils/sanitize');
const router = express.Router();

router.use(protect);
router.use(auditMiddleware('Ziyarat'));

// ratePerPersonPKR / ratePerGroupPKR are derived server-side from their SAR values; isActive changes only via DELETE.
const ZIYARAT_PROTECTED = [...PROTECTED_FIELDS, 'isActive', 'ratePerPersonPKR', 'ratePerGroupPKR'];

router.get('/', async (req, res) => {
    try {
        const { search, page = 1, status, location } = req.query;
        const limit = clampLimit(req.query.limit, { def: 50, max: 200 });
        const query = {};
        if (search) query.name = safeSearchRegex(search);
        const st = qStr(status);
        if (st === 'active') query.isActive = true;
        if (st === 'inactive') query.isActive = false;
        const loc = qStr(location);
        if (loc) query.location = loc;

        const total = await Ziyarat.countDocuments(query);
        const ziyarats = await Ziyarat.find(query).sort('-createdAt').skip((page - 1) * limit).limit(limit).populate('createdBy', 'name');
        res.json({ success: true, data: ziyarats, count: ziyarats.length, total, pagination: { page: parseInt(page), limit, pages: Math.ceil(total / limit) } });
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

router.post('/', authorize(...OPS), async (req, res) => {
    try {
        stripFields(req.body, ZIYARAT_PROTECTED);
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

router.put('/:id', authorize(...OPS), async (req, res) => {
    try {
        stripFields(req.body, ZIYARAT_PROTECTED);
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

router.delete('/:id', authorize(...OPS), async (req, res) => {
    try {
        const ziyarat = await Ziyarat.findByIdAndUpdate(req.params.id, { isActive: false, updatedBy: req.user._id }, { new: true });
        if (!ziyarat) return res.status(404).json({ success: false, message: 'Ziyarat not found' });
        res.json({ success: true, data: ziyarat, message: 'Ziyarat deactivated' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
