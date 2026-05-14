const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

const app = express();

// ======================
// MIDDLEWARE
// ======================
app.use(helmet());
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static-serve uploaded documents (passport scans, payment proofs, etc.).
// Filenames are randomized so URLs are unguessable — adequate for a small
// office CRM. For stricter access control, swap this for a token-checked
// streaming endpoint.
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    maxAge: '7d',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.pdf')) res.setHeader('Content-Disposition', 'inline');
    }
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // limit each IP to 1000 requests per windowMs
    message: { success: false, message: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// ======================
// DATABASE CONNECTION
// ======================
const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`❌ MongoDB Connection Error: ${error.message}`);
        process.exit(1);
    }
};

// ======================
// ROUTES
// ======================
// Health check
app.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'Karwan-e-Usmania CRM API is running', timestamp: new Date().toISOString() });
});

// Module 1: Data Management Routes
app.use('/api/airlines', require('./routes/airlines'));
app.use('/api/hotels-makkah', require('./routes/hotelsMakkah'));
app.use('/api/hotels-madinah', require('./routes/hotelsMadinah'));
app.use('/api/ziyarats', require('./routes/ziyarats'));
app.use('/api/transport', require('./routes/transport'));
app.use('/api/special-services', require('./routes/specialServices'));
app.use('/api/currency', require('./routes/currency'));

// Auth Routes
app.use('/api/auth', require('./routes/auth'));

// Module 2: Package Manager Routes
app.use('/api/packages', require('./routes/packages'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/visas', require('./routes/visas'));
app.use('/api/departures', require('./routes/departures'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/cash-accounts', require('./routes/cashAccounts'));

// Module 3: Ledger Routes
app.use('/api/ledger', require('./routes/ledger'));

// Module 4: Reports Routes
app.use('/api/reports', require('./routes/reports'));

// Audit Logs
app.use('/api/audit-logs', require('./routes/auditLogs'));

// ======================
// ERROR HANDLING
// ======================
// 404 handler
app.use((req, res, next) => {
    res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Server Error:', err);

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const messages = Object.values(err.errors).map(e => e.message);
        return res.status(400).json({ success: false, message: 'Validation Error', errors: messages });
    }

    // Mongoose duplicate key error
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue)[0];
        return res.status(400).json({ success: false, message: `Duplicate value for field: ${field}` });
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, message: 'Token expired' });
    }

    res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || 'Internal Server Error'
    });
});

// ======================
// START SERVER
// ======================
const PORT = process.env.PORT || 5000;

connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📡 API available at http://localhost:${PORT}/api`);
    });
});

module.exports = app;
