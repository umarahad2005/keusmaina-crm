import { useState, useEffect } from 'react';
import api from '../../utils/api';
import { useCurrency } from '../../context/CurrencyContext';
import DataTable from '../../components/DataTable';
import FormModal from '../../components/FormModal';
import DocumentManager from '../../components/DocumentManager';
import toast from 'react-hot-toast';
import { MdAttachFile, MdReceiptLong, MdCalendarMonth, MdDateRange } from 'react-icons/md';

const CATEGORIES = [
    ['rent', 'Rent'],
    ['salaries', 'Salaries'],
    ['utilities', 'Utilities'],
    ['marketing', 'Marketing'],
    ['office_supplies', 'Office Supplies'],
    ['communication', 'Communication'],
    ['maintenance', 'Maintenance'],
    ['legal_professional', 'Legal/Professional'],
    ['travel_local', 'Local Travel'],
    ['bank_charges', 'Bank Charges'],
    ['other', 'Other']
];
const CAT_LABEL = Object.fromEntries(CATEGORIES);
const EXPENSE_DOC_CATEGORIES = [['receipt', 'Receipt'], ['invoice', 'Invoice'], ['bank_slip', 'Bank slip'], ['other', 'Other']];

const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (v) => v ? new Date(v).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const empty = () => ({
    date: today(), category: 'other', description: '', paidTo: '',
    amount: '', currency: 'PKR', paymentMethod: 'cash',
    referenceNumber: '', cashAccount: '', notes: ''
});

