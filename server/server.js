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

// CORS — in serverless deployment the frontend is served from the same origin
// as /api/* so CORS isn't strictly needed; this stays permissive for local dev
// where Vite runs on :5173 and the API on :5000.
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true
}));

// Skip noisy access logs in serverless (Vercel captures everything anyway)
if (!process.env.VERCEL) app.use(morgan('dev'));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static-serve uploaded documents — only when running with persistent disk
// (local dev). On Vercel the filesystem is read-only and uploads go straight
// to Cloudinary, so this static handler is never hit and the directory may
// not exist at all.
if (!process.env.VERCEL) {
    app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
        maxAge: '7d',
        setHeaders: (res, filePath) => {
            if (filePath.endsWith('.pdf')) res.setHeader('Content-Disposition', 'inline');
        }
    }));
}

// Rate limiting — uses in-memory store which doesn't survive across
// serverless invocations. On Vercel this becomes a per-invocation no-op,
// which is fine for an internal CRM. Swap for an Upstash Redis store if you
// ever expose this publicly.
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: { success: false, message: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// ======================
// DATABASE CONNECTION (cached for serverless)
// ======================
// In a serverless environment, each function invocation can spin up a new Node
// process — we'd open a fresh MongoDB connection every cold start, which is
// slow AND can exhaust Atlas's connection limit. The standard fix is to cache
// the connection promise on `global` so warm invocations reuse it.
const cached = global._mongoose || (global._mongoose = { conn: null, promise: null });

async function connectDB() {
    if (cached.conn) return cached.conn;
    if (!cached.promise) {
        cached.promise = mongoose.connect(process.env.MONGO_URI, {
            // Reasonable defaults for serverless: keep the pool small,
            // bail quickly if Atlas is unreachable.
            serverSelectionTimeoutMS: 10000,
            maxPoolSize: 10
        }).then(m => {
            // eslint-disable-next-line no-console
            console.log(`✅ MongoDB Connected: ${m.connection.host}`);
            return m;
        });
    }
    cached.conn = await cached.promise;
    return cached.conn;
}

// Ensure every request has a live connection. Cheap when warm.
app.use(async (req, res, next) => {
    try { await connectDB(); next(); }
    catch (err) {
        console.error('Mongo connection error:', err.message);
        res.status(503).json({ success: false, message: 'Database unavailable' });
    }
});

// ======================
// ROUTES
// ======================
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'Karwan-e-Usmania CRM API is running',
        timestamp: new Date().toISOString(),
        env: process.env.VERCEL ? 'vercel' : 'local'
    });
});

// Module 1: Data Management
app.use('/api/airlines', require('./routes/airlines'));
app.use('/api/hotels-makkah', require('./routes/hotelsMakkah'));
app.use('/api/hotels-madinah', require('./routes/hotelsMadinah'));
app.use('/api/ziyarats', require('./routes/ziyarats'));
app.use('/api/transport', require('./routes/transport'));
app.use('/api/special-services', require('./routes/specialServices'));
app.use('/api/currency', require('./routes/currency'));

// Auth
app.use('/api/auth', require('./routes/auth'));

// Module 2: Package Manager
app.use('/api/packages', require('./routes/packages'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/visas', require('./routes/visas'));
app.use('/api/departures', require('./routes/departures'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/cash-accounts', require('./routes/cashAccounts'));

// Module 3: Ledger
app.use('/api/ledger', require('./routes/ledger'));

// Module 4: Reports
app.use('/api/reports', require('./routes/reports'));

// Audit Logs
app.use('/api/audit-logs', require('./routes/auditLogs'));

// ======================
// ERROR HANDLING
// ======================
app.use((req, res, next) => {
    res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

app.use((err, req, res, next) => {
    console.error('Server Error:', err);

    if (err.name === 'ValidationError') {
        const messages = Object.values(err.errors).map(e => e.message);
        return res.status(400).json({ success: false, message: 'Validation Error', errors: messages });
    }
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue)[0];
        return res.status(400).json({ success: false, message: `Duplicate value for field: ${field}` });
    }
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
// START SERVER (local only)
// ======================
// When running on Vercel, the serverless wrapper at api/index.js handles
// requests — we should NOT call app.listen() there. process.env.VERCEL is
// set automatically inside Vercel runtime.
if (!process.env.VERCEL) {
    const PORT = process.env.PORT || 5000;
    connectDB().then(() => {
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📡 API available at http://localhost:${PORT}/api`);
        });
    });
}

module.exports = app;
