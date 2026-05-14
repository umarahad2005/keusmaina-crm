import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../../utils/api';
import { useCurrency } from '../../context/CurrencyContext';
import FormModal from '../../components/FormModal';
import DocumentManager from '../../components/DocumentManager';
import toast from 'react-hot-toast';
import {
    MdArrowBack, MdAdd, MdDelete, MdTrendingUp, MdTrendingDown,
    MdAccountBalance, MdAttachFile, MdPictureAsPdf, MdDescription,
    MdTableChart, MdFilterList, MdClose, MdReceipt
} from 'react-icons/md';
import { exportLedgerXLSX, exportLedgerDOCX, openLedgerPrint } from '../../utils/ledgerExport';

const PAYMENT_DOC_CATEGORIES = [
    ['payment_proof', 'Payment proof'],
    ['bank_slip', 'Bank slip'],
    ['cheque', 'Cheque'],
    ['screenshot', 'Screenshot'],
    ['other', 'Other']
];

const CATEGORIES = [
    ['package_sale', 'Package sale'],
    ['extra_service', 'Extra service'],
    ['visa', 'Visa'],
    ['transport', 'Transport'],
    ['hotel', 'Hotel'],
    ['airline', 'Airline'],
    ['refund', 'Refund'],
    ['adjustment', 'Adjustment'],
    ['other', 'Other']
];

const fmtDate = (v) => v ? new Date(v).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const today = () => new Date().toISOString().slice(0, 10);

const emptyEntry = (clientType, clientId) => ({
    clientType,
    client: clientId,
    clientModel: clientType === 'B2C' ? 'ClientB2C' : 'ClientB2B',
    type: 'debit',
    amount: '',
    currency: 'PKR',
    paymentMethod: 'cash',
    category: 'package_sale',
    date: today(),
    description: '',
    referenceNumber: '',
    package: '',
    departure: '',
    cashAccount: '',
    notes: ''
});

const emptyFilters = { dateFrom: '', dateTo: '', type: '', paymentMethod: '', package: '', departure: '' };

