const express = require('express');
const Package = require('../models/Package');
const { protect } = require('../middleware/auth');
const router = express.Router();

router.use(protect);

const PASSPORT_EXPIRY_WARNING_DAYS = 180; // 6 months

// GET /api/visas
// Cross-package view of every roster entry. Filters: status, packageStatus, search, departureFrom, departureTo
// Returns a flat list with passport-expiry flag.
router.get('/', async (req, res) => {
    try {
        const { status, packageStatus = 'active', search, departureFrom, departureTo } = req.query;

        const pkgQuery = { isActive: true };
        if (packageStatus === 'active') pkgQuery.status = { $in: ['draft', 'quoted', 'confirmed', 'deposit_received', 'fully_paid'] };
        else if (packageStatus !== 'all') pkgQuery.status = packageStatus;

        if (departureFrom || departureTo) {
            pkgQuery['travelDates.departure'] = {};
            if (departureFrom) pkgQuery['travelDates.departure'].$gte = new Date(departureFrom);
            if (departureTo) pkgQuery['travelDates.departure'].$lte = new Date(departureTo);
        }

        const packages = await Package.find(pkgQuery)
            .populate('pilgrims.pilgrim')
            .select('voucherId packageName status travelDates pilgrims')
            .lean();

        const now = Date.now();
        const expiryThreshold = now + PASSPORT_EXPIRY_WARNING_DAYS * 86400000;
        const s = (search || '').trim().toLowerCase();

        const rows = [];
        for (const pkg of packages) {
            for (const entry of (pkg.pilgrims || [])) {
                if (status && entry.visaStatus !== status) continue;
                const c = entry.pilgrim || {};
                if (s) {
                    const blob = `${c.fullName || ''} ${c.passportNumber || ''} ${c.cnic || ''} ${entry.visaNumber || ''} ${pkg.voucherId || ''} ${pkg.packageName || ''}`.toLowerCase();
                    if (!blob.includes(s)) continue;
                }
                const passportExpiry = c.passportExpiry ? new Date(c.passportExpiry).getTime() : null;
                let passportFlag = null;
                if (!c.passportNumber) passportFlag = 'missing';
                else if (passportExpiry && passportExpiry < now) passportFlag = 'expired';
                else if (passportExpiry && passportExpiry < expiryThreshold) passportFlag = 'expiring_soon';

                rows.push({
                    entryId: entry._id,
                    packageId: pkg._id,
                    voucherId: pkg.voucherId,
                    packageName: pkg.packageName,
                    packageStatus: pkg.status,
                    departure: pkg.travelDates?.departure || null,
                    pilgrimId: c._id,
                    fullName: c.fullName || '—',
                    gender: c.gender || '—',
                    cnic: c.cnic || '',
                    phone: c.phone || '',
                    passportNumber: c.passportNumber || '',
                    passportExpiry: c.passportExpiry || null,
                    passportFlag,
                    visaStatus: entry.visaStatus || 'not_started',
                    passportStatus: entry.passportStatus || 'not_collected',
                    visaNumber: entry.visaNumber || '',
                    mutamirNumber: entry.mutamirNumber || '',
                    mofaApplicationDate: entry.mofaApplicationDate || null,
                    visaIssuedDate: entry.visaIssuedDate || null,
                    visaExpiryDate: entry.visaExpiryDate || null
                });
            }
        }

        // Sort by departure date asc (urgency), then by status
        rows.sort((a, b) => {
            const da = a.departure ? new Date(a.departure).getTime() : Infinity;
            const db = b.departure ? new Date(b.departure).getTime() : Infinity;
            return da - db;
        });

        // Build status counts
        const statusCounts = rows.reduce((acc, r) => {
            acc[r.visaStatus] = (acc[r.visaStatus] || 0) + 1;
            return acc;
        }, {});
        const passportFlagCounts = rows.reduce((acc, r) => {
            if (r.passportFlag) acc[r.passportFlag] = (acc[r.passportFlag] || 0) + 1;
            return acc;
        }, {});

        res.json({
            success: true,
            data: rows,
            count: rows.length,
            statusCounts,
            passportFlagCounts
        });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

module.exports = router;
