const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const { createAuditLog } = require('../middleware/auditLog');
const router = express.Router();

// @route   POST /api/auth/seed-admin
// @desc    Create initial admin user (one-time)
router.post('/seed-admin', async (req, res) => {
    try {
        const existingAdmin = await User.findOne({ role: 'admin' });
        if (existingAdmin) {
            return res.status(400).json({ success: false, message: 'Admin user already exists' });
        }

        const admin = await User.create({
            name: 'Admin',
            email: 'admin@keusmania.com',
            password: 'admin123',
            role: 'admin'
        });

        res.status(201).json({
            success: true,
            message: 'Admin user created successfully',
            data: { email: admin.email, role: admin.role }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// @route   POST /api/auth/login
// @desc    Login user & return JWT
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Please provide email and password' });
        }

        const user = await User.findOne({ email }).select('+password');
        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        if (!user.isActive) {
            return res.status(401).json({ success: false, message: 'Account is deactivated' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

        // Log login action
        createAuditLog(user._id, user.name, 'login', 'User', user._id, null, req.ip);

        res.json({
            success: true,
            data: {
                token,
                user: {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                }
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// @route   GET /api/auth/me
// @desc    Get current logged-in user
router.get('/me', protect, async (req, res) => {
    res.json({ success: true, data: req.user });
});

// @route   POST /api/auth/register
// @desc    Register a new user (admin only)
router.post('/register', protect, authorize('admin'), async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Email already registered' });
        }

        const user = await User.create({ name, email, password, role });

        createAuditLog(req.user._id, req.user.name, 'create', 'User', user._id, { name, email, role }, req.ip);

        res.status(201).json({ success: true, data: user });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// @route   GET /api/auth/users
// @desc    Get all users (admin only)
router.get('/users', protect, authorize('admin'), async (req, res) => {
    try {
        const users = await User.find().sort('-createdAt');
        res.json({ success: true, data: users, count: users.length });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// @route   PUT /api/auth/users/:id
// @desc    Update user (admin only)
router.put('/users/:id', protect, authorize('admin'), async (req, res) => {
    try {
        const { name, email, role, isActive } = req.body;
        const target = await User.findById(req.params.id);
        if (!target) return res.status(404).json({ success: false, message: 'User not found' });

        const isSelf = String(req.user._id) === String(req.params.id);
        // Don't let an admin demote themselves or the last admin
        if (target.role === 'admin' && role && role !== 'admin') {
            const activeAdmins = await User.countDocuments({ role: 'admin', isActive: true });
            if (activeAdmins <= 1) {
                return res.status(400).json({ success: false, message: 'Cannot demote the last active admin' });
            }
            if (isSelf) {
                return res.status(400).json({ success: false, message: 'You cannot change your own admin role — ask another admin' });
            }
        }
        if (isSelf && isActive === false) {
            return res.status(400).json({ success: false, message: 'You cannot deactivate your own account' });
        }

        if (name !== undefined) target.name = name;
        if (email !== undefined) target.email = email;
        if (role !== undefined) target.role = role;
        if (isActive !== undefined) target.isActive = isActive;
        await target.save();

        createAuditLog(req.user._id, req.user.name, 'update', 'User', target._id, req.body, req.ip);

        res.json({ success: true, data: target });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// @route   PUT /api/auth/users/:id/password — admin resets a user's password
router.put('/users/:id/password', protect, authorize('admin'), async (req, res) => {
    try {
        const { password } = req.body;
        if (!password || password.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }
        const user = await User.findById(req.params.id).select('+password');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        user.password = password;
        await user.save();
        createAuditLog(req.user._id, req.user.name, 'update', 'User', user._id, { passwordReset: true }, req.ip);
        res.json({ success: true, message: 'Password updated' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// @route   DELETE /api/auth/users/:id — deactivate a user (soft)
// Refuses to deactivate self or the last active admin.
router.delete('/users/:id', protect, authorize('admin'), async (req, res) => {
    try {
        if (String(req.user._id) === String(req.params.id)) {
            return res.status(400).json({ success: false, message: 'You cannot deactivate your own account' });
        }
        const target = await User.findById(req.params.id);
        if (!target) return res.status(404).json({ success: false, message: 'User not found' });
        if (target.role === 'admin' && target.isActive) {
            const activeAdmins = await User.countDocuments({ role: 'admin', isActive: true });
            if (activeAdmins <= 1) {
                return res.status(400).json({ success: false, message: 'Cannot deactivate the last active admin' });
            }
        }
        target.isActive = false;
        await target.save();
        createAuditLog(req.user._id, req.user.name, 'delete', 'User', target._id, { deactivated: true }, req.ip);
        res.json({ success: true, data: target });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
