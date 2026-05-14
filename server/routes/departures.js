const express = require('express');
const Departure = require('../models/Departure');
const Package = require('../models/Package');
const SupplierLedger = require('../models/SupplierLedger');
const CurrencySettings = require('../models/CurrencySettings');
const { protect } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/auditLog');
const router = express.Router();

router.use(protect);
router.use(auditMiddleware('Departure'));

// GET /api/departures
router.get('/', async (req, res) => {
    try {
        const { search, status, page = 1, limit = 50 } = req.query;
        const query = { isActive: true };
        if (search) {
            query.$or = [
                { code: { $regex: search, $options: 'i' } },
                { name: { $regex: search, $options: 'i' } },
                { season: { $regex: search, $options: 'i' } }
            ];
        }
        if (status && status !== 'all') query.status = status;

        const total = await Departure.countDocuments(query);
        const list = await Departure.find(query)
            .sort('-travelDates.departure')
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .populate('components.airline', 'name flightNumber')
            .populate('components.makkahHotel.hotel', 'name')
            .populate('components.madinahHotel.hotel', 'name')
            .lean();

        // Rollups: pilgrim count + package count per departure
        const ids = list.map(d => d._id);
        const pkgs = await Package.find({ departure: { $in: ids }, isActive: true })
            .select('departure numberOfPilgrims pilgrims status').lean();
        const rollups = {};
        for (const p of pkgs) {
            const key = String(p.departure);
            const r = rollups[key] = rollups[key] || { packages: 0, booked: 0, named: 0 };
            r.packages += 1;
            r.booked += p.numberOfPilgrims || 0;
            r.named += (p.pilgrims || []).length;
        }
        const data = list.map(d => ({ ...d, rollup: rollups[String(d._id)] || { packages: 0, booked: 0, named: 0 } }));

        res.json({ success: true, data, count: data.length, total });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// GET /api/departures/:id — full detail with linked packages
router.get('/:id', async (req, res) => {
    try {
        const dep = await Departure.findById(req.params.id)
            .populate('components.airline')
            .populate('components.makkahHotel.hotel')
            .populate('components.madinahHotel.hotel')
            .populate('components.ziyarats')
            .populate('components.transportation')
            .populate('createdBy', 'name')
            .lean();
        if (!dep) return res.status(404).json({ success: false, message: 'Departure not found' });

        const packages = await Package.find({ departure: dep._id, isActive: true })
            .sort('createdAt')
            .select('voucherId packageName status clientType client numberOfPilgrims pilgrims pricingSummary')
            .populate('client')
            .lean();

        res.json({ success: true, data: { ...dep, packages } });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// GET /api/departures/:id/manifest — every pilgrim across every linked package
router.get('/:id/manifest', async (req, res) => {
    try {
        const dep = await Departure.findById(req.params.id)
            .populate('components.airline')
            .populate('components.makkahHotel.hotel')
            .populate('components.madinahHotel.hotel');
        if (!dep) return res.status(404).json({ success: false, message: 'Departure not found' });

        const packages = await Package.find({ departure: dep._id, isActive: true })
            .select('voucherId packageName client clientType pilgrims numberOfPilgrims')
            .populate('client')
            .populate('pilgrims.pilgrim');

        const manifest = [];
        let i = 0;
        for (const pkg of packages) {
            for (const entry of pkg.pilgrims) {
                i += 1;
                const c = entry.pilgrim || {};
                manifest.push({
                    index: i,
                    voucherId: pkg.voucherId,
                    booker: pkg.client?.fullName || pkg.client?.companyName || '—',
                    fullName: c.fullName || '—',
                    gender: c.gender || '—',
                    cnic: c.cnic || '',
                    passportNumber: c.passportNumber || '',
                    passportExpiry: c.passportExpiry || null,
                    mahram: c.mahramDetails?.name ? `${c.mahramDetails.name} (${c.mahramDetails.relation || ''})` : '—',
                    phone: c.phone || '',
                    makkahRoom: entry.makkahRoom || '',
                    madinahRoom: entry.madinahRoom || '',
                    ticketNumber: entry.ticketNumber || '',
                    visaNumber: entry.visaNumber || '',
                    mutamirNumber: entry.mutamirNumber || '',
                    visaStatus: entry.visaStatus || 'not_started'
                });
            }
        }

        const expectedTotal = packages.reduce((s, p) => s + (p.numberOfPilgrims || 0), 0);

        res.json({
            success: true,
            data: {
                code: dep.code,
                name: dep.name,
                travelDates: dep.travelDates,
                airline: dep.components?.airline ? { name: dep.components.airline.name, flightNumber: dep.components.airline.flightNumber, departure: dep.components.airline.departureDateTime } : null,
                makkahHotel: dep.components?.makkahHotel?.hotel?.name || null,
                madinahHotel: dep.components?.madinahHotel?.hotel?.name || null,
                packageCount: packages.length,
                expectedTotal,
                actualTotal: manifest.length,
                manifest
            }
        });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// GET /api/departures/:id/profit — batch-level P&L
router.get('/:id/profit', async (req, res) => {
    try {
        const dep = await Departure.findById(req.params.id).select('code name capacity').lean();
        if (!dep) return res.status(404).json({ success: false, message: 'Departure not found' });

        const packages = await Package.find({ departure: dep._id, isActive: true })
            .select('_id voucherId packageName numberOfPilgrims pilgrims pricingSummary status').lean();

        // Recompute revenue PKR at current FX rate (don't trust saved snapshots).
        const currency = await CurrencySettings.getRate();
        const totalRevenueSAR = packages.reduce((s, p) => s + (p.pricingSummary?.finalPriceSAR || 0), 0);
        const totalRevenuePKR = Math.round(totalRevenueSAR * currency.sarToPkr);
        const totalPilgrims = packages.reduce((s, p) => s + (p.numberOfPilgrims || 0), 0);

        // All supplier debits — direct (per package) + shared (per departure)
        const directEntries = await SupplierLedger.find({
            package: { $in: packages.map(p => p._id) }, type: 'debit'
        }).populate('supplier', 'name').lean();
        const sharedEntries = await SupplierLedger.find({
            departure: dep._id, type: 'debit'
        }).populate('supplier', 'name').lean();

        const directCostPKR = directEntries.reduce((s, e) => s + (e.amountPKR || 0), 0);
        const sharedCostPKR = sharedEntries.reduce((s, e) => s + (e.amountPKR || 0), 0);
        const totalCostPKR = directCostPKR + sharedCostPKR;
        const profitPKR = totalRevenuePKR - totalCostPKR;
        const marginPct = totalRevenuePKR > 0 ? Math.round((profitPKR / totalRevenuePKR) * 1000) / 10 : 0;

        // Per-package breakdown — direct cost + allocated share of shared
        const perPackage = packages.map(p => {
            const myCount = p.numberOfPilgrims || 0;
            let sharePct;
            if (totalPilgrims > 0) sharePct = myCount / totalPilgrims;
            else sharePct = packages.length > 0 ? 1 / packages.length : 0;
            const allocated = Math.round(sharedCostPKR * sharePct);
            const direct = directEntries
                .filter(e => String(e.package) === String(p._id))
                .reduce((s, e) => s + (e.amountPKR || 0), 0);
            const sell = Math.round((p.pricingSummary?.finalPriceSAR || 0) * currency.sarToPkr);
            const cost = direct + allocated;
            return {
                packageId: p._id,
                voucherId: p.voucherId,
                packageName: p.packageName,
                status: p.status,
                pilgrims: myCount,
                sharePct: Math.round(sharePct * 1000) / 10,
                sellPKR: sell,
                directCostPKR: direct,
                allocatedCostPKR: allocated,
                totalCostPKR: cost,
                profitPKR: sell - cost
            };
        });

        res.json({
            success: true,
            data: {
                code: dep.code, name: dep.name,
                packageCount: packages.length, totalPilgrims, capacity: dep.capacity || 0,
                totalRevenuePKR, directCostPKR, sharedCostPKR, totalCostPKR, profitPKR, marginPct,
                perPackage,
                sharedEntries: sharedEntries.map(e => ({
                    _id: e._id, date: e.date, description: e.description,
                    supplier: e.supplier?.name || '—', category: e.category, amountPKR: e.amountPKR
                }))
            }
        });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// POST /api/departures
router.post('/', async (req, res) => {
    try {
        if (!req.body.travelDates?.departure) return res.status(400).json({ success: false, message: 'Departure date is required' });
        // Strip empty refs
        if (req.body.components) {
            if (!req.body.components.airline) delete req.body.components.airline;
            if (!req.body.components.makkahHotel?.hotel && req.body.components.makkahHotel) req.body.components.makkahHotel.hotel = undefined;
            if (!req.body.components.madinahHotel?.hotel && req.body.components.madinahHotel) req.body.components.madinahHotel.hotel = undefined;
        }
        req.body.createdBy = req.user._id;
        const dep = await Departure.create(req.body);
        res.status(201).json({ success: true, data: dep });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// PUT /api/departures/:id
router.put('/:id', async (req, res) => {
    try {
        if (req.body.components) {
            if (!req.body.components.airline) delete req.body.components.airline;
            if (!req.body.components.makkahHotel?.hotel && req.body.components.makkahHotel) req.body.components.makkahHotel.hotel = undefined;
            if (!req.body.components.madinahHotel?.hotel && req.body.components.madinahHotel) req.body.components.madinahHotel.hotel = undefined;
        }
        req.body.updatedBy = req.user._id;
        const dep = await Departure.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!dep) return res.status(404).json({ success: false, message: 'Departure not found' });
        res.json({ success: true, data: dep });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// DELETE /api/departures/:id (soft) — refuses if linked packages exist
router.delete('/:id', async (req, res) => {
    try {
        const linked = await Package.countDocuments({ departure: req.params.id, isActive: true });
        if (linked > 0) {
            return res.status(409).json({ success: false, message: `Cannot delete: ${linked} package(s) are still linked to this departure. Reassign or cancel them first.` });
        }
        const dep = await Departure.findByIdAndUpdate(req.params.id, { isActive: false, status: 'cancelled', updatedBy: req.user._id }, { new: true });
        if (!dep) return res.status(404).json({ success: false, message: 'Departure not found' });
        res.json({ success: true, data: dep });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

module.exports = router;
