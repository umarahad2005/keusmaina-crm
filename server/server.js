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

// Where are we running? Render sets RENDER/RENDER_EXTERNAL_URL automatically,
// Vercel sets VERCEL. Neither is present locally.
const IS_RENDER = !!process.env.RENDER;
const IS_SERVERLESS = !!process.env.VERCEL;
const IS_PRODUCTION = IS_RENDER || IS_SERVERLESS || process.env.NODE_ENV === 'production';

// Local dev only: some ISP/OS resolvers can't perform MongoDB SRV lookups
// (querySrv ECONNREFUSED), which makes a `mongodb+srv://` URI hang. Forcing a
// public resolver in dev lets `npm run dev` connect to Atlas. Hosted platforms
// resolve SRV fine with their own resolver — overriding it there would only add
// a failure mode, so this is dev-only.
if (!IS_PRODUCTION) {
    try { require('dns').setServers(['8.8.8.8', '1.1.1.1']); } catch { /* ignore */ }
}

const app = express();

// Render (and any PaaS) terminates TLS at a proxy and forwards the real client
// IP in X-Forwarded-For. Without this, req.ip is the proxy's IP — so every user
// shares one rate-limit bucket and express-rate-limit logs a validation error.
// `1` = trust exactly one proxy hop, which is Render's topology.
if (IS_PRODUCTION) app.set('trust proxy', 1);

// ======================
// MIDDLEWARE
// ======================
app.use(helmet());

// CORS — frontend (Vercel) and API (Render) are on different origins, so this
// is load-bearing in production: CLIENT_URL must exactly match the Vercel URL,
// no trailing slash. Locally it's Vite on :5173 talking to the API on :5000.
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true
}));

// Skip noisy access logs in serverless (Vercel captures everything anyway)
if (!IS_SERVERLESS) app.use(morgan('dev'));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static-serve uploaded documents — only when running with persistent disk
// (local dev). In production uploads go straight to Cloudinary: Vercel's
// filesystem is read-only, and Render's free-tier disk is wiped on every
// deploy, so this static handler is never the source of truth there.
if (!IS_SERVERLESS) {
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

// One-time bootstrap: guarantee there's always an admin to log in with, so a
// fresh database or a fresh deploy is usable WITHOUT manually hitting a seed
// endpoint (vercel.json can't run curl). Idempotent — it never touches an
// existing admin, so it can't overwrite a changed password. Set
// SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD in the environment to control the
// initial credentials; the defaults are for first login only — change the
// password immediately after.
async function ensureSeedAdmin() {
    const User = require('./models/User');
    if (await User.findOne({ role: 'admin' }).select('_id')) return;
    const email = (process.env.SEED_ADMIN_EMAIL || 'admin@keusmania.com').toLowerCase();
    const password = process.env.SEED_ADMIN_PASSWORD || 'admin123';
    await User.create({ name: 'Admin', email, password, role: 'admin' });
    console.log(`✅ Seeded initial admin: ${email}`);
}

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
    try {
        cached.conn = await cached.promise;
    } catch (err) {
        // Don't cache a rejected connection promise — otherwise every later
        // request in this instance would reuse the failure. Reset so the next
        // request retries a fresh connection.
        cached.promise = null;
        throw err;
    }
    // Bootstrap the admin once per process, after the connection is live.
    if (!global._adminSeeded) {
        global._adminSeeded = true;
        try { await ensureSeedAdmin(); } catch (e) { console.error('Admin seed skipped:', e.message); }
    }
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
        env: IS_SERVERLESS ? 'vercel' : IS_RENDER ? 'render' : 'local'
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
app.use('/api/fixed-packages', require('./routes/fixedPackages'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/client-groups', require('./routes/clientGroups'));
app.use('/api/visas', require('./routes/visas'));
app.use('/api/departures', require('./routes/departures'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/cash-accounts', require('./routes/cashAccounts'));

// Module 3: Ledger
app.use('/api/ledger', require('./routes/ledger'));

// Module 4: Reports
app.use('/api/reports', require('./routes/reports'));
app.use('/api/closings', require('./routes/closings'));
app.use('/api/invoices', require('./routes/invoices'));

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
// Render (and local dev) run a long-lived process, so we listen. A serverless
// host would invoke the exported app per-request instead and must NOT listen.
if (!IS_SERVERLESS) {
    const PORT = process.env.PORT || 5000;
    connectDB().then(() => {
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📡 API available at http://localhost:${PORT}/api`);

            // Keep-alive for sleep-prone hosts (Render's free tier sleeps a web
            // service after ~15 min with no inbound traffic). Pinging our own
            // health endpoint every 10 min keeps traffic flowing so it never
            // sleeps. Render sets RENDER_EXTERNAL_URL automatically; otherwise set
            // KEEPALIVE_URL to the public /api/health URL. No-op locally.
            const keepAliveUrl = process.env.KEEPALIVE_URL
                || (process.env.RENDER_EXTERNAL_URL ? `${process.env.RENDER_EXTERNAL_URL}/api/health` : null);
            if (keepAliveUrl && typeof fetch === 'function') {
                setInterval(() => { fetch(keepAliveUrl).catch(() => { /* ignore */ }); }, 10 * 60 * 1000);
                console.log(`⏰ Keep-alive: pinging ${keepAliveUrl} every 10 min`);
            }
        });
    });
}

module.exports = app;