export default function Expenses() {
    const [data, setData] = useState([]);
    const [summary, setSummary] = useState({ monthTotalPKR: 0, yearTotalPKR: 0, monthCount: 0, yearCount: 0, byCategory: [] });
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(false);
    const [form, setForm] = useState(empty());
    const [editId, setEditId] = useState(null);
    const [saving, setSaving] = useState(false);
    const [docEntry, setDocEntry] = useState(null);
    const [filterCat, setFilterCat] = useState('all');
    const [cashAccounts, setCashAccounts] = useState([]);
    const { formatPKR } = useCurrency();

    const fetchData = async () => {
        try {
            setLoading(true);
            const params = filterCat === 'all' ? '' : `?category=${filterCat}`;
            const [list, sum, ca] = await Promise.all([
                api.get(`/expenses${params}`),
                api.get('/expenses/summary'),
                api.get('/cash-accounts?status=active')
            ]);
            setData(list.data.data);
            setSummary(sum.data.data);
            setCashAccounts(ca.data.data || []);
        } catch { toast.error('Failed to load expenses'); }
        finally { setLoading(false); }
    };
    useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [filterCat]);

    const columns = [
        { key: 'date', label: 'Date', render: v => fmtDate(v) },
        { key: 'category', label: 'Category', render: v => <span className="badge-navy">{CAT_LABEL[v] || v}</span> },
        { key: 'description', label: 'Description' },
        { key: 'paidTo', label: 'Paid To' },
        { key: 'paymentMethod', label: 'Method', render: v => <span className="text-xs capitalize">{v?.replace('_', ' ')}</span> },
        { key: 'amount', label: 'Amount', render: (v, row) => (
            <div className="text-right">
                <div className="font-bold text-red-600">{row.currency} {Number(v).toLocaleString()}</div>
                {row.currency === 'SAR' && <div className="text-xs text-gray-500">{formatPKR(row.amountPKR)}</div>}
            </div>
        )},
        { key: 'documents', label: 'Files', render: v => v?.length ? <span className="text-xs">{v.length} 📎</span> : '—' },
    ];

    const handleAdd = () => { setForm(empty()); setEditId(null); setModal(true); };
    const handleEdit = (row) => {
        setForm({
            ...empty(), ...row,
            date: row.date ? String(row.date).slice(0, 10) : today()
        });
        setEditId(row._id);
        setModal(true);
    };
    const handleDelete = async (row) => {
        if (!confirm(`Delete expense "${row.description}"?`)) return;
        try { await api.delete(`/expenses/${row._id}`); toast.success('Deleted'); fetchData(); }
        catch { toast.error('Failed'); }
    };
    const handleSubmit = async () => {
        if (!form.amount || !form.description) { toast.error('Amount & description required'); return; }
        setSaving(true);
        try {
            if (editId) await api.put(`/expenses/${editId}`, form);
            else await api.post('/expenses', form);
            toast.success(editId ? 'Updated' : 'Recorded');
            setModal(false); fetchData();
        } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
        finally { setSaving(false); }
    };
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    return (
        <div>
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <div className="stat-card">
                    <div className="flex items-center justify-between">
                        <div><p className="stat-label">This Month</p><p className="stat-value text-red-600">{formatPKR(summary.monthTotalPKR)}</p>
                            <p className="text-[10px] text-gray-500">{summary.monthCount} entr{summary.monthCount === 1 ? 'y' : 'ies'}</p></div>
                        <div className="stat-icon bg-red-500 text-white"><MdCalendarMonth size={22} /></div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="flex items-center justify-between">
                        <div><p className="stat-label">This Year ({summary.year})</p><p className="stat-value text-navy-800">{formatPKR(summary.yearTotalPKR)}</p>
                            <p className="text-[10px] text-gray-500">{summary.yearCount} entr{summary.yearCount === 1 ? 'y' : 'ies'}</p></div>
                        <div className="stat-icon bg-navy-800 text-white"><MdDateRange size={22} /></div>
                    </div>
                </div>
                <div className="stat-card">
                    <p className="stat-label mb-1">Top Categories (year)</p>
                    {summary.byCategory.length === 0 ? <p className="text-xs text-gray-400">No data</p> : (
                        <ul className="text-xs space-y-0.5">
                            {summary.byCategory.slice(0, 4).map(c => (
                                <li key={c.category} className="flex justify-between">
                                    <span>{CAT_LABEL[c.category] || c.category}</span>
                                    <span className="font-semibold text-red-600">{formatPKR(c.total)}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            {/* Category filter */}
            <div className="flex flex-wrap gap-1.5 mb-3">
                <button onClick={() => setFilterCat('all')} className={`px-3 py-1 rounded-lg text-xs font-semibold ${filterCat === 'all' ? 'bg-navy-800 text-white' : 'bg-gray-100 text-gray-600'}`}>All</button>
                {CATEGORIES.map(([k, l]) => (
                    <button key={k} onClick={() => setFilterCat(k)} className={`px-3 py-1 rounded-lg text-xs font-semibold ${filterCat === k ? 'bg-navy-800 text-white' : 'bg-gray-100 text-gray-600'}`}>{l}</button>
                ))}
            </div>

            <DataTable columns={columns} data={data} loading={loading}
                onAdd={handleAdd} onEdit={handleEdit} onDelete={handleDelete}
                extraActions={[{ icon: MdAttachFile, title: 'Attachments', className: 'text-navy-700 hover:bg-navy-50', onClick: (row) => setDocEntry(row) }]}
                title="Expenses" addLabel="Record Expense" />

            <FormModal isOpen={modal} onClose={() => setModal(false)} title={editId ? 'Edit Expense' : 'Record Expense'} onSubmit={handleSubmit} loading={saving}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><label className="label">Date *</label>
                        <input className="input" type="date" value={form.date} onChange={e => set('date', e.target.value)} /></div>
                    <div><label className="label">Category *</label>
                        <select className="select" value={form.category} onChange={e => set('category', e.target.value)}>
                            {CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </select></div>
                    <div className="sm:col-span-2"><label className="label">Description *</label>
                        <input className="input" value={form.description} onChange={e => set('description', e.target.value)} placeholder="e.g. April office rent" /></div>
                    <div><label className="label">Paid To</label>
                        <input className="input" value={form.paidTo} onChange={e => set('paidTo', e.target.value)} placeholder="Landlord / employee / vendor name" /></div>
                    <div><label className="label">Reference #</label>
                        <input className="input" value={form.referenceNumber} onChange={e => set('referenceNumber', e.target.value)} placeholder="Bank ref / invoice #" /></div>
                    <div><label className="label">Amount *</label>
                        <input className="input text-lg font-bold" type="number" min="0" value={form.amount} onChange={e => set('amount', e.target.value)} /></div>
                    <div><label className="label">Currency</label>
                        <select className="select" value={form.currency} onChange={e => set('currency', e.target.value)}>
                            <option>PKR</option><option>SAR</option>
                        </select></div>
                    <div><label className="label">Payment Method</label>
                        <select className="select" value={form.paymentMethod} onChange={e => set('paymentMethod', e.target.value)}>
                            <option value="cash">Cash</option>
                            <option value="bank_transfer">Bank Transfer</option>
                            <option value="online">Online</option>
                            <option value="cheque">Cheque</option>
                            <option value="card">Card</option>
                            <option value="adjustment">Adjustment</option>
                        </select></div>
                    <div className="sm:col-span-2 p-3 bg-red-50 rounded-lg border border-red-200">
                        <label className="label text-red-800">💸 Paid From Account (recommended)</label>
                        <select className="select text-sm" value={form.cashAccount} onChange={e => set('cashAccount', e.target.value)}>
                            <option value="">— Not tracked —</option>
                            {cashAccounts.map(a => <option key={a._id} value={a._id}>{a.name} {a.bankName ? `(${a.bankName})` : ''}</option>)}
                        </select>
                        <p className="text-[10px] text-red-700 mt-1">Pick the account this money came from. Lets the cash balance auto-update.</p>
                    </div>
                </div>
                <div><label className="label">Notes</label>
                    <textarea className="input" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
            </FormModal>

            {/* Documents modal */}
            <FormModal isOpen={!!docEntry} onClose={() => setDocEntry(null)}
                title={`Attachments — ${docEntry?.description || ''}`}
                onSubmit={() => setDocEntry(null)} submitLabel="Done">
                {docEntry && (
                    <DocumentManager
                        documents={docEntry.documents || []}
                        uploadUrl={`/expenses/${docEntry._id}/documents`}
                        onChange={(updated) => { setDocEntry(updated); fetchData(); }}
                        categories={EXPENSE_DOC_CATEGORIES}
                    />
                )}
            </FormModal>
        </div>
    );
}
