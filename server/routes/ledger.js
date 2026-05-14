const express = require('express');
const LedgerEntry = require('../models/LedgerEntry');
const ClientB2C = require('../models/ClientB2C');
const ClientB2B = require('../models/ClientB2B');
const CurrencySettings = require('../models/CurrencySettings');
const { protect } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/auditLog');
const { uploadSingle, buildDocFromUpload, deleteUploadedFile } = require('../utils/upload');
const router = express.Router();

router.use(protect);
router.use(auditMiddleware('LedgerEntry'));

const toPKR = (amount, currency, rate) => currency === 'SAR' ? Number(amount) * rate : Number(amount);

// Build a Mongo query from common filter params
function buildFilterQuery(req) {
    const { search, clientType, type, clientId, dateFrom, dateTo, paymentMethod, package: pkg, departure, category } = req.query;
    const query = { isActive: true };

    if (clientType) query.clientType = clientType;
    if (type) query.type = type;
    if (clientId) query.client = clientId;
    if (paymentMethod) query.paymentMethod = paymentMethod;
    if (pkg) query.package = pkg;
    if (departure) query.departure = departure;
    if (category) query.category = category;

    if (dateFrom || dateTo) {
        query.date = {};
        if (dateFrom) query.date.$gte = new Date(dateFrom);
        if (dateTo) {
            const end = new Date(dateTo);
            end.setHours(23, 59, 59, 999);
            query.date.$lte = end;
        }
    }

    if (search) {
        query.$or = [
            { description: { $regex: search, $options: 'i' } },
            { voucherId: { $regex: search, $options: 'i' } },
            { referenceNumber: { $regex: search, $options: 'i' } }
        ];
    }
    return query;
}

// @route   GET /api/ledger
// @desc    Get all ledger entries (with filters)
router.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        const query = buildFilterQuery(req);

        const total = await LedgerEntry.countDocuments(query);
        const entries = await LedgerEntry.find(query)
            .sort('-date -createdAt')
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .populate('client')
            .populate('package', 'voucherId packageName')
            .populate('departure', 'code name')
            .populate('createdBy', 'name');

        res.json({ success: true, data: entries, count: entries.length, total, pagination: { page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) } });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// @route   GET /api/ledger/balance/:clientType/:clientId
