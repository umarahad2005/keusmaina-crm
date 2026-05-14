const express = require('express');
const Package = require('../models/Package');
const Airline = require('../models/Airline');
const HotelMakkah = require('../models/HotelMakkah');
const HotelMadinah = require('../models/HotelMadinah');
const Ziyarat = require('../models/Ziyarat');
const Transport = require('../models/Transport');
const SpecialService = require('../models/SpecialService');
const Departure = require('../models/Departure');
const CurrencySettings = require('../models/CurrencySettings');
const { protect } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/auditLog');
const { applyAirlineDelta, checkAirlineCapacity, hotelAvailability } = require('../utils/allotment');
const { uploadSingle, buildDocFromUpload, deleteUploadedFile } = require('../utils/upload');
const router = express.Router();

router.use(protect);
router.use(auditMiddleware('Package'));

// Pick the rate period whose [validFrom, validTo] window contains travelDate.
// Falls back to the cheapest available rate when nothing matches (so a partial
// match never silently picks a high season rate).
function pickRateForDate(rates, travelDate) {
    if (!Array.isArray(rates) || rates.length === 0) return null;
    if (travelDate) {
        const t = new Date(travelDate).getTime();
        const match = rates.find(r => {
            const from = r.validFrom ? new Date(r.validFrom).getTime() : -Infinity;
            const to = r.validTo ? new Date(r.validTo).getTime() : Infinity;
            return t >= from && t <= to;
        });
        if (match) return match;
    }
    return [...rates].sort((a, b) => (a.rateSAR || 0) - (b.rateSAR || 0))[0];
}

async function resolveHotelRate(HotelModel, hotelComp, travelDate) {
    if (!hotelComp?.hotel) return { rateSAR: 0, source: null, period: null };
    const hotel = await HotelModel.findById(hotelComp.hotel);
    if (!hotel) return { rateSAR: Number(hotelComp.ratePerNightSAR || 0), source: null, period: null };
    const room = (hotel.roomTypes || []).find(r => r.typeName === hotelComp.roomType);
    if (!room) return { rateSAR: Number(hotelComp.ratePerNightSAR || 0), source: hotel, period: null };
    const period = pickRateForDate(room.rates, travelDate);
    return {
        rateSAR: period ? Number(period.rateSAR || 0) : Number(hotelComp.ratePerNightSAR || 0),
        source: hotel,
        period
    };
}

// When a package is part of a Departure, the shared components live on the
// Departure. Merge them with the package's own (specialServices stay local).
async function resolveEffectiveComponents(packageBody) {
    const own = packageBody.components || {};
    if (!packageBody.departure) return { components: own, travelDates: packageBody.travelDates };
    const dep = await Departure.findById(packageBody.departure);
    if (!dep) return { components: own, travelDates: packageBody.travelDates };
    const merged = {
        airline: dep.components?.airline || own.airline,
        makkahHotel: dep.components?.makkahHotel?.hotel
            ? { ...dep.components.makkahHotel.toObject?.() ?? dep.components.makkahHotel, ratePerNightSAR: own.makkahHotel?.ratePerNightSAR || 0 }
            : own.makkahHotel,
        madinahHotel: dep.components?.madinahHotel?.hotel
            ? { ...dep.components.madinahHotel.toObject?.() ?? dep.components.madinahHotel, ratePerNightSAR: own.madinahHotel?.ratePerNightSAR || 0 }
            : own.madinahHotel,
        ziyarats: dep.components?.ziyarats?.length ? dep.components.ziyarats : (own.ziyarats || []),
        transportation: dep.components?.transportation?.length ? dep.components.transportation : (own.transportation || []),
        specialServices: own.specialServices || []
    };
    const travelDates = packageBody.travelDates?.departure
        ? packageBody.travelDates
        : { departure: dep.travelDates?.departure, returnDate: dep.travelDates?.returnDate };
    return { components: merged, travelDates };
}

