// Upload helper — wraps multer with disk storage at server/uploads/.
// Public URL pattern: /uploads/<filename>. Static-served from server.js.

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIMES = new Set([
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf'
]);

const storage = multer.diskStorage({
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

// Wraps multer so error messages reach the global error handler nicely.
const uploadSingle = (req, res, next) => upload(req, res, (err) => err ? next(err) : next());

// Build a documents[] entry from a successful multer upload + req body fields
const buildDocFromUpload = (req) => {
    if (!req.file) return null;
    return {
        filename: req.file.filename,
        originalName: req.file.originalname,
        url: `/uploads/${req.file.filename}`,
        mimeType: req.file.mimetype,
        size: req.file.size,
        category: req.body.category || 'other',
        uploadedAt: new Date(),
        uploadedBy: req.user?._id
    };
};

// Best-effort delete from disk. We don't fail the request if disk delete fails;
// the DB pointer is gone, the file becomes orphaned and can be GC'd later.
const deleteUploadedFile = (filename) => {
    if (!filename) return;
    try {
        const fp = path.join(UPLOAD_DIR, path.basename(filename));
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
    } catch { /* swallow */ }
};

module.exports = { UPLOAD_DIR, uploadSingle, buildDocFromUpload, deleteUploadedFile };
