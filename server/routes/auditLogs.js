const express = require('express');
const AuditLog = require('../models/AuditLog');
const { protect, authorize } = require('../middleware/auth');
const { qStr, clampLimit, safeSearchRegex } = require('../utils/sanitize');
const router = express.Router();

router.use(protect);
router.use(authorize('admin'));

// @route   GET /api/audit-logs
router.get('/', async (req, res) => {
    try {
        const { search, page = 1, dateFrom, dateTo } = req.query;
        const limit = clampLimit(req.query.limit, { def: 50, max: 200 });
        const query = {};

        const action = qStr(req.query.action);
        const entity = qStr(req.query.entity);
        const userId = qStr(req.query.userId);
        if (action) query.action = action;
        if (entity) query.entity = entity;
        if (userId) query.userId = userId;

        if (dateFrom || dateTo) {
            query.timestamp = {};
            if (dateFrom) query.timestamp.$gte = new Date(dateFrom);
            if (dateTo) query.timestamp.$lte = new Date(dateTo + 'T23:59:59');
        }

        if (search) {
            const rx = safeSearchRegex(search);
            query.$or = [
                { entity: rx },
                { action: rx },
                { userName: rx }
            ];
        }

        const total = await AuditLog.countDocuments(query);
        const logs = await AuditLog.find(query)
            .sort('-timestamp')
            .skip((page - 1) * limit)
            .limit(limit)
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

        res.json({ success: true, data, count: data.length, total, pagination: { page: parseInt(page), limit, pages: Math.ceil(total / limit) } });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

module.exports = router;
