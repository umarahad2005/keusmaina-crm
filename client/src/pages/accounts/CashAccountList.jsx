import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { useCurrency } from '../../context/CurrencyContext';
import DataTable from '../../components/DataTable';
import FormModal from '../../components/FormModal';
import StatusBadge from '../../components/StatusBadge';
import toast from 'react-hot-toast';
import useAutoRefresh from '../../hooks/useAutoRefresh';
import { MdVisibility, MdAccountBalanceWallet, MdSavings, MdSwapHoriz, MdUndo } from 'react-icons/md';

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

    // Internal transfers — moving our own money between our own accounts.
    const [xferModal, setXferModal] = useState(false);
    const [xfer, setXfer] = useState({ fromAccount: '', toAccount: '', amountPKR: '', date: new Date().toISOString().slice(0, 10), referenceNumber: '', notes: '' });
    const [transfers, setTransfers] = useState([]);

    const fetchData = async ({ silent = false } = {}) => {
        try {
            if (!silent) setLoading(true);
            const [r, t] = await Promise.all([
                api.get('/cash-accounts'),
                api.get('/cash-accounts/transfers/list?limit=25')
            ]);
            setData(r.data.data);
            setTotalCashOnHand(r.data.totalCashOnHand || 0);
            setTransfers(t.data.data || []);
        } catch { if (!silent) toast.error('Failed to load cash accounts'); }
        finally { if (!silent) setLoading(false); }
    };
    useEffect(() => { fetchData(); }, []);
    useAutoRefresh(() => fetchData({ silent: true }), { enabled: !modal && !xferModal });

    const balanceOf = (id) => data.find(a => a._id === id)?.balancePKR ?? 0;
    const setX = (k, v) => setXfer(f => ({ ...f, [k]: v }));

    const openTransfer = () => {
        setXfer({ fromAccount: '', toAccount: '', amountPKR: '', date: new Date().toISOString().slice(0, 10), referenceNumber: '', notes: '' });
        setXferModal(true);
    };
    const submitTransfer = async () => {
        if (!xfer.fromAccount || !xfer.toAccount) { toast.error('Choose both accounts'); return; }
        if (xfer.fromAccount === xfer.toAccount) { toast.error('Pick two different accounts'); return; }
        if (!(Number(xfer.amountPKR) > 0)) { toast.error('Enter an amount'); return; }
        setSaving(true);
        try {
            await api.post('/cash-accounts/transfers', xfer);
            toast.success('Transfer recorded');
            setXferModal(false);
            fetchData();
        } catch (e) { toast.error(e.response?.data?.message || 'Transfer failed'); }
        finally { setSaving(false); }
    };
    const reverseTransfer = async (t) => {
        if (!confirm(`Reverse the transfer of ${formatPKR(t.amountPKR)} from ${t.fromAccount?.name} to ${t.toAccount?.name}?`)) return;
        try { await api.delete(`/cash-accounts/transfers/${t._id}`); toast.success('Transfer reversed'); fetchData(); }
        catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    };

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

            <div className="flex justify-end mb-3">
                <button onClick={openTransfer} className="btn-primary btn-sm flex items-center gap-1">
                    <MdSwapHoriz size={16} /> Transfer Between Accounts
                </button>
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

            {/* Internal transfer — money moving between our own accounts. It is
                neither income nor an expense, so it never reaches the P&L or the
                month-end split; only the two account balances change. */}
            <FormModal isOpen={xferModal} onClose={() => setXferModal(false)}
                title="Transfer Between Accounts" onSubmit={submitTransfer} loading={saving} submitLabel="Record Transfer">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label className="label">From *</label>
                        <select className="select" value={xfer.fromAccount} onChange={e => setX('fromAccount', e.target.value)}>
                            <option value="">— Select account —</option>
                            {data.filter(a => a.isActive).map(a => (
                                <option key={a._id} value={a._id}>{a.name} — {formatPKR(a.balancePKR ?? 0)}</option>
                            ))}
                        </select>
                        {xfer.fromAccount && (
                            <p className="text-[11px] text-gray-500 mt-1">Available: {formatPKR(balanceOf(xfer.fromAccount))}</p>
                        )}
                    </div>
                    <div>
                        <label className="label">To *</label>
                        <select className="select" value={xfer.toAccount} onChange={e => setX('toAccount', e.target.value)}>
                            <option value="">— Select account —</option>
                            {data.filter(a => a.isActive && a._id !== xfer.fromAccount).map(a => (
                                <option key={a._id} value={a._id}>{a.name} — {formatPKR(a.balancePKR ?? 0)}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="label">Amount (PKR) *</label>
                        <input className="input" type="number" min="1" value={xfer.amountPKR} onChange={e => setX('amountPKR', e.target.value)} />
                        {xfer.fromAccount && Number(xfer.amountPKR) > balanceOf(xfer.fromAccount) && (
                            <p className="text-[11px] text-red-600 mt-1">More than that account holds.</p>
                        )}
                    </div>
                    <div>
                        <label className="label">Date</label>
                        <input className="input" type="date" value={xfer.date} onChange={e => setX('date', e.target.value)} />
                    </div>
                    <div>
                        <label className="label">Reference #</label>
                        <input className="input" value={xfer.referenceNumber} onChange={e => setX('referenceNumber', e.target.value)} placeholder="Slip / cheque / online ref" />
                    </div>
                    <div>
                        <label className="label">Notes</label>
                        <input className="input" value={xfer.notes} onChange={e => setX('notes', e.target.value)} />
                    </div>
                    <p className="sm:col-span-2 text-[11px] text-gray-500">
                        This only moves money between your accounts — it is not income or an expense,
                        so it will not appear in Profit &amp; Loss or the month-end closing.
                    </p>
                </div>
            </FormModal>

            {transfers.length > 0 && (
                <div className="card mt-4"><div className="card-body">
                    <h3 className="font-bold text-sm text-navy-800 mb-3">Recent Transfers</h3>
                    <div className="table-container">
                        <table className="data-table">
                            <thead><tr>
                                <th>Date</th><th>From</th><th>To</th><th className="text-right">Amount</th><th>Reference</th><th className="text-right">Actions</th>
                            </tr></thead>
                            <tbody>
                                {transfers.map(t => (
                                    <tr key={t._id}>
                                        <td className="text-xs">{t.date ? new Date(t.date).toLocaleDateString('en-PK') : '—'}</td>
                                        <td className="text-sm">{t.fromAccount?.name || '—'}</td>
                                        <td className="text-sm">{t.toAccount?.name || '—'}</td>
                                        <td className="text-right font-semibold">{formatPKR(t.amountPKR)}</td>
                                        <td className="text-xs text-gray-500">{t.referenceNumber || '—'}</td>
                                        <td className="text-right">
                                            <button onClick={() => reverseTransfer(t)} className="btn-ghost btn-sm text-red-500 flex items-center gap-1 ml-auto" title="Reverse this transfer">
                                                <MdUndo size={14} /> Reverse
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div></div>
            )}
        </div>
    );
}
