const express = require('express');
const mongoose = require('mongoose');
const Invoice = require('../models/Invoice');
const Package = require('../models/Package');
const LedgerEntry = require('../models/LedgerEntry');
const SupplierLedger = require('../models/SupplierLedger');
const Supplier = require('../models/Supplier');
const ClientB2C = require('../models/ClientB2C');
const ClientB2B = require('../models/ClientB2B');
const CurrencySettings = require('../models/CurrencySettings');
// Role checks here depend on the invoice's party, which is only known after the
// document is loaded, so they are done inline rather than as route middleware.
const { protect } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/auditLog');
const { CLIENTS, FINANCE } = require('../middleware/roles');
const { clampLimit, qStr, stripFields, PROTECTED_FIELDS } = require('../utils/sanitize');
const { packageSellPKR } = require('../utils/pricing');
const { partyRateOr } = require('../utils/fx');
const router = express.Router();

router.use(protect);
router.use(auditMiddleware('Invoice'));

// Raising paperwork against a client is a sales task; a supplier invoice is a
// money document and stays with finance.
const CAN_EDIT_CLIENT_INVOICE = CLIENTS;
const CAN_EDIT_SUPPLIER_INVOICE = FINANCE;

// Totals are derived from the line items, and the number is issued by the
// server — neither may be posted by the client.
const INVOICE_PROTECTED = [...PROTECTED_FIELDS, 'invoiceNumber', 'subtotal', 'total', 'totalPKR', 'sourceTotalPKR', 'isActive'];

const rolesFor = (party) => (party === 'supplier' ? CAN_EDIT_SUPPLIER_INVOICE : CAN_EDIT_CLIENT_INVOICE);

// Applies the caller's edits to a document, then recomputes the money. Line
// items are replaced wholesale rather than merged: the editor sends the list it
// wants, and a merge would make deleting the last line impossible.
function applyEdits(doc, body) {
    stripFields(body, INVOICE_PROTECTED);
    const assignable = [
        'date', 'dueDate', 'currency', 'exchangeRate', 'discount',
        'notes', 'terms', 'status'
    ];
    for (const k of assignable) if (body[k] !== undefined) doc[k] = body[k];
    if (body.billTo && typeof body.billTo === 'object') {
        doc.billTo = { ...(doc.billTo || {}), ...body.billTo };
    }
    if (Array.isArray(body.lineItems)) {
        doc.lineItems = body.lineItems.map(li => ({
            description: String(li.description || '').trim(),
            quantity: Number(li.quantity) || 0,
            unitPrice: Number(li.unitPrice) || 0,
            amount: li.amount === undefined || li.amount === null || li.amount === ''
                ? Number(li.quantity || 0) * Number(li.unitPrice || 0)
                : Number(li.amount) || 0
        })).filter(li => li.description || li.amount);
    }
    doc.recalculate();
    return doc;
}

// ── Seeding ────────────────────────────────────────────────────────────────
// Builds the starting document from whatever the invoice is being raised
// against. Everything here is a STARTING POINT — the user edits it afterwards.

async function seedFromPackage(id, rate) {
    const pkg = await Package.findById(id)
        .populate('client')
        .lean();
    if (!pkg) return null;

    const totalPKR = packageSellPKR(pkg, rate);
    const c = pkg.client || {};
    const isB2B = pkg.clientType === 'B2B';

    // A fixed-source package is bought whole at a contracted price and has no
    // SAR component breakdown, so it bills as the single line it actually is.
    const ps = pkg.pricingSummary || {};
    const parts = pkg.source === 'fixed' ? [] : [
        ['Airline', ps.airlineCostSAR],
        ['Makkah Hotel', ps.makkahHotelCostSAR],
        ['Madinah Hotel', ps.madinahHotelCostSAR],
        ['Ziyarats', ps.ziyaratsCostSAR],
        ['Transport', ps.transportCostSAR],
        ['Special Services', ps.servicesCostSAR]
    ].filter(([, v]) => Number(v) > 0);

    const lineItems = parts.length
        ? parts.map(([label, amt]) => ({
            description: `${label} — ${pkg.packageName}`,
            quantity: 1, unitPrice: Math.round(Number(amt) * rate), amount: Math.round(Number(amt) * rate)
        }))
        : [{
            description: `${pkg.packageName} (${pkg.numberOfPilgrims || 1} pax)`,
            quantity: pkg.numberOfPilgrims || 1,
            unitPrice: Math.round(totalPKR / Math.max(1, pkg.numberOfPilgrims || 1)),
            amount: totalPKR
        }];

    return {
        party: 'client',
        client: pkg.client?._id || pkg.client,
        clientModel: isB2B ? 'ClientB2B' : 'ClientB2C',
        clientType: pkg.clientType || (isB2B ? 'B2B' : 'B2C'),
        sourceKind: 'package',
        package: pkg._id,
        sourceTotalPKR: totalPKR,
        currency: 'PKR',
        billTo: {
            name: isB2B ? (c.companyName || c.fullName) : (c.fullName || c.companyName),
            address: c.address, phone: c.phone, email: c.email,
            reference: pkg.voucherId
        },
        lineItems
    };
}

