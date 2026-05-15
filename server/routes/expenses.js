const express = require('express');
const Expense = require('../models/Expense');
const CurrencySettings = require('../models/CurrencySettings');
const { protect } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/auditLog');
const { uploadSingle, buildDocFromUpload, deleteUploadedFile } = require('../utils/upload');
const router = express.Router();

router.use(protect);
router.use(auditMiddleware('Expense'));

const toPKR = (amount, currency, rate) => currency === 'SAR' ? Number(amount) * rate : Number(amount);

// GET /api/expenses
router.get('/', async (req, res) => {
    try {
        const { search, category, from, to, page = 1, limit = 100 } = req.query;
        const query = { isActive: true };
        if (category && category !== 'all') query.category = category;
        if (from || to) {
            query.date = {};
            if (from) query.date.$gte = new Date(from);
            if (to) query.date.$lte = new Date(to);
        }
        if (search) {
            query.$or = [
                { description: { $regex: search, $options: 'i' } },
                { paidTo: { $regex: search, $options: 'i' } },
                { referenceNumber: { $regex: search, $options: 'i' } }
            ];
        }
        const total = await Expense.countDocuments(query);
        const data = await Expense.find(query)
            .sort('-date -createdAt')
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .populate('createdBy', 'name')
            .lean();
        res.json({ success: true, data, count: data.length, total });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// GET /api/expenses/summary?year=2026
router.get('/summary', async (req, res) => {
    try {
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const yearStart = new Date(year, 0, 1);
        const yearEnd = new Date(year + 1, 0, 1);

        const [byCategory, monthSum, yearSum] = await Promise.all([
            Expense.aggregate([
                { $match: { isActive: true, date: { $gte: yearStart, $lt: yearEnd } } },
                { $group: { _id: '$category', total: { $sum: '$amountPKR' }, count: { $sum: 1 } } },
                { $sort: { total: -1 } }
            ]),
            Expense.aggregate([
                { $match: { isActive: true, date: { $gte: monthStart } } },
                { $group: { _id: null, total: { $sum: '$amountPKR' }, count: { $sum: 1 } } }
            ]),
            Expense.aggregate([
                { $match: { isActive: true, date: { $gte: yearStart, $lt: yearEnd } } },
                { $group: { _id: null, total: { $sum: '$amountPKR' }, count: { $sum: 1 } } }
            ])
        ]);

        res.json({
            success: true,
            data: {
                year,
                monthTotalPKR: monthSum[0]?.total || 0,
                monthCount: monthSum[0]?.count || 0,
                yearTotalPKR: yearSum[0]?.total || 0,
                yearCount: yearSum[0]?.count || 0,
                byCategory: byCategory.map(c => ({ category: c._id, total: c.total, count: c.count }))
            }
        });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// GET /api/expenses/:id
router.get('/:id', async (req, res) => {
    try {
        const e = await Expense.findById(req.params.id).populate('createdBy', 'name');
        if (!e) return res.status(404).json({ success: false, message: 'Expense not found' });
        res.json({ success: true, data: e });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// POST /api/expenses
router.post('/', async (req, res) => {
    try {
        if (!req.body.amount || !req.body.description) {
            return res.status(400).json({ success: false, message: 'amount and description are required' });
        }
        const currency = await CurrencySettings.getRate();
        req.body.amountPKR = toPKR(req.body.amount, req.body.currency || 'PKR', currency.sarToPkr);
        req.body.createdBy = req.user._id;
        if (!req.body.cashAccount) delete req.body.cashAccount;
        const e = await Expense.create(req.body);
        res.status(201).json({ success: true, data: e });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// PUT /api/expenses/:id
router.put('/:id', async (req, res) => {
    try {
        if (req.body.amount !== undefined) {
            const currency = await CurrencySettings.getRate();
            req.body.amountPKR = toPKR(req.body.amount, req.body.currency || 'PKR', currency.sarToPkr);
        }
        req.body.updatedBy = req.user._id;
        const e = await Expense.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!e) return res.status(404).json({ success: false, message: 'Expense not found' });
        res.json({ success: true, data: e });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// DELETE /api/expenses/:id
router.delete('/:id', async (req, res) => {
    try {
        const e = await Expense.findByIdAndUpdate(req.params.id, { isActive: false, updatedBy: req.user._id }, { new: true });
        if (!e) return res.status(404).json({ success: false, message: 'Expense not found' });
        res.json({ success: true, data: e });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// Documents
router.post('/:id/documents', uploadSingle, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
        const e = await Expense.findById(req.params.id);
        if (!e) { deleteUploadedFile(req.file.filename, req.file.cloudinaryResourceType); return res.status(404).json({ success: false, message: 'Expense not found' }); }
        e.documents.push(buildDocFromUpload(req));
        e.updatedBy = req.user._id;
        await e.save();
        res.status(201).json({ success: true, data: e });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.delete('/:id/documents/:docId', async (req, res) => {
    try {
        const e = await Expense.findById(req.params.id);
        if (!e) return res.status(404).json({ success: false, message: 'Expense not found' });
        const doc = e.documents.id(req.params.docId);
        if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
        deleteUploadedFile(doc.filename, doc.resourceType);
        doc.deleteOne();
        await e.save();
        res.json({ success: true, data: e });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

module.exports = router;