// ─── PRICING ENGINE ──────────────────────────
async function calculatePricing(components, numberOfPilgrims, markupType, markupValue, travelDates) {
    const currency = await CurrencySettings.getRate();
    const rate = currency.sarToPkr;
    const n = numberOfPilgrims || 1;
    const departure = travelDates?.departure;
    let pricing = {
        airlineCostSAR: 0, makkahHotelCostSAR: 0, madinahHotelCostSAR: 0,
        ziyaratsCostSAR: 0, transportCostSAR: 0, servicesCostSAR: 0,
        makkahRatePerNightSAR: 0, makkahRateLabel: '',
        madinahRatePerNightSAR: 0, madinahRateLabel: ''
    };

    // Airline
    if (components.airline) {
        const airline = await Airline.findById(components.airline);
        if (airline) pricing.airlineCostSAR = (airline.ticketPriceSAR || 0) * n;
    }

    // Makkah Hotel — pick the rate matching the travel date
    if (components.makkahHotel?.hotel) {
        const nights = components.makkahHotel.nights || 0;
        const { rateSAR, period } = await resolveHotelRate(HotelMakkah, components.makkahHotel, departure);
        pricing.makkahRatePerNightSAR = rateSAR;
        pricing.makkahRateLabel = period?.label || '';
        pricing.makkahHotelCostSAR = rateSAR * nights;
    }

    // Madinah Hotel
    if (components.madinahHotel?.hotel) {
        const nights = components.madinahHotel.nights || 0;
        const { rateSAR, period } = await resolveHotelRate(HotelMadinah, components.madinahHotel, departure);
        pricing.madinahRatePerNightSAR = rateSAR;
        pricing.madinahRateLabel = period?.label || '';
        pricing.madinahHotelCostSAR = rateSAR * nights;
    }

    // Ziyarats
    if (components.ziyarats?.length) {
        const ziyarats = await Ziyarat.find({ _id: { $in: components.ziyarats } });
        pricing.ziyaratsCostSAR = ziyarats.reduce((sum, z) => sum + (z.ratePerPersonSAR || 0) * n, 0);
    }

    // Transport
    if (components.transportation?.length) {
        const transports = await Transport.find({ _id: { $in: components.transportation } });
        pricing.transportCostSAR = transports.reduce((sum, t) => sum + (t.ratePerPersonSAR || 0) * n, 0);
    }

    // Special Services
    if (components.specialServices?.length) {
        const services = await SpecialService.find({ _id: { $in: components.specialServices } });
        pricing.servicesCostSAR = services.reduce((sum, s) => {
            if (s.pricingType === 'perPerson') return sum + (s.rateSAR || 0) * n;
            return sum + (s.rateSAR || 0);
        }, 0);
    }

    // Subtotal
    pricing.subtotalSAR = pricing.airlineCostSAR + pricing.makkahHotelCostSAR + pricing.madinahHotelCostSAR + pricing.ziyaratsCostSAR + pricing.transportCostSAR + pricing.servicesCostSAR;
    pricing.subtotalPKR = Math.round(pricing.subtotalSAR * rate);

    // Markup
    pricing.markupType = markupType || 'fixed';
    pricing.markupValue = markupValue || 0;
    if (markupType === 'percentage') {
        pricing.markupAmountSAR = Math.round(pricing.subtotalSAR * markupValue / 100);
    } else {
        pricing.markupAmountSAR = markupValue || 0;
    }

    // Final
    pricing.finalPriceSAR = pricing.subtotalSAR + pricing.markupAmountSAR;
    pricing.finalPricePKR = Math.round(pricing.finalPriceSAR * rate);
    pricing.costPerPersonSAR = n > 0 ? Math.round(pricing.finalPriceSAR / n) : 0;
    pricing.costPerPersonPKR = n > 0 ? Math.round(pricing.finalPricePKR / n) : 0;

    return pricing;
}