async function seedFromLedgerEntry(id) {
    const e = await LedgerEntry.findById(id).populate('client').lean();
    if (!e) return null;
    const c = e.client || {};
    const isB2B = e.clientType === 'B2B';
    const amountPKR = Math.round(e.amountPKR ?? e.amount ?? 0);
    return {
        party: 'client',
        client: e.client?._id || e.client,
        clientModel: e.clientModel,
        clientType: e.clientType,
        sourceKind: 'ledger',
        ledgerEntry: e._id,
        sourceTotalPKR: amountPKR,
        date: e.date,
        currency: e.currency || 'PKR',
        exchangeRate: e.exchangeRate,
        billTo: {
            name: isB2B ? (c.companyName || c.fullName) : (c.fullName || c.companyName),
            address: c.address, phone: c.phone, email: c.email,
            reference: e.referenceNumber
        },
        lineItems: [{
            description: e.description || 'Charge',
            quantity: 1,
            unitPrice: Number(e.amount || 0),
            amount: Number(e.amount || 0)
        }]
    };
}

async function seedFromSupplierEntry(id) {
    const e = await SupplierLedger.findById(id).populate('supplier').lean();
    if (!e) return null;
    const s = e.supplier || {};
    return {
        party: 'supplier',
        supplier: e.supplier?._id || e.supplier,
        sourceKind: 'supplierLedger',
        supplierLedgerEntry: e._id,
        sourceTotalPKR: Math.round(e.amountPKR ?? e.amount ?? 0),
        date: e.date,
        currency: e.currency || 'PKR',
        exchangeRate: e.exchangeRate,
        billTo: {
            name: s.name, address: s.address, phone: s.phone, email: s.email,
            reference: e.referenceNumber
        },
        lineItems: [{
            description: e.description || 'Supplier charge',
            quantity: 1,
            unitPrice: Number(e.amount || 0),
            amount: Number(e.amount || 0)
        }]
    };
}

// ── Routes ─────────────────────────────────────────────────────────────────

