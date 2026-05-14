import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { useCurrency } from '../../context/CurrencyContext';
import DataTable from '../../components/DataTable';
import FormModal from '../../components/FormModal';
import StatusBadge from '../../components/StatusBadge';
import toast from 'react-hot-toast';
import { MdVisibility, MdAccountBalanceWallet, MdSavings } from 'react-icons/md';

const TYPES = [
    ['cash', '💵 Cash on hand'],
    ['bank', '🏦 Bank account'],
    ['wallet', '📱 Mobile wallet'],
    ['card', '💳 Card'],
    ['other', 'Other']
];
const TYPE_LABEL = Object.fromEntries(TYPES);

const empty = () => ({
    name: '', type: 'bank', accountNumber: '', bankName: '', branchOrIban: '',
    currency: 'PKR', openingBalancePKR: 0, notes: ''
});

export default function CashAccountList() {
    const nav = useNavigate();
    const { formatPKR } = useCurrency();
    const [data, setData] = useState([]);
    const [totalCashOnHand, setTotalCashOnHand] = useState(0);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(false);
    const [form, setForm] = useState(empty());
    const [editId, setEditId] = useState(null);
    const [saving, setSaving] = useState(false);

    const fetchData = async () => {
        try {
            setLoading(true);
            const r = await api.get('/cash-accounts');
            setData(r.data.data);
            setTotalCashOnHand(r.data.totalCashOnHand || 0);
        } catch { toast.error('Failed to load cash accounts'); }
        finally { setLoading(false); }
    };
    useEffect(() => { fetchData(); }, []);

    const columns = [
        { key: 'name', label: 'Account Name' },
        { key: 'type', label: 'Type', render: v => <span className="badge-navy">{TYPE_LABEL[v] || v}</span> },
        { key: 'bankName', label: 'Bank', render: v => v || '—' },
        { key: 'accountNumber', label: 'Account #', render: v => v ? <span className="font-mono text-xs">{v}</span> : '—' },
        { key: 'openingBalancePKR', label: 'Opening', render: v => <span className="text-xs">{formatPKR(v || 0)}</span> },
        { key: 'inflowPKR', label: 'Received', render: v => <span className="text-green-700 font-semibold text-xs">{formatPKR(v || 0)}</span> },
        { key: 'outflowPKR', label: 'Paid Out', render: v => <span className="text-red-600 font-semibold text-xs">{formatPKR(v || 0)}</span> },
        { key: 'balancePKR', label: 'Current Balance', render: v => <span className={`font-bold ${v > 0 ? 'text-green-700' : v < 0 ? 'text-red-600' : 'text-gray-600'}`}>{formatPKR(v || 0)}</span> },
        { key: 'isActive', label: 'Status', render: v => <StatusBadge active={v} /> }
    ];

    const handleAdd = () => { setForm(empty()); setEditId(null); setModal(true); };
    const handleEdit = (row) => {
        setForm({
            ...empty(), ...row,
            openingBalancePKR: row.openingBalancePKR || 0
        });
        setEditId(row._id); setModal(true);
    };
    const handleDelete = async (row) => {
        if (!confirm(`Deactivate "${row.name}"? Linked transactions will be preserved.`)) return;
        try { const r = await api.delete(`/cash-accounts/${row._id}`); toast.success(r.data.message || 'Deactivated'); fetchData(); }
        catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    };
    const handleSubmit = async () => {
        if (!form.name) { toast.error('Account name is required'); return; }
        setSaving(true);
        try {
            if (editId) await api.put(`/cash-accounts/${editId}`, form);
            else await api.post('/cash-accounts', form);
            toast.success(editId ? 'Updated' : 'Account created');
            setModal(false); fetchData();
        } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
        finally { setSaving(false); }
    };
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    return (
        <div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <div className="stat-card">
                    <div className="flex items-center justify-between">
                        <div><p className="stat-label">Active Accounts</p><p className="stat-value text-navy-800">{data.filter(a => a.isActive).length}</p></div>
                        <div className="stat-icon bg-navy-800 text-white"><MdAccountBalanceWallet size={22} /></div>
                    </div>
                </div>
                <div className="stat-card sm:col-span-2">
                    <div className="flex items-center justify-between">
                        <div><p className="stat-label">Total Cash on Hand</p><p className="stat-value text-green-700">{formatPKR(totalCashOnHand)}</p>
                            <p className="text-[10px] text-gray-500">Across all active accounts</p></div>
                        <div className="stat-icon bg-green-600 text-white"><MdSavings size={22} /></div>
                    </div>
                </div>
            </div>

            <DataTable columns={columns} data={data} loading={loading}
                onAdd={handleAdd} onEdit={handleEdit} onDelete={handleDelete}
                extraActions={[{ icon: MdVisibility, title: 'View transactions', className: 'text-navy-700 hover:bg-navy-50', onClick: (row) => nav(`/cash-accounts/view/${row._id}`) }]}
                title="Cash & Bank Accounts" addLabel="Add Account" />

            <FormModal isOpen={modal} onClose={() => setModal(false)} title={editId ? 'Edit Account' : 'Add Cash / Bank Account'} onSubmit={handleSubmit} loading={saving}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><label className="label">Account Name *</label>
                        <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. HBL Current Account" /></div>
                    <div><label className="label">Type</label>
                        <select className="select" value={form.type} onChange={e => set('type', e.target.value)}>
                            {TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </select></div>
                    {form.type === 'bank' && <>
                        <div><label className="label">Bank Name</label>
                            <input className="input" value={form.bankName} onChange={e => set('bankName', e.target.value)} placeholder="HBL / Meezan / UBL" /></div>
                        <div><label className="label">Branch / IBAN</label>
                            <input className="input" value={form.branchOrIban} onChange={e => set('branchOrIban', e.target.value)} placeholder="Branch or IBAN" /></div>
                    </>}
                    <div><label className="label">Account / Wallet #</label>
                        <input className="input font-mono text-sm" value={form.accountNumber} onChange={e => set('accountNumber', e.target.value)} /></div>
                    <div><label className="label">Currency</label>
                        <select className="select" value={form.currency} onChange={e => set('currency', e.target.value)}>
                            <option>PKR</option><option>SAR</option>
                        </select></div>
                    <div className="sm:col-span-2"><label className="label">Opening Balance (PKR)</label>
                        <input className="input text-lg font-bold" type="number" value={form.openingBalancePKR} onChange={e => set('openingBalancePKR', Number(e.target.value) || 0)} />
                        <p className="text-[10px] text-gray-500 mt-1">What's currently in this account at the time you're adding it</p></div>
                    <div className="sm:col-span-2"><label className="label">Notes</label>
                        <textarea className="input" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
                </div>
            </FormModal>
        </div>
    );
}
