const express = require('express');
const SpecialService = require('../models/SpecialService');
const CurrencySettings = require('../models/CurrencySettings');
const { protect, authorize } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/auditLog');
const { OPS } = require('../middleware/roles');
const { qStr, clampLimit, safeSearchRegex, stripFields, PROTECTED_FIELDS } = require('../utils/sanitize');
const router = express.Router();

router.use(protect);
router.use(auditMiddleware('SpecialService'));

// ratePKR is derived server-side from rateSAR; isActive changes only via DELETE.
const SPECIAL_SERVICE_PROTECTED = [...PROTECTED_FIELDS, 'isActive', 'ratePKR'];

router.get('/', async (req, res) => {
    try {
        const { search, page = 1, status } = req.query;
        const limit = clampLimit(req.query.limit, { def: 50, max: 200 });
        const query = {};
        if (search) query.name = safeSearchRegex(search);
        const st = qStr(status);
        if (st === 'active') query.isActive = true;
        if (st === 'inactive') query.isActive = false;

        const total = await SpecialService.countDocuments(query);
        const items = await SpecialService.find(query).sort('-createdAt').skip((page - 1) * limit).limit(limit).populate('createdBy', 'name');
        res.json({ success: true, data: items, count: items.length, total, pagination: { page: parseInt(page), limit, pages: Math.ceil(total / limit) } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const item = await SpecialService.findById(req.params.id).populate('createdBy', 'name');
        if (!item) return res.status(404).json({ success: false, message: 'Service not found' });
        res.json({ success: true, data: item });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/', authorize(...OPS), async (req, res) => {
    try {
        stripFields(req.body, SPECIAL_SERVICE_PROTECTED);
        const currency = await CurrencySettings.getRate();
        if (req.body.rateSAR) req.body.ratePKR = req.body.rateSAR * currency.sarToPkr;
        req.body.createdBy = req.user._id;
        const item = await SpecialService.create(req.body);
        res.status(201).json({ success: true, data: item });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

router.put('/:id', authorize(...OPS), async (req, res) => {
    try {
        stripFields(req.body, SPECIAL_SERVICE_PROTECTED);
        if (req.body.rateSAR) {
            const currency = await CurrencySettings.getRate();
            req.body.ratePKR = req.body.rateSAR * currency.sarToPkr;
        }
        req.body.updatedBy = req.user._id;
        const item = await SpecialService.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!item) return res.status(404).json({ success: false, message: 'Service not found' });
        res.json({ success: true, data: item });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

router.delete('/:id', authorize(...OPS), async (req, res) => {
    try {
        const item = await SpecialService.findByIdAndUpdate(req.params.id, { isActive: false, updatedBy: req.user._id }, { new: true });
        if (!item) return res.status(404).json({ success: false, message: 'Service not found' });
        res.json({ success: true, data: item, message: 'Service deactivated' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