// GET /api/invoices — list, newest first
router.get('/', async (req, res) => {
    try {
        const q = { isActive: true };
        const party = qStr(req.query.party);
        if (party === 'client' || party === 'supplier') q.party = party;
        if (req.query.client) q.client = qStr(req.query.client);
        if (req.query.supplier) q.supplier = qStr(req.query.supplier);
        if (req.query.package) q.package = qStr(req.query.package);
        const status = qStr(req.query.status);
        if (status) q.status = status;

        const items = await Invoice.find(q)
            .sort('-date -createdAt')
            .limit(clampLimit(req.query.limit, { def: 100, max: 300 }))
            .populate('supplier', 'name')
            // Not lean: the list shows `divergesFromSource`, which is a virtual.
            .populate('client', 'fullName companyName agentCode');
        res.json({ success: true, data: items, count: items.length });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// GET /api/invoices/:id
router.get('/:id', async (req, res) => {
    try {
        const item = await Invoice.findById(req.params.id)
            .populate('supplier', 'name address phone email')
            .populate('client')
            .populate('package', 'voucherId packageName');
        if (!item || item.isActive === false) {
            return res.status(404).json({ success: false, message: 'Invoice not found' });
        }
        res.json({ success: true, data: item });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// POST /api/invoices — create, optionally seeded from a source document.
//
// Body: { source: { kind, id } } to seed, or a bare party for a blank invoice.
// Re-requesting a source that already has a live invoice returns THAT invoice
// rather than raising a duplicate — the button is "open the invoice", and a
// second click must not create a second document.
router.post('/', async (req, res) => {
    try {
        const currency = await CurrencySettings.getRate();
        const kind = qStr(req.body?.source?.kind);
        const sourceId = qStr(req.body?.source?.id);

        let seed = null;
        if (kind && sourceId) {
            if (!mongoose.Types.ObjectId.isValid(sourceId)) {
                return res.status(400).json({ success: false, message: 'Invalid source id' });
            }
            const existing = await Invoice.findOne({
                isActive: true,
                ...(kind === 'package' ? { package: sourceId }
                    : kind === 'ledger' ? { ledgerEntry: sourceId }
                        : { supplierLedgerEntry: sourceId })
            });
            if (existing) return res.json({ success: true, data: existing, reused: true });

            if (kind === 'package') seed = await seedFromPackage(sourceId, currency.sarToPkr);
            else if (kind === 'ledger') seed = await seedFromLedgerEntry(sourceId);
            else if (kind === 'supplierLedger') seed = await seedFromSupplierEntry(sourceId);
            else return res.status(400).json({ success: false, message: 'Unknown source kind' });

            if (!seed) return res.status(404).json({ success: false, message: 'Source document not found' });
        } else {
            const party = qStr(req.body.party) === 'supplier' ? 'supplier' : 'client';
            seed = { party, sourceKind: 'blank', lineItems: [] };
        }

        const allowed = rolesFor(seed.party);
        if (!allowed.includes(req.user.role)) {
            return res.status(403).json({ success: false, message: `Your role cannot raise a ${seed.party} invoice` });
        }

        // A SAR invoice defaults to the party's own rate, matching ledger entries.
        if (seed.currency === 'SAR' && !seed.exchangeRate) {
            let partyRate;
            if (seed.party === 'supplier' && seed.supplier) {
                partyRate = (await Supplier.findById(seed.supplier).select('sarExchangeRate').lean())?.sarExchangeRate;
            } else if (seed.client) {
                const Model = seed.clientModel === 'ClientB2B' ? ClientB2B : ClientB2C;
                partyRate = (await Model.findById(seed.client).select('sarExchangeRate').lean())?.sarExchangeRate;
            }
            seed.exchangeRate = partyRateOr(partyRate, currency.sarToPkr);
        }

        const doc = new Invoice({ ...seed, createdBy: req.user._id });
        doc.recalculate();
        await doc.save();
        res.status(201).json({ success: true, data: doc });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// PUT /api/invoices/:id — the edit
router.put('/:id', async (req, res) => {
    try {
        const doc = await Invoice.findById(req.params.id);
        if (!doc || doc.isActive === false) {
            return res.status(404).json({ success: false, message: 'Invoice not found' });
        }
        if (!rolesFor(doc.party).includes(req.user.role)) {
            return res.status(403).json({ success: false, message: `Your role cannot edit a ${doc.party} invoice` });
        }
        applyEdits(doc, req.body);
        doc.updatedBy = req.user._id;
        await doc.save();
        res.json({ success: true, data: doc });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// DELETE /api/invoices/:id — soft delete, so an issued number is never reused
// and the audit trail survives.
router.delete('/:id', async (req, res) => {
    try {
        const doc = await Invoice.findById(req.params.id);
        if (!doc) return res.status(404).json({ success: false, message: 'Invoice not found' });
        if (!rolesFor(doc.party).includes(req.user.role)) {
            return res.status(403).json({ success: false, message: `Your role cannot delete a ${doc.party} invoice` });
        }
        doc.isActive = false;
        doc.status = 'cancelled';
        doc.updatedBy = req.user._id;
        await doc.save();
        res.json({ success: true, message: `${doc.invoiceNumber} cancelled` });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

module.exports = router;
