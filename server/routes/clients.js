const express = require('express');
const ClientB2C = require('../models/ClientB2C');
const ClientB2B = require('../models/ClientB2B');
const Package = require('../models/Package');
const LedgerEntry = require('../models/LedgerEntry');
const { protect } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/auditLog');
const { uploadSingle, buildDocFromUpload, deleteUploadedFile } = require('../utils/upload');
const router = express.Router();

router.use(protect);

// Helper used by the profile endpoint below — returns packages this client booked
// and a ledger balance snapshot.
async function buildClientProfile(clientId, clientType) {
    const clientModel = clientType === 'B2C' ? 'ClientB2C' : 'ClientB2B';
    const [packages, balance] = await Promise.all([
        Package.find({ client: clientId, clientModel, isActive: true })
            .sort('-createdAt')
            .select('voucherId packageName packageType status numberOfPilgrims pilgrims travelDates pricingSummary departure')
            .populate('departure', 'code name')
            .lean(),
        LedgerEntry.getClientBalance(clientId, clientModel)
    ]);
    return { packages, balance };
}

// ═══════════════════════════════════════════
// CLIENT PROFILE (shared B2C / B2B endpoint)
// Returns client info + their packages + ledger balance in one shot
// ═══════════════════════════════════════════
router.get('/profile/:clientType/:id', async (req, res) => {
    try {
        const { clientType, id } = req.params;
        if (!['B2C', 'B2B'].includes(clientType)) {
            return res.status(400).json({ success: false, message: 'Invalid client type' });
        }
        const Model = clientType === 'B2C' ? ClientB2C : ClientB2B;
        const client = await Model.findById(id).populate('createdBy', 'name').lean();
        if (!client) return res.status(404).json({ success: false, message: 'Client not found' });

        const { packages, balance } = await buildClientProfile(id, clientType);

        // Recent ledger entries — last 10 — for a quick activity stream
        const recentLedger = await LedgerEntry.find({
            client: id,
            clientModel: clientType === 'B2C' ? 'ClientB2C' : 'ClientB2B',
            isActive: true
        })
            .sort('-date -createdAt')
            .limit(10)
            .populate('package', 'voucherId')
            .select('date type amount currency amountPKR description paymentMethod referenceNumber package category')
            .lean();

        res.json({
            success: true,
            data: { client, clientType, packages, balance, recentLedger }
        });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// ═══════════════════════════════════════════
// B2C CLIENTS
// ═══════════════════════════════════════════
router.use('/b2c', auditMiddleware('ClientB2C'));

router.get('/b2c', async (req, res) => {
    try {
        const { search, page = 1, limit = 50, status } = req.query;
        const query = {};
        if (search) {
            query.$or = [
                { fullName: { $regex: search, $options: 'i' } },
                { cnic: { $regex: search, $options: 'i' } },
                { passportNumber: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } }
            ];
        }
        if (status === 'active') query.isActive = true;
        if (status === 'inactive') query.isActive = false;

        const total = await ClientB2C.countDocuments(query);
        const clients = await ClientB2C.find(query).sort('-createdAt').skip((page - 1) * limit).limit(parseInt(limit)).populate('createdBy', 'name');
        res.json({ success: true, data: clients, count: clients.length, total, pagination: { page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) } });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/b2c/:id', async (req, res) => {
    try {
        const client = await ClientB2C.findById(req.params.id).populate('createdBy', 'name');
        if (!client) return res.status(404).json({ success: false, message: 'Client not found' });
        res.json({ success: true, data: client });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.post('/b2c', async (req, res) => {
    try {
        req.body.createdBy = req.user._id;
        const client = await ClientB2C.create(req.body);
        res.status(201).json({ success: true, data: client });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.put('/b2c/:id', async (req, res) => {
    try {
        req.body.updatedBy = req.user._id;
        const client = await ClientB2C.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!client) return res.status(404).json({ success: false, message: 'Client not found' });
        res.json({ success: true, data: client });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.delete('/b2c/:id', async (req, res) => {
    try {
        const client = await ClientB2C.findByIdAndUpdate(req.params.id, { isActive: false, updatedBy: req.user._id }, { new: true });
        if (!client) return res.status(404).json({ success: false, message: 'Client not found' });
        res.json({ success: true, data: client, message: 'Client deactivated' });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// ── B2C documents (passport, CNIC, photo, etc.) ──
router.post('/b2c/:id/documents', uploadSingle, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
        const client = await ClientB2C.findById(req.params.id);
        if (!client) {
            deleteUploadedFile(req.file.filename, req.file.cloudinaryResourceType);
            return res.status(404).json({ success: false, message: 'Client not found' });
        }
        const doc = buildDocFromUpload(req);
        client.documents.push(doc);
        await client.save();
        res.status(201).json({ success: true, data: client });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.delete('/b2c/:id/documents/:docId', async (req, res) => {
    try {
        const client = await ClientB2C.findById(req.params.id);
        if (!client) return res.status(404).json({ success: false, message: 'Client not found' });
        const doc = client.documents.id(req.params.docId);
        if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
        deleteUploadedFile(doc.filename, doc.resourceType);
        doc.deleteOne();
        await client.save();
        res.json({ success: true, data: client });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// ═══════════════════════════════════════════
// B2B CLIENTS (AGENTS)
// ═══════════════════════════════════════════
router.use('/b2b', auditMiddleware('ClientB2B'));

router.get('/b2b', async (req, res) => {
    try {
        const { search, page = 1, limit = 50, status } = req.query;
        const query = {};
        if (search) {
            query.$or = [
                { companyName: { $regex: search, $options: 'i' } },
                { contactPerson: { $regex: search, $options: 'i' } },
                { agentCode: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } }
            ];
        }
        if (status === 'active') query.isActive = true;
        if (status === 'inactive') query.isActive = false;

        const total = await ClientB2B.countDocuments(query);
        const clients = await ClientB2B.find(query).sort('-createdAt').skip((page - 1) * limit).limit(parseInt(limit)).populate('createdBy', 'name');
        res.json({ success: true, data: clients, count: clients.length, total, pagination: { page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) } });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/b2b/:id', async (req, res) => {
    try {
        const client = await ClientB2B.findById(req.params.id).populate('createdBy', 'name');
        if (!client) return res.status(404).json({ success: false, message: 'Agent not found' });
        res.json({ success: true, data: client });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.post('/b2b', async (req, res) => {
    try {
        req.body.createdBy = req.user._id;
        const client = await ClientB2B.create(req.body);
        res.status(201).json({ success: true, data: client });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.put('/b2b/:id', async (req, res) => {
    try {
        req.body.updatedBy = req.user._id;
        const client = await ClientB2B.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!client) return res.status(404).json({ success: false, message: 'Agent not found' });
        res.json({ success: true, data: client });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.delete('/b2b/:id', async (req, res) => {
    try {
        const client = await ClientB2B.findByIdAndUpdate(req.params.id, { isActive: false, updatedBy: req.user._id }, { new: true });
        if (!client) return res.status(404).json({ success: false, message: 'Agent not found' });
        res.json({ success: true, data: client, message: 'Agent deactivated' });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

module.exports = router;