// @desc    Get client balance summary
router.get('/balance/:clientType/:clientId', async (req, res) => {
    try {
        const { clientType, clientId } = req.params;
        const clientModel = clientType === 'B2C' ? 'ClientB2C' : 'ClientB2B';
        const balance = await LedgerEntry.getClientBalance(clientId, clientModel);

        const ClientModel = clientType === 'B2C' ? ClientB2C : ClientB2B;
        const client = await ClientModel.findById(clientId);

        res.json({ success: true, data: { ...balance, client } });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// @route   GET /api/ledger/client/:clientType/:clientId
// @desc    Full per-client ledger statement (client info + entries + balance + filters)
router.get('/client/:clientType/:clientId', async (req, res) => {
    try {
        const { clientType, clientId } = req.params;
        if (!['B2C', 'B2B'].includes(clientType)) {
            return res.status(400).json({ success: false, message: 'Invalid client type' });
        }
        const clientModel = clientType === 'B2C' ? 'ClientB2C' : 'ClientB2B';
        const ClientModel = clientType === 'B2C' ? ClientB2C : ClientB2B;

        const client = await ClientModel.findById(clientId).lean();
        if (!client) return res.status(404).json({ success: false, message: 'Client not found' });

        // Filtered entries (for the on-screen / printable statement)
        const filterQuery = { ...buildFilterQuery(req), client: clientId, clientModel };
        const entries = await LedgerEntry.find(filterQuery)
            .sort('date createdAt')
            .populate('package', 'voucherId packageName')
            .populate('departure', 'code name')
            .populate('createdBy', 'name')
            .lean();

        // Overall balance (unfiltered) so the header always shows true total
        const balance = await LedgerEntry.getClientBalance(clientId, clientModel);

        // Running balance row-by-row on the filtered set
        let running = 0;
        const withRunning = entries.map(e => {
            const amt = e.amountPKR ?? e.amount;
            running += e.type === 'debit' ? amt : -amt;
            return { ...e, runningBalancePKR: running };
        });

        // Filtered totals (for what's shown)
        const filteredTotals = entries.reduce((acc, e) => {
            const amtPKR = e.amountPKR ?? e.amount;
            if (e.type === 'debit') { acc.totalDebit += e.amount; acc.totalDebitPKR += amtPKR; }
            else { acc.totalCredit += e.amount; acc.totalCreditPKR += amtPKR; }
            return acc;
        }, { totalDebit: 0, totalCredit: 0, totalDebitPKR: 0, totalCreditPKR: 0 });
        filteredTotals.balancePKR = filteredTotals.totalDebitPKR - filteredTotals.totalCreditPKR;

        res.json({
            success: true,
            data: {
                client,
                clientType,
                entries: withRunning,
                balance,            // overall
                filteredTotals,     // for the filtered window
                count: entries.length
            }
        });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// @route   GET /api/ledger/clients
// @desc    All clients (B2B + B2C) with their balance — for the main ledger list page
router.get('/clients/list', async (req, res) => {
    try {
        const { clientType } = req.query;

        const balanceAgg = await LedgerEntry.aggregate([
            { $match: { isActive: true } },
            {
                $group: {
                    _id: { client: '$client', clientType: '$clientType' },
                    totalCredit: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0] } },
                    totalDebit: { $sum: { $cond: [{ $eq: ['$type', 'debit'] }, '$amount', 0] } },
                    totalCreditPKR: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, { $ifNull: ['$amountPKR', '$amount'] }, 0] } },
                    totalDebitPKR: { $sum: { $cond: [{ $eq: ['$type', 'debit'] }, { $ifNull: ['$amountPKR', '$amount'] }, 0] } },
                    lastEntry: { $max: '$date' },
                    count: { $sum: 1 }
                }
            }
        ]);
        const balMap = new Map();
        balanceAgg.forEach(b => balMap.set(`${b._id.clientType}:${b._id.client}`, b));

        const out = { B2C: [], B2B: [] };

        if (!clientType || clientType === 'B2C') {
            const b2c = await ClientB2C.find({ isActive: true }).select('fullName phone cnic city isActive').lean();
            out.B2C = b2c.map(c => {
                const b = balMap.get(`B2C:${c._id}`);
                return {
                    ...c,
                    clientType: 'B2C',
                    totalDebitPKR: b?.totalDebitPKR || 0,
                    totalCreditPKR: b?.totalCreditPKR || 0,
                    balancePKR: (b?.totalDebitPKR || 0) - (b?.totalCreditPKR || 0),
                    entryCount: b?.count || 0,
                    lastEntry: b?.lastEntry || null
                };
            });
        }

        if (!clientType || clientType === 'B2B') {
            const b2b = await ClientB2B.find({ isActive: true }).select('companyName agentCode contactPerson phone city isActive').lean();
            out.B2B = b2b.map(c => {
                const b = balMap.get(`B2B:${c._id}`);
                return {
                    ...c,
                    clientType: 'B2B',
                    totalDebitPKR: b?.totalDebitPKR || 0,
                    totalCreditPKR: b?.totalCreditPKR || 0,
                    balancePKR: (b?.totalDebitPKR || 0) - (b?.totalCreditPKR || 0),
                    entryCount: b?.count || 0,
                    lastEntry: b?.lastEntry || null
                };
            });
        }

        // Summary across all clients
        const summary = {
            B2C: out.B2C.reduce((a, c) => ({ totalDebit: a.totalDebit + c.totalDebitPKR, totalCredit: a.totalCredit + c.totalCreditPKR, balance: a.balance + c.balancePKR, count: a.count + 1 }), { totalDebit: 0, totalCredit: 0, balance: 0, count: 0 }),
            B2B: out.B2B.reduce((a, c) => ({ totalDebit: a.totalDebit + c.totalDebitPKR, totalCredit: a.totalCredit + c.totalCreditPKR, balance: a.balance + c.balancePKR, count: a.count + 1 }), { totalDebit: 0, totalCredit: 0, balance: 0, count: 0 })
        };

        res.json({ success: true, data: { clients: out, summary } });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// @route   GET /api/ledger/summary
// @desc    Get overall ledger summary
router.get('/summary', async (req, res) => {
    try {
        const result = await LedgerEntry.aggregate([
            { $match: { isActive: true } },
            {
                $group: {
                    _id: '$clientType',
                    totalCredit: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0] } },
                    totalDebit: { $sum: { $cond: [{ $eq: ['$type', 'debit'] }, '$amount', 0] } },
                    totalCreditPKR: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, { $ifNull: ['$amountPKR', '$amount'] }, 0] } },
                    totalDebitPKR: { $sum: { $cond: [{ $eq: ['$type', 'debit'] }, { $ifNull: ['$amountPKR', '$amount'] }, 0] } },
                    count: { $sum: 1 }
                }
            }
        ]);

        const summary = { B2C: { totalCredit: 0, totalDebit: 0, balance: 0, count: 0 }, B2B: { totalCredit: 0, totalDebit: 0, balance: 0, count: 0 } };
        result.forEach(r => {
            summary[r._id] = {
                totalCredit: r.totalCreditPKR,
                totalDebit: r.totalDebitPKR,
                balance: r.totalDebitPKR - r.totalCreditPKR,
                count: r.count
            };
        });

        res.json({ success: true, data: summary });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// @route   GET /api/ledger/:id — single entry (for receipt printing)