export default function ClientLedgerDetail() {
    const { clientType, id } = useParams();
    const nav = useNavigate();
    const { formatPKR } = useCurrency();

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [packages, setPackages] = useState([]);
    const [departures, setDepartures] = useState([]);
    const [cashAccounts, setCashAccounts] = useState([]);

    const [modal, setModal] = useState(false);
    const [form, setForm] = useState(emptyEntry(clientType, id));
    const [saving, setSaving] = useState(false);
    const [docEntry, setDocEntry] = useState(null);

    const [filters, setFilters] = useState(emptyFilters);
    const [showFilters, setShowFilters] = useState(false);

    const queryString = useMemo(() => {
        const p = new URLSearchParams();
        Object.entries(filters).forEach(([k, v]) => { if (v) p.append(k, v); });
        return p.toString();
    }, [filters]);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const qs = queryString ? `?${queryString}` : '';
            const [ledRes, pkgRes, depRes, caRes] = await Promise.all([
                api.get(`/ledger/client/${clientType}/${id}${qs}`),
                api.get('/packages?limit=200'),
                api.get('/departures'),
                api.get('/cash-accounts?status=active')
            ]);
            setData(ledRes.data.data);
            setPackages(pkgRes.data.data || []);
            setDepartures(depRes.data.data || []);
            setCashAccounts(caRes.data.data || []);
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to load client ledger');
            nav('/ledger');
        } finally { setLoading(false); }
    };

    useEffect(() => { fetchAll(); /* eslint-disable-next-line */ }, [id, clientType, queryString]);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v }));

    const handleAdd = () => { setForm(emptyEntry(clientType, id)); setModal(true); };
    const handleSubmit = async () => {
        if (!form.amount || !form.description) { toast.error('Amount & description required'); return; }
        setSaving(true);
        try {
            await api.post('/ledger', form);
            toast.success(`${form.type === 'debit' ? 'Charge' : 'Payment'} recorded`);
            setModal(false); fetchAll();
        } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
        finally { setSaving(false); }
    };
    const handleDelete = async (entryId) => {
        if (!confirm('Delete this entry?')) return;
        try { await api.delete(`/ledger/${entryId}`); fetchAll(); }
        catch { toast.error('Failed'); }
    };

    if (loading || !data) return <div className="flex items-center justify-center py-20"><div className="w-10 h-10 border-4 border-navy-800 border-t-gold-500 rounded-full animate-spin" /></div>;

    const c = data.client;
    const partyName = clientType === 'B2C' ? c.fullName : c.companyName;
    const overall = data.balance;
    const filtered = data.filteredTotals;
    const hasFilters = Object.values(filters).some(v => !!v);

    const handlePDF = () => openLedgerPrint({ kind: 'client', partyId: id, filters: { ...filters, clientType } });
    const handleDOCX = () => exportLedgerDOCX({
        entries: data.entries, kind: 'client', partyName,
        partyMeta: clientType === 'B2C'
            ? { CNIC: c.cnic, Passport: c.passportNumber, Phone: c.phone, City: c.city }
            : { 'Agent Code': c.agentCode, 'Contact': c.contactPerson, Phone: c.phone, City: c.city },
        summary: filtered,
        filters
    });
    const handleXLSX = () => exportLedgerXLSX({
        entries: data.entries, kind: 'client', partyName,
        partyMeta: clientType === 'B2C'
            ? { CNIC: c.cnic, Passport: c.passportNumber, Phone: c.phone, City: c.city }
            : { 'Agent Code': c.agentCode, 'Contact': c.contactPerson, Phone: c.phone, City: c.city },
        summary: filtered,
        filters
    });

    return (
        <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <button onClick={() => nav('/ledger')} className="btn-ghost flex items-center gap-1"><MdArrowBack size={16} /> Ledger</button>
                <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => setShowFilters(s => !s)} className={`btn-sm flex items-center gap-1 ${showFilters || hasFilters ? 'btn-primary' : 'btn-ghost'}`}>
                        <MdFilterList size={16} /> Filters{hasFilters ? ` (${Object.values(filters).filter(Boolean).length})` : ''}
                    </button>
                    <button onClick={handlePDF} className="btn-ghost btn-sm flex items-center gap-1" title="Print / save as PDF"><MdPictureAsPdf size={16} /> PDF</button>
                    <button onClick={handleDOCX} className="btn-ghost btn-sm flex items-center gap-1" title="Download as Word doc"><MdDescription size={16} /> DOCX</button>
                    <button onClick={handleXLSX} className="btn-ghost btn-sm flex items-center gap-1" title="Download as Excel"><MdTableChart size={16} /> Excel</button>
                    <button onClick={handleAdd} className="btn-gold btn-sm flex items-center gap-1"><MdAdd size={14} /> Add Entry</button>
                </div>
            </div>

            {/* Client card */}
            <div className="card mb-4">
                <div className="card-body">
                    <div className="flex items-start justify-between flex-wrap gap-3">
                        <div>
                            <h1 className="text-xl font-heading font-bold text-dark mb-1">{partyName}</h1>
                            <p className="text-sm text-gray-500">
                                <span className={`badge ${clientType === 'B2C' ? 'badge-navy' : 'badge-gold'} mr-2`}>{clientType}</span>
                                {clientType === 'B2C'
                                    ? <>{c.cnic || '—'} · {c.passportNumber || 'No passport'} · {c.phone || '—'} · {c.city || '—'}</>
                                    : <><span className="font-mono font-bold text-navy-800">{c.agentCode}</span> · {c.contactPerson} · {c.phone} · {c.city || '—'}</>
                                }
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                        <div>
                            <p className="text-gray-500 text-xs">Total Charged</p>
                            <p className="font-semibold text-red-600">{formatPKR(overall.totalDebitPKR ?? overall.totalDebit)}</p>
                        </div>
                        <div>
                            <p className="text-gray-500 text-xs">Total Received</p>
                            <p className="font-semibold text-green-700">{formatPKR(overall.totalCreditPKR ?? overall.totalCredit)}</p>
                        </div>
                        <div>
                            <p className="text-gray-500 text-xs">Outstanding</p>
                            <p className={`font-bold text-lg ${(overall.balancePKR ?? overall.balance) > 0 ? 'text-red-600' : 'text-green-700'}`}>{formatPKR(overall.balancePKR ?? overall.balance)}</p>
                        </div>
                        <div className="flex items-center justify-end">
                            <div className="stat-icon bg-navy-800 text-white"><MdAccountBalance size={22} /></div>
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
                                    <option value="debit">Charges only</option>
                                    <option value="credit">Payments only</option>
                                </select></div>
                            <div><label className="label text-xs">Method</label>
                                <select className="select text-xs" value={filters.paymentMethod} onChange={e => setFilter('paymentMethod', e.target.value)}>
                                    <option value="">All</option>
                                    <option value="cash">Cash</option>
                                    <option value="bank_transfer">Bank Transfer</option>
                                    <option value="online">Online</option>
                                    <option value="cheque">Cheque</option>
                                    <option value="adjustment">Adjustment</option>
                                </select></div>
                            <div><label className="label text-xs">Package</label>
                                <select className="select text-xs" value={filters.package} onChange={e => setFilter('package', e.target.value)}>
                                    <option value="">All</option>
                                    {packages.map(p => <option key={p._id} value={p._id}>{p.voucherId}</option>)}
                                </select></div>
                            <div><label className="label text-xs">Departure</label>
                                <select className="select text-xs" value={filters.departure} onChange={e => setFilter('departure', e.target.value)}>
                                    <option value="">All</option>
                                    {departures.map(d => <option key={d._id} value={d._id}>{d.code}</option>)}
                                </select></div>
                        </div>
                        {hasFilters && (
                            <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs">
                                <span className="text-gray-500">
                                    Showing {data.count} {data.count === 1 ? 'entry' : 'entries'} ·
                                    Net for period: <b className={filtered.balancePKR > 0 ? 'text-red-600' : 'text-green-700'}>{formatPKR(filtered.balancePKR)}</b>
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Ledger table */}
            <div className="card">
                <div className="card-body">
                    <h2 className="text-lg font-heading font-bold text-dark mb-3">
                        Ledger Entries
                        <span className="text-xs font-normal text-gray-500 ml-2">
                            (Charges: what we billed · Payments: what they paid)
                        </span>
                    </h2>
                    {data.entries.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                            <p className="text-lg mb-1">No entries{hasFilters ? ' match your filters' : ' yet'}</p>
                            <p className="text-sm">{hasFilters ? 'Clear filters or' : 'Click'} "Add Entry" to record a charge or payment.</p>
                        </div>
                    ) : (
                        <div className="table-container">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Date</th><th>Description</th><th>Linked</th>
                                        <th>Category</th><th>Method</th><th>Type</th>
                                        <th className="text-right">Charge</th>
                                        <th className="text-right">Payment</th>
                                        <th className="text-right">Balance</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.entries.map(e => (
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
                                            <td className="text-xs capitalize">{e.category?.replace('_', ' ')}</td>
                                            <td className="text-xs capitalize">{e.paymentMethod?.replace('_', ' ')}</td>
                                            <td>
                                                {e.type === 'debit'
                                                    ? <span className="flex items-center gap-1 text-red-600 font-semibold text-xs"><MdTrendingUp size={12} /> Charge</span>
                                                    : <span className="flex items-center gap-1 text-green-600 font-semibold text-xs"><MdTrendingDown size={12} /> Payment</span>}
                                            </td>
                                            <td className="text-right text-sm">
                                                {e.type === 'debit' && (
                                                    <span className="text-red-600 font-bold">
                                                        {e.currency} {Number(e.amount).toLocaleString()}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="text-right text-sm">
                                                {e.type === 'credit' && (
                                                    <span className="text-green-700 font-bold">
                                                        {e.currency} {Number(e.amount).toLocaleString()}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="text-right text-sm font-semibold text-gray-700">{formatPKR(e.runningBalancePKR)}</td>
                                            <td className="text-right">
                                                <button onClick={() => setDocEntry(e)} className="btn-icon text-navy-700 hover:bg-navy-50" title="Attachments">
                                                    <MdAttachFile size={14} />
                                                    {e.documents?.length > 0 && <span className="ml-0.5 text-[10px] font-bold">{e.documents.length}</span>}
                                                </button>
                                                <button onClick={() => window.open(`/ledger/receipt/${e._id}`, '_blank')} className="btn-icon text-navy-700 hover:bg-navy-50" title="Print receipt">
                                                    <MdReceipt size={14} />
                                                </button>
                                                <button onClick={() => handleDelete(e._id)} className="btn-icon text-red-500 hover:bg-red-50"><MdDelete size={14} /></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-gray-50">
                                    <tr>
                                        <td colSpan="6" className="text-right text-sm font-semibold text-gray-600">Filtered totals →</td>
                                        <td className="text-right text-red-600 font-bold">{formatPKR(filtered.totalDebitPKR)}</td>
                                        <td className="text-right text-green-700 font-bold">{formatPKR(filtered.totalCreditPKR)}</td>
                                        <td className="text-right font-bold text-navy-800">{formatPKR(filtered.balancePKR)}</td>
                                        <td></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Add Entry Modal */}
            <FormModal isOpen={modal} onClose={() => setModal(false)} title="Add Ledger Entry" onSubmit={handleSubmit} loading={saving}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2 flex gap-2">
                        <button type="button" onClick={() => set('type', 'debit')} className={`flex-1 py-3 rounded-lg font-bold text-sm transition-all ${form.type === 'debit' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                            🔴 Charge (what we sold / billed)
                        </button>
                        <button type="button" onClick={() => set('type', 'credit')} className={`flex-1 py-3 rounded-lg font-bold text-sm transition-all ${form.type === 'credit' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                            🟢 Payment (what they paid)
                        </button>
                    </div>

                    <div><label className="label">Amount *</label>
                        <input className="input text-lg font-bold" type="number" min="0" value={form.amount} onChange={e => set('amount', e.target.value)} /></div>
                    <div><label className="label">Currency</label>
                        <select className="select" value={form.currency} onChange={e => set('currency', e.target.value)}>
                            <option>PKR</option><option>SAR</option>
                        </select></div>
                    <div><label className="label">Date</label>
                        <input className="input" type="date" value={form.date} onChange={e => set('date', e.target.value)} /></div>
                    <div><label className="label">Category</label>
                        <select className="select" value={form.category} onChange={e => set('category', e.target.value)}>
                            {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select></div>
                    <div><label className="label">Payment Method</label>
                        <select className="select" value={form.paymentMethod} onChange={e => set('paymentMethod', e.target.value)}>
                            <option value="cash">Cash</option><option value="bank_transfer">Bank Transfer</option>
                            <option value="online">Online</option><option value="cheque">Cheque</option>
                            <option value="adjustment">Adjustment</option>
                        </select></div>
                    <div><label className="label">Reference #</label>
                        <input className="input" value={form.referenceNumber} onChange={e => set('referenceNumber', e.target.value)} placeholder="Bank ref / Cheque # / Invoice #" /></div>

                    <div className="sm:col-span-2"><label className="label">Description *</label>
                        <input className="input" value={form.description} onChange={e => set('description', e.target.value)} placeholder={form.type === 'debit' ? 'e.g. Package UMR-0034 — 4 pax, full payment plan' : 'e.g. 1st installment via HBL'} /></div>

                    <div><label className="label">Link to Package (optional)</label>
                        <select className="select text-sm" value={form.package} onChange={e => set('package', e.target.value)}>
                            <option value="">— None —</option>
                            {packages.map(p => <option key={p._id} value={p._id}>{p.voucherId} — {p.packageName}</option>)}
                        </select></div>
                    <div><label className="label">Link to Departure (optional)</label>
                        <select className="select text-sm" value={form.departure} onChange={e => set('departure', e.target.value)}>
                            <option value="">— None —</option>
                            {departures.map(d => <option key={d._id} value={d._id}>{d.code} — {d.name}</option>)}
                        </select></div>

                    {form.type === 'credit' && (
                        <div className="sm:col-span-2 p-3 bg-green-50 rounded-lg border border-green-200">
                            <label className="label text-green-800">💰 Received Into Account {form.type === 'credit' ? '(recommended)' : ''}</label>
                            <select className="select text-sm" value={form.cashAccount} onChange={e => set('cashAccount', e.target.value)}>
                                <option value="">— Not tracked —</option>
                                {cashAccounts.map(a => <option key={a._id} value={a._id}>{a.name} {a.bankName ? `(${a.bankName})` : ''}</option>)}
                            </select>
                            <p className="text-[10px] text-green-700 mt-1">Pick the account where you received this payment. Lets the cash balance auto-update.</p>
                        </div>
                    )}

                    <div className="sm:col-span-2"><label className="label">Notes</label>
                        <textarea className="input" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
                </div>
            </FormModal>

            {/* Documents modal */}
            <FormModal isOpen={!!docEntry} onClose={() => setDocEntry(null)}
                title={`Attachments — ${docEntry?.description || ''}`}
                onSubmit={() => setDocEntry(null)} submitLabel="Done">
                {docEntry && (
                    <DocumentManager
                        documents={docEntry.documents || []}
                        uploadUrl={`/ledger/${docEntry._id}/documents`}
                        onChange={(updated) => { setDocEntry(updated); fetchAll(); }}
                        categories={PAYMENT_DOC_CATEGORIES}
                    />
                )}
            </FormModal>
        </div>
    );
}
