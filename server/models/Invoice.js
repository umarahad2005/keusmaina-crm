const mongoose = require('mongoose');

// An editable invoice.
//
// Until now an invoice was a print view rendered straight off a package or a
// ledger entry, so its wording and line items could not be touched. This makes
// the invoice a document in its own right: it is SEEDED from the underlying
// charge, then freely edited — lines added, reworded, priced, notes and terms
// written.
//
// The consequence of that, accepted deliberately: an invoice can end up saying
// something different from the ledger. `sourceTotalPKR` records what the source
// was worth at the moment it was seeded, so the two can be compared and a
// divergence shown rather than discovered by a client. Editing an invoice never
// writes back to the ledger — money stays owned by the ledger, paperwork by the
// invoice.

const lineItemSchema = new mongoose.Schema({
    description: { type: String, required: true, trim: true },
    quantity: { type: Number, default: 1, min: 0 },
    unitPrice: { type: Number, default: 0 },
    // Stored rather than derived so a hand-corrected total is never silently
    // recomputed away by a rounding difference — a complimentary line can be
    // priced yet billed at 0, for instance.
    //
    // Deliberately NO default: undefined has to mean "work it out from quantity
    // x unitPrice", and a default of 0 would make an unset amount look like an
    // intentional zero, silently billing the line as free.
    amount: { type: Number }
}, { _id: true });

const invoiceSchema = new mongoose.Schema({
    // Auto-generated: INV-YYYY-NNNN
    invoiceNumber: { type: String, unique: true },

    // Who it is addressed to. Exactly one of client / supplier is set.
    party: { type: String, enum: ['client', 'supplier'], required: true },
    client: { type: mongoose.Schema.Types.ObjectId, refPath: 'clientModel' },
    clientModel: { type: String, enum: ['ClientB2C', 'ClientB2B'] },
    clientType: { type: String, enum: ['B2C', 'B2B'] },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },

    // Where it came from, kept so the invoice can be traced back and so a
    // second invoice is not raised for the same charge by accident.
    sourceKind: { type: String, enum: ['package', 'ledger', 'supplierLedger', 'blank'], default: 'blank' },
    package: { type: mongoose.Schema.Types.ObjectId, ref: 'Package' },
    ledgerEntry: { type: mongoose.Schema.Types.ObjectId, ref: 'LedgerEntry' },
    supplierLedgerEntry: { type: mongoose.Schema.Types.ObjectId, ref: 'SupplierLedger' },
    // What the source was worth when this invoice was seeded.
    sourceTotalPKR: { type: Number, default: 0 },

    date: { type: Date, default: Date.now },
    dueDate: { type: Date },

    // Snapshot of the address block. Editable, because the party record holds
    // today's details while an invoice must keep the ones it was issued with.
    billTo: {
        name: { type: String, trim: true },
        address: { type: String, trim: true },
        phone: { type: String, trim: true },
        email: { type: String, trim: true },
        reference: { type: String, trim: true }
    },

    currency: { type: String, enum: ['PKR', 'SAR'], default: 'PKR' },
    // Only meaningful for a SAR invoice; follows the same party-rate rule as
    // ledger entries.
    exchangeRate: { type: Number, min: 0 },

    lineItems: { type: [lineItemSchema], default: [] },
    discount: { type: Number, default: 0, min: 0 },

    // Totals in the invoice's own currency, plus the PKR equivalent so reports
    // and lists never have to re-derive them from a rate that has since moved.
    subtotal: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    totalPKR: { type: Number, default: 0 },

    notes: { type: String, trim: true },
    terms: { type: String, trim: true },

    // draft    — being worked on, not shown to the client yet
    // issued   — sent; the number is now committed
    // cancelled— voided, kept for the audit trail
    status: { type: String, enum: ['draft', 'issued', 'cancelled'], default: 'draft' },

    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Recompute the money from the lines. Called by the route before every write so
// a client cannot post a total that doesn't match its own line items.
invoiceSchema.methods.recalculate = function () {
    const lines = this.lineItems || [];
    for (const li of lines) {
        // A line's amount is normally qty x price, but an explicitly supplied
        // amount wins so an odd-priced line can be entered directly.
        if (li.amount === undefined || li.amount === null || Number.isNaN(Number(li.amount))) {
            li.amount = Number(li.quantity || 0) * Number(li.unitPrice || 0);
        }
    }
    this.subtotal = lines.reduce((s, li) => s + Number(li.amount || 0), 0);
    this.total = Math.max(0, this.subtotal - Number(this.discount || 0));
    const rate = Number(this.exchangeRate) > 0 ? Number(this.exchangeRate) : 1;
    this.totalPKR = this.currency === 'SAR' ? Math.round(this.total * rate) : Math.round(this.total);
    return this;
};

// True when the invoice no longer matches the charge it was raised from. Shown
// in the UI so a divergence is deliberate rather than discovered later.
invoiceSchema.virtual('divergesFromSource').get(function () {
    if (this.sourceKind === 'blank' || !this.sourceTotalPKR) return false;
    return Math.abs((this.totalPKR || 0) - this.sourceTotalPKR) >= 1;
});
invoiceSchema.set('toJSON', { virtuals: true });
invoiceSchema.set('toObject', { virtuals: true });

invoiceSchema.pre('save', async function () {
    if (!this.invoiceNumber) {
        const year = new Date().getFullYear();
        const count = await mongoose.model('Invoice').countDocuments();
        this.invoiceNumber = `INV-${year}-${String(count + 1).padStart(4, '0')}`;
    }
});

invoiceSchema.index({ party: 1, isActive: 1 });
invoiceSchema.index({ client: 1 });
invoiceSchema.index({ supplier: 1 });
invoiceSchema.index({ date: -1 });

module.exports = mongoose.model('Invoice', invoiceSchema);
