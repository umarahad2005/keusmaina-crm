const AuditLog = require('../models/AuditLog');

// Create audit log entry
const createAuditLog = async (userId, userName, action, entity, entityId, changes, ipAddress) => {
    try {
        await AuditLog.create({
            userId,
            userName,
            action,
            entity,
            entityId,
            changes,
            ipAddress
        });
    } catch (error) {
        console.error('Audit log error:', error.message);
    }
};

// Middleware to auto-log after response
const auditMiddleware = (entity) => {
    return (req, res, next) => {
        // Store original json method
        const originalJson = res.json.bind(res);

        res.json = function (data) {
            // Only log successful mutations
            if (data && data.success && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
                const actionMap = {
                    'POST': 'create',
                    'PUT': 'update',
                    'PATCH': 'update',
                    'DELETE': 'delete'
                };

                const action = actionMap[req.method];
                const entityId = data.data?._id || req.params.id;
                const userId = req.user?._id;
                const userName = req.user?.name;
                const ipAddress = req.ip || req.connection?.remoteAddress;

                createAuditLog(userId, userName, action, entity, entityId, req.body, ipAddress);
            }

            return originalJson(data);
        };

        next();
    };
};

module.exports = { createAuditLog, auditMiddleware };