router.get('/:id', async (req, res) => {
    try {
        const entry = await LedgerEntry.findById(req.params.id)
            .populate('client')
            .populate('package', 'voucherId packageName travelDates pricingSummary')
            .populate('departure', 'code name')
            .populate('createdBy', 'name');
        if (!entry) return res.status(404).json({ success: false, message: 'Entry not found' });
        res.json({ success: true, data: entry });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// @route   POST /api/ledger
router.post('/', async (req, res) => {
    try {
        const currency = await CurrencySettings.getRate();
        req.body.createdBy = req.user._id;
        req.body.amountPKR = toPKR(req.body.amount, req.body.currency || 'PKR', currency.sarToPkr);
        if (!req.body.package) delete req.body.package;
        if (!req.body.departure) delete req.body.departure;
        if (!req.body.cashAccount) delete req.body.cashAccount;
        const entry = await LedgerEntry.create(req.body);
        const populated = await LedgerEntry.findById(entry._id)
            .populate('client')
            .populate('package', 'voucherId packageName')
            .populate('departure', 'code name');
        res.status(201).json({ success: true, data: populated });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// @route   PUT /api/ledger/:id
router.put('/:id', async (req, res) => {
    try {
        req.body.updatedBy = req.user._id;
        if (req.body.amount != null || req.body.currency) {
            const existing = await LedgerEntry.findById(req.params.id).lean();
            const currency = await CurrencySettings.getRate();
            const amt = req.body.amount ?? existing?.amount;
            const cur = req.body.currency ?? existing?.currency ?? 'PKR';
            req.body.amountPKR = toPKR(amt, cur, currency.sarToPkr);
        }
        const entry = await LedgerEntry.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).populate('client');
        if (!entry) return res.status(404).json({ success: false, message: 'Entry not found' });
        res.json({ success: true, data: entry });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// Documents (payment proofs)
router.post('/:id/documents', uploadSingle, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
        const entry = await LedgerEntry.findById(req.params.id);
        if (!entry) { deleteUploadedFile(req.file.filename); return res.status(404).json({ success: false, message: 'Entry not found' }); }
        entry.documents.push(buildDocFromUpload(req));
        entry.updatedBy = req.user._id;
        await entry.save();
        res.status(201).json({ success: true, data: entry });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.delete('/:id/documents/:docId', async (req, res) => {
    try {
        const entry = await LedgerEntry.findById(req.params.id);
        if (!entry) return res.status(404).json({ success: false, message: 'Entry not found' });
        const doc = entry.documents.id(req.params.docId);
        if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
        deleteUploadedFile(doc.filename);
        doc.deleteOne();
        await entry.save();
        res.json({ success: true, data: entry });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// @route   DELETE /api/ledger/:id (soft delete)
router.delete('/:id', async (req, res) => {
    try {
        const entry = await LedgerEntry.findByIdAndUpdate(req.params.id, { isActive: false, updatedBy: req.user._id }, { new: true });
        if (!entry) return res.status(404).json({ success: false, message: 'Entry not found' });
        res.json({ success: true, data: entry, message: 'Entry deleted' });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

module.exports = router;
