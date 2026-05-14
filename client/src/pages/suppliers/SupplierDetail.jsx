import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../../utils/api';
import { useCurrency } from '../../context/CurrencyContext';
import FormModal from '../../components/FormModal';
import toast from 'react-hot-toast';
import {
    MdArrowBack, MdAdd, MdDelete, MdTrendingUp, MdTrendingDown, MdAccountBalance,
    MdAttachFile, MdFilterList, MdClose, MdPictureAsPdf, MdDescription, MdTableChart,
    MdBlock, MdPlayArrow
} from 'react-icons/md';
import DocumentManager from '../../components/DocumentManager';
import { exportLedgerXLSX, exportLedgerDOCX, openLedgerPrint } from '../../utils/ledgerExport';

const SUPPLIER_DOC_CATEGORIES = [
    ['invoice', 'Invoice'],
    ['receipt', 'Receipt'],
    ['payment_proof', 'Payment proof'],
    ['contract', 'Contract'],
    ['other', 'Other']
];

const CATEGORIES = [
    ['hotel_booking', 'Hotel booking'],
    ['airline_tickets', 'Airline tickets'],
    ['transport', 'Transport'],
    ['visa', 'Visa'],
    ['ziyarat', 'Ziyarat'],
    ['service', 'Service'],
    ['other', 'Other']
];

const fmtDate = (v) => v ? new Date(v).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const today = () => new Date().toISOString().slice(0, 10);

const emptyEntry = () => ({
    type: 'debit', amount: '', currency: 'PKR', paymentMethod: 'invoice',
    date: today(), description: '', referenceNumber: '',
    package: '', departure: '', category: 'other', cashAccount: '', notes: ''
});

const emptyFilters = { dateFrom: '', dateTo: '', type: '', paymentMethod: '', package: '', departure: '', category: '' };

