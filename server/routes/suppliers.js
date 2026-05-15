const express = require('express');
const Supplier = require('../models/Supplier');
const SupplierLedger = require('../models/SupplierLedger');
const CurrencySettings = require('../models/CurrencySettings');
const { protect } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/auditLog');
const { uploadSingle, buildDocFromUpload, deleteUploadedFile } = require('../utils/upload');
const router = express.Router();

router.use(protect);
router.use(auditMiddleware('Supplier'));

const toPKR = (amount, currency, rate) => currency === 'SAR' ? Number(amount) * rate : Number(amount);

async function balanceFor(supplierId) {
    const sup = await Supplier.findById(supplierId);
    if (!sup) return null;
    const entries = await SupplierLedger.find({ supplier: supplierId }).select('type amountPKR').lean();
    let owed = sup.openingBalancePKR || 0;
    let totalDebit = 0, totalCredit = 0;
    for (const e of entries) {
        if (e.type === 'debit') totalDebit += e.amountPKR || 0;
        else totalCredit += e.amountPKR || 0;
    }
    owed += totalDebit - totalCredit;
    return { totalDebit, totalCredit, balancePKR: owed, entryCount: entries.length };
}

// GET /api/suppliers
router.get('/', async (req, res) => {
    try {
        const { search, type, status } = req.query;
        const query = {};
        if (search) query.$or = [{ name: { $regex: search, $options: 'i' } }, { contactPerson: { $regex: search, $options: 'i' } }];
        if (type && type !== 'all') query.type = type;
        if (status === 'active') query.isActive = true;
        if (status === 'inactive') query.isActive = false;

        const suppliers = await Supplier.find(query).sort('name').lean();
        // Attach balances (small N, fine to N+1)
        const data = await Promise.all(suppliers.map(async s => {
            const bal = await balanceFor(s._id);
            return { ...s, ...bal };
        }));
        res.json({ success: true, data, count: data.length });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// GET /api/suppliers/summary — overall payables across active suppliers
router.get('/summary', async (req, res) => {
    try {
        const suppliers = await Supplier.find({ isActive: true }).select('_id openingBalancePKR').lean();
        let totalPayable = 0, totalDebit = 0, totalCredit = 0;
        for (const s of suppliers) {
            const bal = await balanceFor(s._id);
            totalPayable += bal.balancePKR;
            totalDebit += bal.totalDebit;
            totalCredit += bal.totalCredit;
        }
        res.json({ success: true, data: { totalPayable, totalDebit, totalCredit, supplierCount: suppliers.length } });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// GET /api/suppliers/:id (with ledger + optional filters)
// Filters: dateFrom, dateTo, type, paymentMethod, package, departure, category, search
router.get('/:id', async (req, res) => {
    try {
        const supplier = await Supplier.findById(req.params.id).lean();
        if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found' });

        const { dateFrom, dateTo, type, paymentMethod, package: pkg, departure, category, search } = req.query;
        const q = { supplier: supplier._id };
        if (type) q.type = type;
        if (paymentMethod) q.paymentMethod = paymentMethod;
        if (pkg) q.package = pkg;
        if (departure) q.departure = departure;
        if (category) q.category = category;
        if (dateFrom || dateTo) {
            q.date = {};
            if (dateFrom) q.date.$gte = new Date(dateFrom);
            if (dateTo) { const e = new Date(dateTo); e.setHours(23, 59, 59, 999); q.date.$lte = e; }
        }
        if (search) {
            q.$or = [
                { description: { $regex: search, $options: 'i' } },
                { referenceNumber: { $regex: search, $options: 'i' } }
            ];
        }

        // Sort ascending for running balance, then we'll show desc on UI if needed
        const ledger = await SupplierLedger.find(q)
            .sort('date createdAt')
            .populate('package', 'voucherId packageName')
            .populate('departure', 'code name')
            .populate('createdBy', 'name')
            .lean();

        // Running balance on the filtered set (in PKR)
        let running = supplier.openingBalancePKR || 0;
        const withRunning = ledger.map(e => {
            const amt = e.amountPKR ?? e.amount;
            running += e.type === 'debit' ? amt : -amt;
            return { ...e, runningBalancePKR: running };
        });

        // Filtered totals for the visible window
        const filteredTotals = ledger.reduce((acc, e) => {
            const amtPKR = e.amountPKR ?? e.amount;
            if (e.type === 'debit') { acc.totalDebit += e.amount; acc.totalDebitPKR += amtPKR; }
            else { acc.totalCredit += e.amount; acc.totalCreditPKR += amtPKR; }
            return acc;
        }, { totalDebit: 0, totalCredit: 0, totalDebitPKR: 0, totalCreditPKR: 0 });
        filteredTotals.balancePKR = filteredTotals.totalDebitPKR - filteredTotals.totalCreditPKR;

        const balance = await balanceFor(supplier._id);
        res.json({ success: true, data: { ...supplier, ...balance, ledger: withRunning, filteredTotals } });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// POST /api/suppliers
router.post('/', async (req, res) => {
    try {
        req.body.createdBy = req.user._id;
        const supplier = await Supplier.create(req.body);
        res.status(201).json({ success: true, data: supplier });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// PUT /api/suppliers/:id
router.put('/:id', async (req, res) => {
    try {
        req.body.updatedBy = req.user._id;
        const supplier = await Supplier.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found' });
        res.json({ success: true, data: supplier });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// DELETE /api/suppliers/:id (soft) — refuses if ledger has entries
router.delete('/:id', async (req, res) => {
    try {
        const count = await SupplierLedger.countDocuments({ supplier: req.params.id });
        if (count > 0) return res.status(409).json({ success: false, message: `Cannot delete: supplier has ${count} ledger entr${count === 1 ? 'y' : 'ies'}. Deactivate instead.` });
        const supplier = await Supplier.findByIdAndUpdate(req.params.id, { isActive: false, updatedBy: req.user._id }, { new: true });
        if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found' });
        res.json({ success: true, data: supplier });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// ─── SUPPLIER LEDGER ENDPOINTS ─────────────────

// POST /api/suppliers/:id/ledger
router.post('/:id/ledger', async (req, res) => {
    try {
        if (!req.body.amount || !req.body.description) {
            return res.status(400).json({ success: false, message: 'amount and description are required' });
        }
        const sup = await Supplier.findById(req.params.id);
        if (!sup) return res.status(404).json({ success: false, message: 'Supplier not found' });
        // Inactive suppliers are read-only: no new invoices or payments can be recorded.
        // Reactivate the supplier first if you actually want to transact with them again.
        if (sup.isActive === false) {
            return res.status(409).json({
                success: false,
                message: `Cannot add entry: supplier "${sup.name}" is inactive. Reactivate the supplier first.`
            });
        }

        const currency = await CurrencySettings.getRate();
        const entryBody = {
            ...req.body,
            supplier: req.params.id,
            createdBy: req.user._id,
            amountPKR: toPKR(req.body.amount, req.body.currency || 'PKR', currency.sarToPkr)
        };
        if (!entryBody.package) delete entryBody.package;
        if (!entryBody.departure) delete entryBody.departure;
        if (!entryBody.cashAccount) delete entryBody.cashAccount;

        const entry = await SupplierLedger.create(entryBody);
        res.status(201).json({ success: true, data: entry });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// POST /api/suppliers/:id/ledger/:entryId/documents — invoice/receipt scans
router.post('/:id/ledger/:entryId/documents', uploadSingle, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
        const entry = await SupplierLedger.findOne({ _id: req.params.entryId, supplier: req.params.id });
        if (!entry) { deleteUploadedFile(req.file.filename, req.file.cloudinaryResourceType); return res.status(404).json({ success: false, message: 'Entry not found' }); }
        entry.documents.push(buildDocFromUpload(req));
        entry.updatedBy = req.user._id;
        await entry.save();
        res.status(201).json({ success: true, data: entry });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.delete('/:id/ledger/:entryId/documents/:docId', async (req, res) => {
    try {
        const entry = await SupplierLedger.findOne({ _id: req.params.entryId, supplier: req.params.id });
        if (!entry) return res.status(404).json({ success: false, message: 'Entry not found' });
        const doc = entry.documents.id(req.params.docId);
        if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
        deleteUploadedFile(doc.filename, doc.resourceType);
        doc.deleteOne();
        await entry.save();
        res.json({ success: true, data: entry });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// DELETE /api/suppliers/:id/ledger/:entryId
router.delete('/:id/ledger/:entryId', async (req, res) => {
    try {
        const entry = await SupplierLedger.findOneAndDelete({ _id: req.params.entryId, supplier: req.params.id });
        if (!entry) return res.status(404).json({ success: false, message: 'Entry not found' });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

module.exports = router;
