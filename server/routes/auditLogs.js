const express = require('express');
const AuditLog = require('../models/AuditLog');
const { protect, authorize } = require('../middleware/auth');
const router = express.Router();

router.use(protect);
router.use(authorize('admin'));

// @route   GET /api/audit-logs
router.get('/', async (req, res) => {
    try {
        const { search, page = 1, limit = 50, action, entity, userId, dateFrom, dateTo } = req.query;
        const query = {};

        if (action) query.action = action;
        if (entity) query.entity = entity;
        if (userId) query.userId = userId;

        if (dateFrom || dateTo) {
            query.timestamp = {};
            if (dateFrom) query.timestamp.$gte = new Date(dateFrom);
            if (dateTo) query.timestamp.$lte = new Date(dateTo + 'T23:59:59');
        }

        if (search) {
            query.$or = [
                { entity: { $regex: search, $options: 'i' } },
                { action: { $regex: search, $options: 'i' } },
                { userName: { $regex: search, $options: 'i' } }
            ];
        }

        const total = await AuditLog.countDocuments(query);
        const logs = await AuditLog.find(query)
            .sort('-timestamp')
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .populate('userId', 'name email role');

        // Map to consistent frontend-friendly format
        const data = logs.map(log => ({
            _id: log._id,
            performedBy: log.userId, // populated user
            userName: log.userName,
            action: log.action,
            entity: log.entity,
            entityId: log.entityId,
            changes: log.changes,
            createdAt: log.timestamp
        }));

        res.json({ success: true, data, count: data.length, total, pagination: { page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) } });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

module.exports = router;