// @route   GET /api/packages
router.get('/', async (req, res) => {
    try {
        const { search, page = 1, limit = 50, status } = req.query;
        const query = {};
        if (search) {
            query.$or = [
                { voucherId: { $regex: search, $options: 'i' } },
                { packageName: { $regex: search, $options: 'i' } }
            ];
        }
        if (status && status !== 'all') query.status = status;

        const total = await Package.countDocuments(query);
        const packages = await Package.find(query)
            .sort('-createdAt')
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .populate('client')
            .populate('createdBy', 'name');

        res.json({ success: true, data: packages, count: packages.length, total, pagination: { page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) } });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// @route   GET /api/packages/:id — full populated detail
router.get('/:id', async (req, res) => {
    try {
        const pkg = await Package.findById(req.params.id)
            .populate('departure')
            .populate('components.airline')
            .populate('components.makkahHotel.hotel')
            .populate('components.madinahHotel.hotel')
            .populate('components.ziyarats')
            .populate('components.transportation')
            .populate('components.specialServices')
            .populate('client')
            .populate('pilgrims.pilgrim')
            .populate('createdBy', 'name');

        if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });
        res.json({ success: true, data: pkg });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// ─── ROSTER ENDPOINTS ──────────────────────────

// POST /api/packages/:id/pilgrims  — add a pilgrim to the roster
router.post('/:id/pilgrims', async (req, res) => {
    try {
        if (!req.body.pilgrim) return res.status(400).json({ success: false, message: 'pilgrim id is required' });
        const pkg = await Package.findById(req.params.id);
        if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });

        const already = pkg.pilgrims.some(p => String(p.pilgrim) === String(req.body.pilgrim));
        if (already) return res.status(409).json({ success: false, message: 'Pilgrim already on the roster' });

        if (pkg.pilgrims.length >= (pkg.numberOfPilgrims || 0)) {
            // Auto-grow numberOfPilgrims so the user isn't stuck — flag in response.
            pkg.numberOfPilgrims = pkg.pilgrims.length + 1;
        }

        pkg.pilgrims.push(req.body);
        pkg.updatedBy = req.user._id;
        await pkg.save();
        await pkg.populate('pilgrims.pilgrim');
        res.status(201).json({ success: true, data: pkg });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// PUT /api/packages/:id/pilgrims/:entryId — update one roster entry
router.put('/:id/pilgrims/:entryId', async (req, res) => {
    try {
        const pkg = await Package.findById(req.params.id);
        if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });
        const entry = pkg.pilgrims.id(req.params.entryId);
        if (!entry) return res.status(404).json({ success: false, message: 'Roster entry not found' });

        const editable = ['makkahRoom', 'madinahRoom', 'ticketNumber', 'visaNumber', 'mutamirNumber', 'notes'];
        for (const k of editable) {
            if (req.body[k] !== undefined) entry[k] = req.body[k];
        }
        pkg.updatedBy = req.user._id;
        await pkg.save();
        await pkg.populate('pilgrims.pilgrim');
        res.json({ success: true, data: pkg });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// DELETE /api/packages/:id/pilgrims/:entryId — remove from roster
router.delete('/:id/pilgrims/:entryId', async (req, res) => {
    try {
        const pkg = await Package.findById(req.params.id);
        if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });
        const entry = pkg.pilgrims.id(req.params.entryId);
        if (!entry) return res.status(404).json({ success: false, message: 'Roster entry not found' });
        entry.deleteOne();
        pkg.updatedBy = req.user._id;
        await pkg.save();
        await pkg.populate('pilgrims.pilgrim');
        res.json({ success: true, data: pkg });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// POST /api/packages/:id/pilgrims/:entryId/documents — upload visa scan, MOFA approval, etc.
router.post('/:id/pilgrims/:entryId/documents', uploadSingle, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
        const pkg = await Package.findById(req.params.id);
        if (!pkg) { deleteUploadedFile(req.file.filename); return res.status(404).json({ success: false, message: 'Package not found' }); }
        const entry = pkg.pilgrims.id(req.params.entryId);
        if (!entry) { deleteUploadedFile(req.file.filename); return res.status(404).json({ success: false, message: 'Roster entry not found' }); }
        entry.documents.push(buildDocFromUpload(req));
        pkg.updatedBy = req.user._id;
        await pkg.save();
        await pkg.populate('pilgrims.pilgrim');
        res.status(201).json({ success: true, data: pkg });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.delete('/:id/pilgrims/:entryId/documents/:docId', async (req, res) => {
    try {
        const pkg = await Package.findById(req.params.id);
        if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });
        const entry = pkg.pilgrims.id(req.params.entryId);
        if (!entry) return res.status(404).json({ success: false, message: 'Roster entry not found' });
        const doc = entry.documents.id(req.params.docId);
        if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
        deleteUploadedFile(doc.filename);
        doc.deleteOne();
        pkg.updatedBy = req.user._id;
        await pkg.save();
        await pkg.populate('pilgrims.pilgrim');
        res.json({ success: true, data: pkg });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// PATCH /api/packages/:id/pilgrims/:entryId/visa-status
// Body: { status, notes?, visaNumber?, mutamirNumber?, mofaApplicationDate?, visaIssuedDate?, visaExpiryDate? }
const { VISA_STAGES, PASSPORT_STATES } = require('../models/Package');
router.patch('/:id/pilgrims/:entryId/visa-status', async (req, res) => {
    try {
        const { status, passportStatus, notes = '', visaNumber, mutamirNumber, mofaApplicationDate, visaIssuedDate, visaExpiryDate } = req.body;
        if (status && !VISA_STAGES.includes(status)) {
            return res.status(400).json({ success: false, message: `Invalid visa status. Allowed: ${VISA_STAGES.join(', ')}` });
        }
        if (passportStatus && !PASSPORT_STATES.includes(passportStatus)) {
            return res.status(400).json({ success: false, message: `Invalid passport status. Allowed: ${PASSPORT_STATES.join(', ')}` });
        }

        const pkg = await Package.findById(req.params.id);
        if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });
        const entry = pkg.pilgrims.id(req.params.entryId);
        if (!entry) return res.status(404).json({ success: false, message: 'Roster entry not found' });

        // Apply status change + auto-stamp matching date if missing
        if (status && status !== entry.visaStatus) {
            entry.visaStatus = status;
            entry.visaTimeline.push({ status, by: req.user._id, at: new Date(), notes });
            const today = new Date();
            if (status === 'mofa_submitted' && !entry.mofaApplicationDate) entry.mofaApplicationDate = today;
            if (status === 'visa_issued' && !entry.visaIssuedDate) entry.visaIssuedDate = today;
            if (status === 'passport_collected' && entry.passportStatus === 'not_collected') entry.passportStatus = 'collected';
        }
        if (passportStatus) entry.passportStatus = passportStatus;
        if (visaNumber !== undefined) entry.visaNumber = visaNumber;
        if (mutamirNumber !== undefined) entry.mutamirNumber = mutamirNumber;
        if (mofaApplicationDate !== undefined) entry.mofaApplicationDate = mofaApplicationDate || undefined;
        if (visaIssuedDate !== undefined) entry.visaIssuedDate = visaIssuedDate || undefined;
        if (visaExpiryDate !== undefined) entry.visaExpiryDate = visaExpiryDate || undefined;

        pkg.updatedBy = req.user._id;
        await pkg.save();
        await pkg.populate('pilgrims.pilgrim');
        res.json({ success: true, data: pkg });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// GET /api/packages/:id/invoice-data — pricing breakdown + payments applied + balance due
const LedgerEntry = require('../models/LedgerEntry');
router.get('/:id/invoice-data', async (req, res) => {
    try {
        const pkg = await Package.findById(req.params.id)
            .populate('client')
            .populate('components.airline', 'name flightNumber')
            .populate('components.makkahHotel.hotel', 'name')
            .populate('components.madinahHotel.hotel', 'name')
            .populate('components.ziyarats', 'name location')
            .populate('components.transportation', 'typeName')
            .populate('components.specialServices', 'name');
        if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });

        // Payments applied to this package (credits in client ledger linked to this package)
        const payments = await LedgerEntry.find({ package: pkg._id, type: 'credit', isActive: true })
            .sort('-date')
            .populate('createdBy', 'name')
            .lean();

        const totalPaidPKR = payments.reduce((s, p) => s + (p.currency === 'PKR' ? p.amount : 0), 0);
        const totalPaidSAR = payments.reduce((s, p) => s + (p.currency === 'SAR' ? p.amount : 0), 0);

        // Re-derive PKR from current FX rate (don't trust the saved snapshot).
        const currency = await CurrencySettings.getRate();
        const finalSAR = pkg.pricingSummary?.finalPriceSAR || 0;
        const finalPKR = Math.round(finalSAR * currency.sarToPkr);
        const paidSAR_inPKR = Math.round(totalPaidSAR * currency.sarToPkr);
        const balancePKR = Math.max(0, finalPKR - totalPaidPKR - paidSAR_inPKR);

        res.json({
            success: true,
            data: {
                package: pkg,
                payments,
                totals: { finalPKR, finalSAR, totalPaidPKR, totalPaidSAR, balancePKR }
            }
        });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// GET /api/packages/:id/profit — sell vs supplier-cost summary
const SupplierLedger = require('../models/SupplierLedger');

// Compute one package's share of departure-level supplier debits.
// Allocation rule: by pilgrim headcount across all packages linked to the
// same departure. Equal split as fallback when headcounts are all zero.
async function computeAllocatedDepartureCosts(pkg) {
    if (!pkg.departure) return { allocatedPKR: 0, sharePct: 0, sourceEntries: [], totalBatchCostPKR: 0 };

    const sharedEntries = await SupplierLedger.find({ departure: pkg.departure, type: 'debit' })
        .populate('supplier', 'name type').lean();
    const totalBatchCostPKR = sharedEntries.reduce((s, e) => s + (e.amountPKR || 0), 0);
    if (totalBatchCostPKR === 0) return { allocatedPKR: 0, sharePct: 0, sourceEntries: [], totalBatchCostPKR: 0 };

    const siblings = await Package.find({ departure: pkg.departure, isActive: true })
        .select('_id numberOfPilgrims').lean();
    const totalPilgrims = siblings.reduce((s, p) => s + (p.numberOfPilgrims || 0), 0);
    const myCount = pkg.numberOfPilgrims || 0;

    let sharePct;
    if (totalPilgrims > 0) sharePct = myCount / totalPilgrims;
    else sharePct = siblings.length > 0 ? 1 / siblings.length : 0;

    const allocatedPKR = Math.round(totalBatchCostPKR * sharePct);
    return { allocatedPKR, sharePct, sourceEntries: sharedEntries, totalBatchCostPKR };
}

router.get('/:id/profit', async (req, res) => {
    try {
        const pkg = await Package.findById(req.params.id).select('voucherId packageName pricingSummary departure numberOfPilgrims');
        if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });

        // Direct costs — supplier debits explicitly linked to this package
        const directEntries = await SupplierLedger.find({ package: pkg._id, type: 'debit' })
            .populate('supplier', 'name type').lean();

        const breakdown = {};
        let directCostPKR = 0;
        for (const e of directEntries) {
            const k = e.category || 'other';
            breakdown[k] = (breakdown[k] || 0) + (e.amountPKR || 0);
            directCostPKR += e.amountPKR || 0;
        }

        // Allocated costs — share of debits linked to the departure batch
        const allocation = await computeAllocatedDepartureCosts(pkg);
        if (allocation.allocatedPKR > 0) {
            breakdown.batch_allocated = (breakdown.batch_allocated || 0) + allocation.allocatedPKR;
        }

        const totalCostPKR = directCostPKR + allocation.allocatedPKR;
        // Recompute revenue PKR at the *current* FX rate, not the snapshot taken
        // when the package was saved, so old packages don't show stale PKR.
        const currency = await CurrencySettings.getRate();
        const sellPKR = Math.round((pkg.pricingSummary?.finalPriceSAR || 0) * currency.sarToPkr);
        const profit = sellPKR - totalCostPKR;
        const margin = sellPKR > 0 ? (profit / sellPKR) * 100 : 0;

        res.json({
            success: true,
            data: {
                voucherId: pkg.voucherId,
                packageName: pkg.packageName,
                sellPKR,
                directCostPKR,
                allocatedCostPKR: allocation.allocatedPKR,
                totalCostPKR,
                profitPKR: profit,
                marginPct: Math.round(margin * 10) / 10,
                breakdown,
                allocation: pkg.departure ? {
                    sharePct: Math.round(allocation.sharePct * 1000) / 10,
                    totalBatchCostPKR: allocation.totalBatchCostPKR
                } : null,
                entries: directEntries.map(e => ({
                    _id: e._id, date: e.date, description: e.description,
                    supplier: e.supplier?.name || '—', category: e.category,
                    amountPKR: e.amountPKR, kind: 'direct'
                }))
            }
        });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// GET /api/packages/:id/manifest — flat printable roster
router.get('/:id/manifest', async (req, res) => {
    try {
        const pkg = await Package.findById(req.params.id)
            .populate('pilgrims.pilgrim')
            .populate('components.airline')
            .populate('components.makkahHotel.hotel')
            .populate('components.madinahHotel.hotel')
            .populate('client');
        if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });

        const manifest = pkg.pilgrims.map((p, i) => ({
            index: i + 1,
            fullName: p.pilgrim?.fullName || '—',
            gender: p.pilgrim?.gender || '—',
            cnic: p.pilgrim?.cnic || '—',
            passportNumber: p.pilgrim?.passportNumber || '—',
            passportExpiry: p.pilgrim?.passportExpiry || null,
            mahram: p.pilgrim?.mahramDetails?.name ? `${p.pilgrim.mahramDetails.name} (${p.pilgrim.mahramDetails.relation || ''})` : '—',
            phone: p.pilgrim?.phone || '—',
            makkahRoom: p.makkahRoom || '—',
            madinahRoom: p.madinahRoom || '—',
            ticketNumber: p.ticketNumber || '—',
            visaNumber: p.visaNumber || '—',
            mutamirNumber: p.mutamirNumber || '—'
        }));

        res.json({
            success: true,
            data: {
                voucherId: pkg.voucherId,
                packageName: pkg.packageName,
                travelDates: pkg.travelDates,
                airline: pkg.components?.airline ? { name: pkg.components.airline.name, flightNumber: pkg.components.airline.flightNumber, departure: pkg.components.airline.departureDateTime } : null,
                makkahHotel: pkg.components?.makkahHotel?.hotel?.name || null,
                madinahHotel: pkg.components?.madinahHotel?.hotel?.name || null,
                client: pkg.client?.fullName || pkg.client?.companyName || null,
                expectedCount: pkg.numberOfPilgrims,
                actualCount: manifest.length,
                manifest
            }
        });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// @route   POST /api/packages
router.post('/', async (req, res) => {
    try {
        // Sanitize empty ObjectId fields to prevent BSONError
        if (!req.body.client) {
            delete req.body.client;
            delete req.body.clientModel;
            delete req.body.clientType;
        }
        if (req.body.components) {
            if (!req.body.components.airline) delete req.body.components.airline;
            if (!req.body.components.makkahHotel?.hotel) {
                if (req.body.components.makkahHotel) req.body.components.makkahHotel.hotel = undefined;
            }
            if (!req.body.components.madinahHotel?.hotel) {
                if (req.body.components.madinahHotel) req.body.components.madinahHotel.hotel = undefined;
            }
        }

        // If linked to a Departure, materialize shared components onto the package
        // so the saved record is self-contained (and future Departure edits don't
        // silently rewrite finalized bookings).
        const { components: effComponents, travelDates: effTravelDates } = await resolveEffectiveComponents(req.body);
        req.body.components = effComponents;
        req.body.travelDates = effTravelDates;

        // Calculate pricing (looks up correct seasonal hotel rate by travel date)
        const pricing = await calculatePricing(
            req.body.components || {},
            req.body.numberOfPilgrims,
            req.body.pricingSummary?.markupType,
            req.body.pricingSummary?.markupValue,
            req.body.travelDates
        );
        // Stamp resolved per-night rate onto the package's hotel components so
        // the saved record always reflects the rate that was actually charged.
        if (req.body.components?.makkahHotel?.hotel) {
            req.body.components.makkahHotel.ratePerNightSAR = pricing.makkahRatePerNightSAR;
        }
        if (req.body.components?.madinahHotel?.hotel) {
            req.body.components.madinahHotel.ratePerNightSAR = pricing.madinahRatePerNightSAR;
        }
        req.body.pricingSummary = pricing;
        req.body.createdBy = req.user._id;

        // Capacity guard before persisting (only matters when status consumes seats).
        const capErr = await checkAirlineCapacity(null, req.body);
        if (capErr) return res.status(409).json({ success: false, message: capErr.message });

        const pkg = await Package.create(req.body);
        await applyAirlineDelta(null, pkg);
        res.status(201).json({ success: true, data: pkg });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// @route   PUT /api/packages/:id
router.put('/:id', async (req, res) => {
    try {
        // Sanitize empty ObjectId fields
        if (req.body.client === '') {
            delete req.body.client;
            delete req.body.clientModel;
            delete req.body.clientType;
        }

        if (req.body.components) {
            if (!req.body.components.airline) delete req.body.components.airline;
            if (!req.body.components.makkahHotel?.hotel) {
                if (req.body.components.makkahHotel) req.body.components.makkahHotel.hotel = undefined;
            }
            if (!req.body.components.madinahHotel?.hotel) {
                if (req.body.components.madinahHotel) req.body.components.madinahHotel.hotel = undefined;
            }

            // Resolve from departure if linked
            const { components: effComponents, travelDates: effTravelDates } = await resolveEffectiveComponents(req.body);
            req.body.components = effComponents;
            req.body.travelDates = effTravelDates;

            const pricing = await calculatePricing(
                req.body.components,
                req.body.numberOfPilgrims,
                req.body.pricingSummary?.markupType,
                req.body.pricingSummary?.markupValue,
                req.body.travelDates
            );
            if (req.body.components?.makkahHotel?.hotel) {
                req.body.components.makkahHotel.ratePerNightSAR = pricing.makkahRatePerNightSAR;
            }
            if (req.body.components?.madinahHotel?.hotel) {
                req.body.components.madinahHotel.ratePerNightSAR = pricing.madinahRatePerNightSAR;
            }
            req.body.pricingSummary = pricing;
        }
        req.body.updatedBy = req.user._id;

        const oldPkg = await Package.findById(req.params.id).lean();
        if (!oldPkg) return res.status(404).json({ success: false, message: 'Package not found' });

        // Project the merged state so capacity check sees what would actually be saved.
        const projected = {
            ...oldPkg,
            ...req.body,
            components: { ...(oldPkg.components || {}), ...(req.body.components || {}) }
        };
        const capErr = await checkAirlineCapacity(oldPkg, projected);
        if (capErr) return res.status(409).json({ success: false, message: capErr.message });

        const pkg = await Package.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        await applyAirlineDelta(oldPkg, pkg);
        res.json({ success: true, data: pkg });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// @route   POST /api/packages/calculate-pricing — preview pricing without saving
router.post('/calculate-pricing', async (req, res) => {
    try {
        // Mirror the POST/PUT behaviour: resolve departure components first
        const { components: effComponents, travelDates: effTravelDates } = await resolveEffectiveComponents({
            departure: req.body.departure,
            components: req.body.components,
            travelDates: req.body.travelDates
        });
        const pricing = await calculatePricing(
            effComponents,
            req.body.numberOfPilgrims,
            req.body.markupType,
            req.body.markupValue,
            effTravelDates
        );
        res.json({ success: true, data: pricing });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// @route   DELETE /api/packages/:id
router.delete('/:id', async (req, res) => {
    try {
        const oldPkg = await Package.findById(req.params.id).lean();
        if (!oldPkg) return res.status(404).json({ success: false, message: 'Package not found' });
        const pkg = await Package.findByIdAndUpdate(req.params.id, { isActive: false, status: 'cancelled', updatedBy: req.user._id }, { new: true });
        await applyAirlineDelta(oldPkg, pkg);
        res.json({ success: true, data: pkg, message: 'Package cancelled' });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// @route   PATCH /api/packages/bulk-status
// Bulk advance many packages to the same status. Used by the list-view checkbox actions.
router.patch('/bulk-status', async (req, res) => {
    try {
        const { ids, status } = req.body;
        const allowed = ['draft', 'quoted', 'confirmed', 'deposit_received', 'fully_paid', 'completed', 'cancelled'];
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, message: 'ids array is required' });
        }
        if (!allowed.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }
        // Run each through the airline-delta logic so seat counts stay correct
        const updates = [];
        for (const id of ids) {
            const oldPkg = await Package.findById(id).lean();
            if (!oldPkg) continue;
            const pkg = await Package.findByIdAndUpdate(id, { status, updatedBy: req.user._id }, { new: true });
            await applyAirlineDelta(oldPkg, pkg);
            updates.push(pkg._id);
        }
        res.json({ success: true, updated: updates.length, ids: updates });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

module.exports = router;