export default function SupplierDetail() {
    const { id } = useParams();
    const nav = useNavigate();
    const { formatPKR } = useCurrency();
    const [sup, setSup] = useState(null);
    const [loading, setLoading] = useState(true);
    const [packages, setPackages] = useState([]);
    const [departures, setDepartures] = useState([]);
    const [cashAccounts, setCashAccounts] = useState([]);
    const [modal, setModal] = useState(false);
    const [form, setForm] = useState(emptyEntry());
    const [saving, setSaving] = useState(false);
    const [docEntry, setDocEntry] = useState(null);

    const [filters, setFilters] = useState(emptyFilters);
    const [showFilters, setShowFilters] = useState(false);

    const queryString = useMemo(() => {
        const p = new URLSearchParams();
        Object.entries(filters).forEach(([k, v]) => { if (v) p.append(k, v); });
        return p.toString();
    }, [filters]);

    const fetch = async () => {
        try {
            setLoading(true);
            const qs = queryString ? `?${queryString}` : '';
            const [sRes, pRes, dRes, caRes] = await Promise.all([
                api.get(`/suppliers/${id}${qs}`),
                api.get('/packages?limit=200'),
                api.get('/departures'),
                api.get('/cash-accounts?status=active')
            ]);
            setSup(sRes.data.data);
            setPackages(pRes.data.data || []);
            setDepartures(dRes.data.data || []);
            setCashAccounts(caRes.data.data || []);
        } catch { toast.error('Failed to load supplier'); nav('/suppliers'); }
        finally { setLoading(false); }
    };
    useEffect(() => { fetch(); /* eslint-disable-next-line */ }, [id, queryString]);

    const handleAdd = () => {
        if (sup && sup.isActive === false) {
            toast.error('Supplier is inactive — reactivate before adding entries');
            return;
        }
        setForm(emptyEntry());
        setModal(true);
    };
    const handleSubmit = async () => {
        if (!form.amount || !form.description) { toast.error('Amount & description required'); return; }
        setSaving(true);
        try {
            await api.post(`/suppliers/${id}/ledger`, form);
            toast.success(`${form.type === 'debit' ? 'Invoice' : 'Payment'} recorded`);
            setModal(false); fetch();
        } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
        finally { setSaving(false); }
    };
    const handleReactivate = async () => {
        if (!confirm(`Reactivate "${sup.name}"?`)) return;
        try { await api.put(`/suppliers/${id}`, { isActive: true }); toast.success('Reactivated'); fetch(); }
        catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    };
    const handleDeactivate = async () => {
        if (!confirm(`Deactivate "${sup.name}"? You won't be able to record new entries until reactivated.`)) return;
        try { await api.delete(`/suppliers/${id}`); toast.success('Deactivated'); fetch(); }
        catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    };
    const handleDelete = async (entryId) => {
        if (!confirm('Delete this entry?')) return;
        try { await api.delete(`/suppliers/${id}/ledger/${entryId}`); fetch(); }
        catch { toast.error('Failed'); }
    };
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v }));

    if (loading || !sup) return <div className="flex items-center justify-center py-20"><div className="w-10 h-10 border-4 border-navy-800 border-t-gold-500 rounded-full animate-spin" /></div>;

    const ft = sup.filteredTotals || { totalDebitPKR: 0, totalCreditPKR: 0, balancePKR: 0 };
    const hasFilters = Object.values(filters).some(v => !!v);

    const partyMeta = { Type: sup.type, 'Contact Person': sup.contactPerson, Phone: sup.phone, City: sup.city };
    const handlePDF = () => openLedgerPrint({ kind: 'supplier', partyId: id, filters });
    const handleDOCX = () => exportLedgerDOCX({ entries: sup.ledger, kind: 'supplier', partyName: sup.name, partyMeta, summary: ft, filters });
    const handleXLSX = () => exportLedgerXLSX({ entries: sup.ledger, kind: 'supplier', partyName: sup.name, partyMeta, summary: ft, filters });

    const isInactive = sup.isActive === false;

    return (
        <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <button onClick={() => nav('/suppliers')} className="btn-ghost flex items-center gap-1"><MdArrowBack size={16} /> Suppliers</button>
                <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => setShowFilters(s => !s)} className={`btn-sm flex items-center gap-1 ${showFilters || hasFilters ? 'btn-primary' : 'btn-ghost'}`}>
                        <MdFilterList size={16} /> Filters{hasFilters ? ` (${Object.values(filters).filter(Boolean).length})` : ''}
                    </button>
                    <button onClick={handlePDF} className="btn-ghost btn-sm flex items-center gap-1" title="Print / save as PDF"><MdPictureAsPdf size={16} /> PDF</button>
                    <button onClick={handleDOCX} className="btn-ghost btn-sm flex items-center gap-1" title="Download as Word doc"><MdDescription size={16} /> DOCX</button>
                    <button onClick={handleXLSX} className="btn-ghost btn-sm flex items-center gap-1" title="Download as Excel"><MdTableChart size={16} /> Excel</button>
                    {isInactive ? (
                        <button onClick={handleReactivate} className="btn-sm flex items-center gap-1 bg-green-600 text-white hover:bg-green-700"><MdPlayArrow size={14} /> Reactivate</button>
                    ) : (
                        <>
                            <button onClick={handleDeactivate} className="btn-ghost btn-sm flex items-center gap-1 text-amber-600" title="Stop buying from this supplier"><MdBlock size={14} /> Deactivate</button>
                            <button onClick={handleAdd} className="btn-gold btn-sm flex items-center gap-1"><MdAdd size={14} /> Add Entry</button>
                        </>
                    )}
                </div>
            </div>

            {isInactive && (
                <div className="mb-4 p-4 bg-amber-50 border-l-4 border-amber-500 rounded-r-lg flex items-center gap-3">
                    <MdBlock size={22} className="text-amber-600 flex-shrink-0" />
                    <div className="flex-1">
                        <p className="font-bold text-amber-800">Supplier is inactive</p>
                        <p className="text-sm text-amber-700">You can view history and export statements, but cannot record new invoices or payments. Click <b>Reactivate</b> to resume buying from this supplier.</p>
                    </div>
                </div>
            )}

            <div className="card mb-4">
                <div className="card-body">
                    <h1 className="text-xl font-heading font-bold text-dark mb-2">{sup.name}</h1>
                    <p className="text-sm text-gray-500 mb-3">{sup.type} · {sup.contactPerson || '—'} · {sup.phone || '—'} · {sup.city || '—'}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div><p className="text-gray-500 text-xs">Opening Balance</p><p className="font-semibold">{formatPKR(sup.openingBalancePKR || 0)}</p></div>
                        <div><p className="text-gray-500 text-xs">Total Invoiced</p><p className="font-semibold text-red-600">{formatPKR(sup.totalDebit || 0)}</p></div>
                        <div><p className="text-gray-500 text-xs">Total Paid</p><p className="font-semibold text-green-700">{formatPKR(sup.totalCredit || 0)}</p></div>
                        <div className="flex items-center justify-between">
                            <div><p className="text-gray-500 text-xs">Outstanding</p><p className={`font-bold ${sup.balancePKR > 0 ? 'text-red-600' : 'text-green-700'}`}>{formatPKR(sup.balancePKR || 0)}</p></div>
                            <div className="stat-icon bg-navy-800 text-white"><MdAccountBalance size={18} /></div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Filters panel */}
            {showFilters && (
                <div className="card mb-4 border-navy-200">
                    <div className="card-body">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-bold text-sm text-navy-800">Filter entries</h3>
                            {hasFilters && (
                                <button onClick={() => setFilters(emptyFilters)} className="text-xs text-red-500 hover:underline flex items-center gap-1">
                                    <MdClose size={12} /> Clear all
                                </button>
                            )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                            <div><label className="label text-xs">From</label>
                                <input type="date" className="input text-xs" value={filters.dateFrom} onChange={e => setFilter('dateFrom', e.target.value)} /></div>
                            <div><label className="label text-xs">To</label>
                                <input type="date" className="input text-xs" value={filters.dateTo} onChange={e => setFilter('dateTo', e.target.value)} /></div>
                            <div><label className="label text-xs">Type</label>
                                <select className="select text-xs" value={filters.type} onChange={e => setFilter('type', e.target.value)}>
                                    <option value="">All</option>
                                    <option value="debit">Invoices only</option>
                                    <option value="credit">Payments only</option>
                                </select></div>
                            <div><label className="label text-xs">Method</label>
                                <select className="select text-xs" value={filters.paymentMethod} onChange={e => setFilter('paymentMethod', e.target.value)}>
                                    <option value="">All</option>
                                    <option value="invoice">Invoice / Bill</option>
                                    <option value="cash">Cash</option>
                                    <option value="bank_transfer">Bank Transfer</option>
                                    <option value="online">Online</option>
                                    <option value="cheque">Cheque</option>
                                    <option value="adjustment">Adjustment</option>
                                </select></div>
                            <div><label className="label text-xs">Category</label>
                                <select className="select text-xs" value={filters.category} onChange={e => setFilter('category', e.target.value)}>
                                    <option value="">All</option>
                                    {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                </select></div>
                            <div><label className="label text-xs">Package</label>
                                <select className="select text-xs" value={filters.package} onChange={e => setFilter('package', e.target.value)}>
                                    <option value="">All</option>
                                    {packages.map(p => <option key={p._id} value={p._id}>{p.voucherId}</option>)}
                                </select></div>
                        </div>
                        {hasFilters && (
                            <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs">
                                <span className="text-gray-500">
                                    Showing {sup.ledger.length} {sup.ledger.length === 1 ? 'entry' : 'entries'} ·
                                    Net for period: <b className={ft.balancePKR > 0 ? 'text-red-600' : 'text-green-700'}>{formatPKR(ft.balancePKR)}</b>
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="card">
                <div className="card-body">
                    <h2 className="text-lg font-heading font-bold text-dark mb-3">
                        Ledger
                        <span className="text-xs font-normal text-gray-500 ml-2">
                            (Invoices: what we buy · Payments: what we paid)
                        </span>
                    </h2>
                    {sup.ledger.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                            <p className="text-lg mb-1">No entries{hasFilters ? ' match your filters' : ' yet'}</p>
                            <p className="text-sm">Click "Add Entry" to record an invoice (debit) or payment (credit).</p>
                        </div>
                    ) : (
                        <div className="table-container">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Date</th><th>Description</th><th>Linked</th><th>Cat</th><th>Method</th><th>Type</th>
                                        <th className="text-right">Invoice</th>
                                        <th className="text-right">Payment</th>
                                        <th className="text-right">Balance</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sup.ledger.map(e => (
                                        <tr key={e._id}>
                                            <td className="text-sm">{fmtDate(e.date)}</td>
                                            <td>
                                                <div className="text-sm font-semibold">{e.description}</div>
                                                {e.referenceNumber && <div className="text-xs text-gray-500">Ref: {e.referenceNumber}</div>}
                                            </td>
                                            <td className="text-xs">
                                                {e.package && <Link to={`/packages/view/${e.package._id}`} className="block text-navy-800 hover:underline font-mono">{e.package.voucherId}</Link>}
                                                {e.departure && <Link to={`/departures/view/${e.departure._id}`} className="block text-navy-800 hover:underline font-mono">{e.departure.code}</Link>}
                                                {!e.package && !e.departure && <span className="text-gray-400">—</span>}
                                            </td>
                                            <td className="text-xs"><span className="badge-navy capitalize">{e.category?.replace('_', ' ')}</span></td>
                                            <td className="text-xs capitalize">{e.paymentMethod?.replace('_', ' ')}</td>
                                            <td>
                                                {e.type === 'debit'
                                                    ? <span className="flex items-center gap-1 text-red-600 font-semibold text-xs"><MdTrendingUp size={12} /> Invoice</span>
                                                    : <span className="flex items-center gap-1 text-green-600 font-semibold text-xs"><MdTrendingDown size={12} /> Payment</span>}
                                            </td>
                                            <td className="text-right text-sm">
                                                {e.type === 'debit' && (
                                                    <>
                                                        <span className="text-red-600 font-bold">{e.currency} {Number(e.amount).toLocaleString()}</span>
                                                        {e.currency === 'SAR' && <div className="text-xs text-gray-500">{formatPKR(e.amountPKR)}</div>}
                                                    </>
                                                )}
                                            </td>
                                            <td className="text-right text-sm">
                                                {e.type === 'credit' && (
                                                    <>
                                                        <span className="text-green-700 font-bold">{e.currency} {Number(e.amount).toLocaleString()}</span>
                                                        {e.currency === 'SAR' && <div className="text-xs text-gray-500">{formatPKR(e.amountPKR)}</div>}
                                                    </>
                                                )}
                                            </td>
                                            <td className="text-right text-sm font-semibold text-gray-700">{formatPKR(e.runningBalancePKR)}</td>
                                            <td className="text-right">
                                                <button onClick={() => setDocEntry(e)} className="btn-icon text-navy-700 hover:bg-navy-50" title="Attachments">
                                                    <MdAttachFile size={14} />
                                                    {e.documents?.length > 0 && <span className="ml-0.5 text-[10px] font-bold">{e.documents.length}</span>}
                                                </button>
                                                <button onClick={() => handleDelete(e._id)} className="btn-icon text-red-500 hover:bg-red-50"><MdDelete size={14} /></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-gray-50">
                                    <tr>
                                        <td colSpan="6" className="text-right text-sm font-semibold text-gray-600">Filtered totals →</td>
                                        <td className="text-right text-red-600 font-bold">{formatPKR(ft.totalDebitPKR)}</td>
                                        <td className="text-right text-green-700 font-bold">{formatPKR(ft.totalCreditPKR)}</td>
                                        <td className="text-right font-bold text-navy-800">{formatPKR(ft.balancePKR)}</td>
                                        <td></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Add entry modal */}
            <FormModal isOpen={modal} onClose={() => setModal(false)} title="Add Supplier Ledger Entry" onSubmit={handleSubmit} loading={saving}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2 flex gap-2">
                        <button type="button" onClick={() => set('type', 'debit')} className={`flex-1 py-2 rounded-lg font-bold text-sm ${form.type === 'debit' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-500'}`}>🔴 Invoice (what we buy)</button>
                        <button type="button" onClick={() => set('type', 'credit')} className={`flex-1 py-2 rounded-lg font-bold text-sm ${form.type === 'credit' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'}`}>🟢 Payment (what we paid)</button>
                    </div>
                    <div><label className="label">Amount *</label>
                        <input className="input text-lg font-bold" type="number" min="0" value={form.amount} onChange={e => set('amount', e.target.value)} /></div>
                    <div><label className="label">Currency</label>
                        <select className="select" value={form.currency} onChange={e => set('currency', e.target.value)}>
                            <option>PKR</option><option>SAR</option>
                        </select></div>
                    <div><label className="label">Date</label>
                        <input className="input" type="date" value={form.date} onChange={e => set('date', e.target.value)} /></div>
                    <div><label className="label">Method</label>
                        <select className="select" value={form.paymentMethod} onChange={e => set('paymentMethod', e.target.value)}>
                            <option value="invoice">Invoice / Bill</option>
                            <option value="cash">Cash</option>
                            <option value="bank_transfer">Bank Transfer</option>
                            <option value="online">Online</option>
                            <option value="cheque">Cheque</option>
                            <option value="adjustment">Adjustment</option>
                        </select></div>
                    <div><label className="label">Category</label>
                        <select className="select" value={form.category} onChange={e => set('category', e.target.value)}>
                            {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select></div>
                    <div><label className="label">Reference #</label>
                        <input className="input" value={form.referenceNumber} onChange={e => set('referenceNumber', e.target.value)} placeholder="Bank ref / Invoice #" /></div>
                    <div className="sm:col-span-2"><label className="label">Description *</label>
                        <input className="input" value={form.description} onChange={e => set('description', e.target.value)} placeholder="e.g. 30 PIA seats Mar 5 batch" /></div>

                    <div><label className="label">Link to Package (optional)</label>
                        <select className="select text-sm" value={form.package} onChange={e => set('package', e.target.value)}>
                            <option value="">— None —</option>
                            {packages.map(p => <option key={p._id} value={p._id}>{p.voucherId} — {p.packageName}</option>)}
                        </select>
                        <p className="text-[10px] text-gray-500 mt-1">Linked debits count toward that package's cost in profit reports</p></div>
                    <div><label className="label">Link to Departure (optional)</label>
                        <select className="select text-sm" value={form.departure} onChange={e => set('departure', e.target.value)}>
                            <option value="">— None —</option>
                            {departures.map(d => <option key={d._id} value={d._id}>{d.code} — {d.name}</option>)}
                        </select></div>

                    {form.type === 'credit' && (
                        <div className="sm:col-span-2 p-3 bg-red-50 rounded-lg border border-red-200">
                            <label className="label text-red-800">💸 Paid From Account (recommended)</label>
                            <select className="select text-sm" value={form.cashAccount} onChange={e => set('cashAccount', e.target.value)}>
                                <option value="">— Not tracked —</option>
                                {cashAccounts.map(a => <option key={a._id} value={a._id}>{a.name} {a.bankName ? `(${a.bankName})` : ''}</option>)}
                            </select>
                            <p className="text-[10px] text-red-700 mt-1">Pick the account the money came from. Lets the cash balance auto-update.</p>
                        </div>
                    )}
                </div>
                <div><label className="label">Notes</label>
                    <textarea className="input" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
            </FormModal>

            {/* Documents modal for a ledger entry */}
            <FormModal isOpen={!!docEntry} onClose={() => setDocEntry(null)}
                title={`Attachments — ${docEntry?.description || ''}`}
                onSubmit={() => setDocEntry(null)} submitLabel="Done">
                {docEntry && (
                    <DocumentManager
                        documents={docEntry.documents || []}
                        uploadUrl={`/suppliers/${id}/ledger/${docEntry._id}/documents`}
                        onChange={(updated) => { setDocEntry(updated); fetch(); }}
                        categories={SUPPLIER_DOC_CATEGORIES}
                    />
                )}
            </FormModal>
        </div>
    );
}
