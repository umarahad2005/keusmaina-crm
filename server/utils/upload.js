// Upload helper — two modes:
//
//   1. CLOUDINARY MODE (set CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET):
//      multer keeps file in memory, we stream the buffer to Cloudinary,
//      and store the returned https URL. Used in production on Vercel
//      (serverless functions have a read-only filesystem).
//
//   2. LOCAL-DISK MODE (no Cloudinary env vars):
//      original behaviour — writes to server/uploads/, public URL is
//      /uploads/<filename> served statically from server.js. Used during
//      local development so contributors don't need a Cloudinary account.
//
// The buildDocFromUpload return shape is identical in both modes, so the
// rest of the app doesn't care which one is active.

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

const CLOUDINARY_ENABLED = !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
);

let cloudinary = null;
if (CLOUDINARY_ENABLED) {
    cloudinary = require('cloudinary').v2;
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true
    });
    // eslint-disable-next-line no-console
    console.log('📤 Upload mode: Cloudinary');
}

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!CLOUDINARY_ENABLED && !fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const ALLOWED_MIMES = new Set([
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf'
]);

// In Cloudinary mode we keep the file in memory so we can stream it to their API.
// In disk mode we write straight to UPLOAD_DIR with a randomised filename.
const storage = CLOUDINARY_ENABLED
    ? multer.memoryStorage()
    : multer.diskStorage({
        destination: (req, file, cb) => cb(null, UPLOAD_DIR),
        filename: (req, file, cb) => {
            const safeExt = path.extname(file.originalname).toLowerCase().slice(0, 8) || '';
            const random = crypto.randomBytes(12).toString('hex');
            cb(null, `${Date.now()}-${random}${safeExt}`);
        }
    });

const upload = multer({
    storage,
    limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
    fileFilter: (req, file, cb) => {
        if (ALLOWED_MIMES.has(file.mimetype)) return cb(null, true);
        cb(new Error(`Unsupported file type: ${file.mimetype}. Use JPG, PNG, WEBP, GIF, or PDF.`));
    }
}).single('file');

// Cloudinary upload — wraps upload_stream as a promise. Folder is derived from
// the route (e.g. "ledger", "packages", "clients") so the Cloudinary dashboard
// stays browsable.
const uploadToCloudinary = (buffer, originalName, mimeType) => new Promise((resolve, reject) => {
    const ext = path.extname(originalName).slice(1).toLowerCase();
    const isPdf = mimeType === 'application/pdf';
    const stream = cloudinary.uploader.upload_stream(
        {
            folder: process.env.CLOUDINARY_FOLDER || 'keusmania',
            // PDFs need resource_type:'raw' so Cloudinary doesn't try to treat them as images
            resource_type: isPdf ? 'raw' : 'image',
            use_filename: false,
            unique_filename: true,
            format: ext || undefined
        },
        (err, result) => err ? reject(err) : resolve(result)
    );
    stream.end(buffer);
});

// Multer wrapper that ALSO performs the Cloudinary upload after multer parses
// the file. Attaches the resulting URL/public_id to req.file so the
// buildDocFromUpload helper below can read it just like in disk mode.
const uploadSingle = (req, res, next) => {
    upload(req, res, async (err) => {
        if (err) return next(err);
        if (!CLOUDINARY_ENABLED || !req.file) return next();

        try {
            const result = await uploadToCloudinary(req.file.buffer, req.file.originalname, req.file.mimetype);
            // Rewrite req.file so downstream code sees the same shape it would in disk mode.
            req.file.filename = result.public_id;     // used by deleteUploadedFile to remove the asset later
            req.file.url = result.secure_url;
            req.file.cloudinaryResourceType = result.resource_type;
        } catch (cloudErr) {
            return next(new Error(`Cloudinary upload failed: ${cloudErr.message || cloudErr}`));
        }
        next();
    });
};

// Build a documents[] entry from a successful upload (works in both modes)
const buildDocFromUpload = (req) => {
    if (!req.file) return null;
    const url = CLOUDINARY_ENABLED
        ? req.file.url
        : `/uploads/${req.file.filename}`;
    return {
        filename: req.file.filename,
        originalName: req.file.originalname,
        url,
        mimeType: req.file.mimetype,
        size: req.file.size,
        category: req.body.category || 'other',
        uploadedAt: new Date(),
        uploadedBy: req.user?._id,
        ...(CLOUDINARY_ENABLED ? { storage: 'cloudinary', resourceType: req.file.cloudinaryResourceType || 'image' } : { storage: 'local' })
    };
};

// Best-effort delete. We don't fail the request if the delete fails — the DB
// pointer is gone, the orphan can be GC'd later.
const deleteUploadedFile = (filenameOrPublicId, resourceType) => {
    if (!filenameOrPublicId) return;
    if (CLOUDINARY_ENABLED) {
        // Fire and forget — caller doesn't need to wait
        cloudinary.uploader.destroy(filenameOrPublicId, { resource_type: resourceType || 'image' })
            .catch(() => { /* swallow */ });
        return;
    }
    try {
        const fp = path.join(UPLOAD_DIR, path.basename(filenameOrPublicId));
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
    } catch { /* swallow */ }
};

module.exports = {
    UPLOAD_DIR,
    uploadSingle,
    buildDocFromUpload,
    deleteUploadedFile,
    CLOUDINARY_ENABLED
};
