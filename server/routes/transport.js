const express = require('express');
const Transport = require('../models/Transport');
const CurrencySettings = require('../models/CurrencySettings');
const { protect, authorize } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/auditLog');
const { OPS } = require('../middleware/roles');
const { qStr, clampLimit, safeSearchRegex, stripFields, PROTECTED_FIELDS } = require('../utils/sanitize');
const router = express.Router();

router.use(protect);
router.use(auditMiddleware('Transport'));

// ratePerPersonPKR / ratePerVehiclePKR are derived server-side from their SAR values; isActive changes only via DELETE.
const TRANSPORT_PROTECTED = [...PROTECTED_FIELDS, 'isActive', 'ratePerPersonPKR', 'ratePerVehiclePKR'];

router.get('/', async (req, res) => {
    try {
        const { search, page = 1, status } = req.query;
        const limit = clampLimit(req.query.limit, { def: 50, max: 200 });
        const query = {};
        if (search) {
            const rx = safeSearchRegex(search);
            query.$or = [
                { typeName: rx },
                { route: rx }
            ];
        }
        const st = qStr(status);
        if (st === 'active') query.isActive = true;
        if (st === 'inactive') query.isActive = false;

        const total = await Transport.countDocuments(query);
        const items = await Transport.find(query).sort('-createdAt').skip((page - 1) * limit).limit(limit).populate('createdBy', 'name');
        res.json({ success: true, data: items, count: items.length, total, pagination: { page: parseInt(page), limit, pages: Math.ceil(total / limit) } });
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

router.post('/', authorize(...OPS), async (req, res) => {
    try {
        stripFields(req.body, TRANSPORT_PROTECTED);
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

router.put('/:id', authorize(...OPS), async (req, res) => {
    try {
        stripFields(req.body, TRANSPORT_PROTECTED);
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

router.delete('/:id', authorize(...OPS), async (req, res) => {
    try {
        const item = await Transport.findByIdAndUpdate(req.params.id, { isActive: false, updatedBy: req.user._id }, { new: true });
        if (!item) return res.status(404).json({ success: false, message: 'Transport not found' });
        res.json({ success: true, data: item, message: 'Transport deactivated' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
