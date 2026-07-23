const express = require('express');
const FixedPackage = require('../models/FixedPackage');
const Package = require('../models/Package');
const SupplierLedger = require('../models/SupplierLedger');
const { protect, authorize } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/auditLog');
const { PACKAGES } = require('../middleware/roles');
const { qStr, clampLimit, safeSearchRegex, stripFields, PROTECTED_FIELDS } = require('../utils/sanitize');
const router = express.Router();

router.use(protect);
router.use(auditMiddleware('FixedPackage'));

// isActive flips only via DELETE; status has its own PATCH endpoint.
const FP_PROTECTED = [...PROTECTED_FIELDS, 'isActive'];

// GET /api/fixed-packages — inventory list
router.get('/', async (req, res) => {
    try {
        const { search, status, supplier } = req.query;
        const limit = clampLimit(req.query.limit, { def: 100, max: 200 });
        const q = { isActive: true };
        const st = qStr(status);
        if (st && st !== 'all') q.status = st;
        if (supplier) q.supplier = qStr(supplier);
        if (search) q.name = safeSearchRegex(search);

        const items = await FixedPackage.find(q)
            .sort('-createdAt')
            .limit(limit)
            .populate('supplier', 'name type')
            .populate('components.airline', 'name flightNumber')
            .populate('components.makkahHotel.hotel', 'name')
            .populate('components.madinahHotel.hotel', 'name');
        res.json({ success: true, data: items, count: items.length });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// GET /api/fixed-packages/:id
router.get('/:id', async (req, res) => {
    try {
        const item = await FixedPackage.findById(req.params.id)
            .populate('supplier', 'name type')
            .populate('components.airline')
            .populate('components.makkahHotel.hotel', 'name')
            .populate('components.madinahHotel.hotel', 'name')
            .populate('components.ziyarats', 'name')
            .populate('components.transportation', 'typeName');
        if (!item) return res.status(404).json({ success: false, message: 'Fixed package not found' });
        res.json({ success: true, data: item });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// POST /api/fixed-packages
router.post('/', authorize(...PACKAGES), async (req, res) => {
    try {
        stripFields(req.body, FP_PROTECTED);
        if (!req.body.components?.airline) delete req.body.components?.airline;
        req.body.createdBy = req.user._id;
        const item = await FixedPackage.create(req.body);
        res.status(201).json({ success: true, data: item });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// PUT /api/fixed-packages/:id
router.put('/:id', authorize(...PACKAGES), async (req, res) => {
    try {
        stripFields(req.body, FP_PROTECTED);
        req.body.updatedBy = req.user._id;
        const item = await FixedPackage.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!item) return res.status(404).json({ success: false, message: 'Fixed package not found' });
        res.json({ success: true, data: item });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// PATCH /api/fixed-packages/:id/status — the Active / Closed toggle
router.patch('/:id/status', authorize(...PACKAGES), async (req, res) => {
    try {
        const status = qStr(req.body.status);
        if (!['active', 'closed'].includes(status)) {
            return res.status(400).json({ success: false, message: "status must be 'active' or 'closed'" });
        }
        const item = await FixedPackage.findByIdAndUpdate(req.params.id, { status, updatedBy: req.user._id }, { new: true });
        if (!item) return res.status(404).json({ success: false, message: 'Fixed package not found' });
        res.json({ success: true, data: item });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// POST /api/fixed-packages/:id/sell — sell to a client
// Creates a real Package at the fixed sell price and records the supplier cost
// as a payable, so roster/visa/manifest/invoice/payment-tracking and profit all
// work through the existing machinery.
router.post('/:id/sell', authorize(...PACKAGES), async (req, res) => {
    try {
        const fp = await FixedPackage.findById(req.params.id);
        if (!fp || fp.isActive === false) return res.status(404).json({ success: false, message: 'Fixed package not found' });
        if (fp.status !== 'active') return res.status(409).json({ success: false, message: 'This fixed package is closed and cannot be sold. Set it Active first.' });

        const { client, clientType } = req.body;
        const N = parseInt(req.body.numberOfPilgrims, 10);
        if (!client || !['B2C', 'B2B'].includes(clientType)) {
            return res.status(400).json({ success: false, message: 'client and clientType (B2C or B2B) are required' });
        }
        if (!Number.isFinite(N) || N < 1) {
            return res.status(400).json({ success: false, message: 'numberOfPilgrims must be at least 1' });
        }

        const sellPerPerson = (fp.basePricePKR || 0) + (fp.markupPKR || 0);
        const costPerPerson = (fp.basePricePKR || 0) - (fp.supplierDiscountPKR || 0);
        const totalSell = sellPerPerson * N;
        const totalCost = costPerPerson * N;

        // 1. Create the package. We do NOT go through the packages route's airline
        //    allotment — the seats belong to the supplier, not our inventory.
        const pkg = await Package.create({
            packageName: fp.name,
            packageType: 'Umrah',
            source: 'fixed',
            client,
            clientModel: clientType === 'B2C' ? 'ClientB2C' : 'ClientB2B',
            clientType,
            numberOfPilgrims: N,
            duration: fp.duration,
            travelDates: fp.travelDates,
            components: fp.components,
            status: 'confirmed',
            pricingSummary: {
                finalPricePKR: totalSell,
                finalPriceSAR: 0,
                subtotalPKR: totalSell,
                costPerPersonPKR: sellPerPerson,
                markupType: 'fixed',
                markupValue: fp.markupPKR || 0
            },
            notes: `Sold from fixed-package inventory. Supplier cost ${costPerPerson}/pax.`,
            createdBy: req.user._id
        });

        // 2. Record what we owe the supplier as a payable (supplier-ledger debit),
        //    linked to the package so the existing profit report nets it out.
        await SupplierLedger.create({
            supplier: fp.supplier,
            type: 'debit',
            amount: totalCost,
            currency: 'PKR',
            amountPKR: totalCost,
            paymentMethod: 'invoice',
            category: 'service',
            package: pkg._id,
            description: `Fixed package cost: ${fp.name} × ${N} pax`,
            date: new Date(),
            createdBy: req.user._id
        });

        res.status(201).json({
            success: true,
            data: {
                package: pkg,
                totals: {
                    pilgrims: N,
                    sellPerPersonPKR: sellPerPerson,
                    costPerPersonPKR: costPerPerson,
                    totalSellPKR: totalSell,
                    totalCostPKR: totalCost,
                    totalProfitPKR: totalSell - totalCost
                }
            }
        });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// DELETE /api/fixed-packages/:id — soft delete
router.delete('/:id', authorize(...PACKAGES), async (req, res) => {
    try {
        const item = await FixedPackage.findByIdAndUpdate(req.params.id, { isActive: false, updatedBy: req.user._id }, { new: true });
        if (!item) return res.status(404).json({ success: false, message: 'Fixed package not found' });
        res.json({ success: true, data: item, message: 'Fixed package removed' });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

module.exports = router;
