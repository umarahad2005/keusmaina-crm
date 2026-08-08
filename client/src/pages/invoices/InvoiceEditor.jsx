import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import {
    MdArrowBack, MdAdd, MdDelete, MdSave, MdPrint, MdWarningAmber, MdDragHandle
} from 'react-icons/md';

// Editable invoice.
//
// The document is seeded from the underlying package or ledger charge and then
// belongs to the user: lines can be added, reworded, repriced or removed, and
// notes and terms written freely.
//
// The trade-off that comes with that is made visible rather than hidden — when
// the edited total no longer matches the charge it was raised from, the page
// says so. Editing an invoice never writes back to the ledger; money stays
// owned by the ledger and paperwork by the invoice.

const fmtDate = (v) => (v ? String(v).slice(0, 10) : '');
const num = (v) => Number(v) || 0;

const blankLine = () => ({ description: '', quantity: 1, unitPrice: 0, amount: 0 });

export default function InvoiceEditor() {
    const { id } = useParams();
    const nav = useNavigate();

    const [inv, setInv] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);

    const load = useCallback(async () => {
        try {
            const r = await api.get(`/invoices/${id}`);
            const d = r.data.data;
            setInv({
                ...d,
                date: fmtDate(d.date),
                dueDate: fmtDate(d.dueDate),
                billTo: d.billTo || {},
                lineItems: (d.lineItems || []).map(li => ({ ...li })),
            });
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to load invoice');
        } finally { setLoading(false); }
    }, [id]);

    // load() is async — its setState runs after the awaited request, not
    // synchronously in the effect body, so the rule is a false positive here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { load(); }, [load]);

    // Warn before losing edits to a browser navigation.
    useEffect(() => {
        if (!dirty) return undefined;
        const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    const set = (k, v) => { setInv(f => ({ ...f, [k]: v })); setDirty(true); };
    const setBill = (k, v) => { setInv(f => ({ ...f, billTo: { ...f.billTo, [k]: v } })); setDirty(true); };

    const setLine = (i, k, v) => {
        setInv(f => {
            const lines = f.lineItems.map((li, idx) => {
                if (idx !== i) return li;
                const next = { ...li, [k]: v };
                // Editing quantity or price re-derives the amount; editing the
                // amount directly leaves it alone, so an odd-priced line can be
                // entered by hand.
                if (k === 'quantity' || k === 'unitPrice') next.amount = num(next.quantity) * num(next.unitPrice);
                return next;
            });
            return { ...f, lineItems: lines };
        });
        setDirty(true);
    };
    const addLine = () => { setInv(f => ({ ...f, lineItems: [...f.lineItems, blankLine()] })); setDirty(true); };
    const removeLine = (i) => { setInv(f => ({ ...f, lineItems: f.lineItems.filter((_, idx) => idx !== i) })); setDirty(true); };

    if (loading) return <div className="flex items-center justify-center py-20"><div className="w-10 h-10 border-4 border-navy-800 border-t-gold-500 rounded-full animate-spin" /></div>;
    if (!inv) return <div className="p-6 text-gray-500">Invoice not found.</div>;

    const subtotal = inv.lineItems.reduce((s, li) => s + num(li.amount), 0);
    const total = Math.max(0, subtotal - num(inv.discount));
    const rate = num(inv.exchangeRate) > 0 ? num(inv.exchangeRate) : 1;
    const totalPKR = inv.currency === 'SAR' ? Math.round(total * rate) : Math.round(total);
    const cur = inv.currency || 'PKR';
    const money = (n) => `${cur} ${num(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

    const diverges = inv.sourceKind !== 'blank' && num(inv.sourceTotalPKR) > 0
        && Math.abs(totalPKR - num(inv.sourceTotalPKR)) >= 1;

    const save = async () => {
        if (!inv.lineItems.length) { toast.error('An invoice needs at least one line'); return; }
        if (inv.lineItems.some(li => !String(li.description || '').trim())) {
            toast.error('Every line needs a description'); return;
        }
        setSaving(true);
        try {
            const r = await api.put(`/invoices/${id}`, {
                date: inv.date || undefined,
                dueDate: inv.dueDate || undefined,
                currency: inv.currency,
                exchangeRate: inv.exchangeRate === '' ? null : inv.exchangeRate,
                discount: num(inv.discount),
                billTo: inv.billTo,
                lineItems: inv.lineItems,
                notes: inv.notes,
                terms: inv.terms,
                status: inv.status,
            });
            toast.success('Invoice saved');
            setDirty(false);
            const d = r.data.data;
            setInv(f => ({ ...f, invoiceNumber: d.invoiceNumber, subtotal: d.subtotal, total: d.total, totalPKR: d.totalPKR }));
        } catch (e) { toast.error(e.response?.data?.message || 'Failed to save'); }
        finally { setSaving(false); }
    };

    const openPrint = () => {
        if (dirty) { toast.error('Save first — the printed copy renders the saved invoice'); return; }
        window.open(`/invoices/print/${id}`, '_blank');
    };

    return (
        <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <button onClick={() => nav(-1)} className="btn-ghost btn-sm flex items-center gap-1"><MdArrowBack size={16} /> Back</button>
                    <div>
                        <h1 className="text-xl font-heading font-bold text-dark">{inv.invoiceNumber}</h1>
                        <p className="text-xs text-gray-500 capitalize">
                            {inv.party} invoice
                            {inv.sourceKind !== 'blank' && ` · raised from ${inv.sourceKind === 'supplierLedger' ? 'a supplier entry' : inv.sourceKind === 'ledger' ? 'a client charge' : 'a package'}`}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <select className="select text-sm w-36" value={inv.status} onChange={e => set('status', e.target.value)}>
                        <option value="draft">Draft</option>
                        <option value="issued">Issued</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                    <button onClick={openPrint} className="btn-outline btn-sm flex items-center gap-1"><MdPrint size={15} /> Print</button>
                    <button onClick={save} disabled={saving} className="btn-gold btn-sm flex items-center gap-1 disabled:opacity-50">
                        <MdSave size={16} /> {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
                    </button>
                </div>
            </div>

            {diverges && (
                <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-300 text-sm text-amber-900 flex items-start gap-2">
                    <MdWarningAmber size={18} className="mt-0.5 shrink-0" />
                    <div>
                        This invoice no longer matches the charge it was raised from —
                        invoice <strong>PKR {totalPKR.toLocaleString()}</strong> vs
                        charge <strong>PKR {num(inv.sourceTotalPKR).toLocaleString()}</strong>.
                        That is allowed, but the ledger is unchanged: the client still owes what the ledger says.
                    </div>
                </div>
            )}

            {/* Bill to */}
            <div className="card mb-4"><div className="card-body">
                <h3 className="font-bold text-sm text-navy-800 mb-2">Bill To</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><label className="label text-xs">Name</label>
                        <input className="input" value={inv.billTo.name || ''} onChange={e => setBill('name', e.target.value)} /></div>
                    <div><label className="label text-xs">Reference</label>
                        <input className="input" value={inv.billTo.reference || ''} onChange={e => setBill('reference', e.target.value)} placeholder="Voucher / PO number" /></div>
                    <div><label className="label text-xs">Phone</label>
                        <input className="input" value={inv.billTo.phone || ''} onChange={e => setBill('phone', e.target.value)} /></div>
                    <div><label className="label text-xs">Email</label>
                        <input className="input" value={inv.billTo.email || ''} onChange={e => setBill('email', e.target.value)} /></div>
                    <div className="sm:col-span-2"><label className="label text-xs">Address</label>
                        <input className="input" value={inv.billTo.address || ''} onChange={e => setBill('address', e.target.value)} /></div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                    <div><label className="label text-xs">Invoice date</label>
                        <input className="input" type="date" value={inv.date} onChange={e => set('date', e.target.value)} /></div>
                    <div><label className="label text-xs">Due date</label>
                        <input className="input" type="date" value={inv.dueDate} onChange={e => set('dueDate', e.target.value)} /></div>
                    <div><label className="label text-xs">Currency</label>
                        <select className="select" value={inv.currency} onChange={e => set('currency', e.target.value)}>
                            <option>PKR</option><option>SAR</option>
                        </select></div>
                    {inv.currency === 'SAR' && (
                        <div><label className="label text-xs">Rate (PKR per SAR)</label>
                            <input className="input" type="number" min="0" step="0.01" value={inv.exchangeRate ?? ''}
                                onChange={e => set('exchangeRate', e.target.value)} /></div>
                    )}
                </div>
            </div></div>

            {/* Line items */}
            <div className="card mb-4"><div className="card-body">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-sm text-navy-800">Line Items</h3>
                    <button onClick={addLine} className="btn-outline btn-sm flex items-center gap-1"><MdAdd size={15} /> Add line</button>
                </div>
                <div className="table-container">
                    <table className="data-table">
                        <thead><tr>
                            <th style={{ width: 28 }}></th>
                            <th>Description</th>
                            <th style={{ width: 90 }} className="text-right">Qty</th>
                            <th style={{ width: 130 }} className="text-right">Unit price</th>
                            <th style={{ width: 140 }} className="text-right">Amount</th>
                            <th style={{ width: 44 }}></th>
                        </tr></thead>
                        <tbody>
                            {inv.lineItems.length === 0 ? (
                                <tr><td colSpan={6} className="text-center text-gray-400 py-6">No lines yet — click “Add line”.</td></tr>
                            ) : inv.lineItems.map((li, i) => (
                                <tr key={i}>
                                    <td className="text-gray-300"><MdDragHandle size={16} /></td>
                                    <td><input className="input text-sm" value={li.description}
                                        onChange={e => setLine(i, 'description', e.target.value)} placeholder="What is being charged" /></td>
                                    <td><input className="input text-sm text-right" type="number" min="0" value={li.quantity}
                                        onChange={e => setLine(i, 'quantity', e.target.value)} /></td>
                                    <td><input className="input text-sm text-right" type="number" min="0" value={li.unitPrice}
                                        onChange={e => setLine(i, 'unitPrice', e.target.value)} /></td>
                                    <td><input className="input text-sm text-right font-semibold" type="number" value={li.amount}
                                        onChange={e => setLine(i, 'amount', e.target.value)} title="Overrides qty x price" /></td>
                                    <td><button onClick={() => removeLine(i)} className="btn-icon text-red-500 hover:bg-red-50" title="Remove line"><MdDelete size={16} /></button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="flex justify-end mt-3">
                    <div className="w-full sm:w-80 space-y-1 text-sm">
                        <div className="flex justify-between"><span className="text-gray-600">Subtotal</span><b>{money(subtotal)}</b></div>
                        <div className="flex justify-between items-center gap-2">
                            <span className="text-gray-600">Discount</span>
                            <input className="input text-sm text-right w-32" type="number" min="0" value={inv.discount || 0}
                                onChange={e => set('discount', e.target.value)} />
                        </div>
                        <div className="flex justify-between border-t pt-1 text-base"><b className="text-navy-800">Total</b><b className="text-navy-800">{money(total)}</b></div>
                        {cur === 'SAR' && (
                            <div className="flex justify-between text-[11px] text-gray-500">
                                <span>at {rate} PKR/SAR</span><span>PKR {totalPKR.toLocaleString()}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div></div>

            {/* Notes & terms */}
            <div className="card mb-6"><div className="card-body grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="label text-xs">Notes</label>
                    <textarea className="input" rows={3} value={inv.notes || ''} onChange={e => set('notes', e.target.value)}
                        placeholder="Anything the client should read" /></div>
                <div><label className="label text-xs">Terms</label>
                    <textarea className="input" rows={3} value={inv.terms || ''} onChange={e => set('terms', e.target.value)}
                        placeholder="Payment terms, cancellation policy…" /></div>
            </div></div>
        </div>
    );
}
