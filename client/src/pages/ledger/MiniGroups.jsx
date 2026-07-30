import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import useAutoRefresh from '../../hooks/useAutoRefresh';
import FormModal from '../../components/FormModal';
import toast from 'react-hot-toast';
import { MdAdd, MdEdit, MdDelete, MdGroups, MdVisibility } from 'react-icons/md';

// Mini groups — a family or small party that travels together, buys one
// package and settles as one account.
//
// The group is a billing container over existing pilgrims, not a new kind of
// client: everyone keeps their own profile, passport and visa record, and the
// money posts to whichever member is the payer. That is why the row opens the
// payer's ledger — there is only ever one real account behind a group.

const emptyForm = () => ({ name: '', relation: 'Family', members: [], payer: '', notes: '' });

export default function MiniGroups({ formatPKR }) {
    const nav = useNavigate();
    const [groups, setGroups] = useState([]);
    const [clients, setClients] = useState([]);
    const [summary, setSummary] = useState({ count: 0, totalDebitPKR: 0, totalCreditPKR: 0, balancePKR: 0 });
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(false);
    const [editId, setEditId] = useState(null);
    const [form, setForm] = useState(emptyForm());
    const [saving, setSaving] = useState(false);
    const [memberSearch, setMemberSearch] = useState('');

    const fetchAll = async ({ silent = false } = {}) => {
        if (!silent) setLoading(true);
        try {
            const [g, c] = await Promise.all([
                api.get('/client-groups'),
                api.get('/clients/b2c?limit=500')
            ]);
            setGroups(g.data.data || []);
            setSummary(g.data.summary || { count: 0, totalDebitPKR: 0, totalCreditPKR: 0, balancePKR: 0 });
            setClients(c.data.data || []);
        } catch (e) {
            if (!silent) toast.error(e.response?.data?.message || 'Failed to load mini groups');
        } finally { if (!silent) setLoading(false); }
    };

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { fetchAll(); }, []);
    useAutoRefresh(() => fetchAll({ silent: true }), { enabled: !modal });

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const toggleMember = (id) => {
        setForm(f => {
            const has = f.members.includes(id);
            const members = has ? f.members.filter(m => m !== id) : [...f.members, id];
            // Dropping the payer out of the group would leave the account
            // pointing at someone who isn't in it.
            const payer = has && f.payer === id ? '' : f.payer;
            return { ...f, members, payer };
        });
    };

    const openCreate = () => { setEditId(null); setForm(emptyForm()); setMemberSearch(''); setModal(true); };
    const openEdit = (g) => {
        setEditId(g._id);
        setForm({
            name: g.name || '',
            relation: g.relation || 'Family',
            members: (g.members || []).map(m => m._id || m),
            payer: g.payer?._id || g.payer || '',
            notes: g.notes || ''
        });
        setMemberSearch('');
        setModal(true);
    };

    const submit = async () => {
        if (!form.name.trim()) { toast.error('Group name is required'); return; }
        if (form.members.length < 2) { toast.error('Pick at least 2 members'); return; }
        if (!form.payer) { toast.error('Choose which member pays'); return; }
        setSaving(true);
        try {
            if (editId) await api.put(`/client-groups/${editId}`, form);
            else await api.post('/client-groups', form);
            toast.success(editId ? 'Group updated' : 'Mini group created');
            setModal(false);
            fetchAll();
        } catch (e) { toast.error(e.response?.data?.message || 'Failed to save'); }
        finally { setSaving(false); }
    };

    const remove = async (g) => {
        if (!confirm(`Remove mini group "${g.name}"? The pilgrims themselves are not deleted.`)) return;
        try { await api.delete(`/client-groups/${g._id}`); toast.success('Group removed'); fetchAll(); }
        catch (e) { toast.error(e.response?.data?.message || 'Failed to remove'); }
    };

    const openPayerLedger = (g) => {
        const payerId = g.payer?._id || g.payer;
        if (payerId) nav(`/ledger/view/B2C/${payerId}`);
    };

    const visibleClients = clients.filter(c => {
        const s = memberSearch.trim().toLowerCase();
        if (!s) return true;
        return `${c.fullName || ''} ${c.cnic || ''} ${c.phone || ''}`.toLowerCase().includes(s);
    });
    const chosen = clients.filter(c => form.members.includes(c._id));

    if (loading) return (
        <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-navy-800 border-t-gold-500 rounded-full animate-spin" />
        </div>
    );

    return (
        <div>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <p className="text-sm text-gray-500">
                    {summary.count} group{summary.count === 1 ? '' : 's'} · outstanding{' '}
                    <span className={summary.balancePKR > 0 ? 'text-red-600 font-semibold' : 'text-green-700 font-semibold'}>
                        {formatPKR(summary.balancePKR)}
                    </span>
                </p>
                <button onClick={openCreate} className="btn-gold btn-sm flex items-center gap-1">
                    <MdAdd size={16} /> Create Mini Group
                </button>
            </div>

            <div className="card"><div className="card-body">
                {groups.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                        <MdGroups size={40} className="mx-auto mb-2 opacity-40" />
                        <p className="text-lg mb-1">No mini groups yet</p>
                        <p className="text-sm">Use one when a family or small party buys together and pays as one account.</p>
                    </div>
                ) : (
                    <div className="table-container">
                        <table className="data-table">
                            <thead><tr>
                                <th>Group</th><th>Members</th><th>Pays through</th>
                                <th className="text-right">Charged</th>
                                <th className="text-right">Received</th>
                                <th className="text-right">Outstanding</th>
                                <th className="text-right">Actions</th>
                            </tr></thead>
                            <tbody>
                                {groups.map(g => (
                                    <tr key={g._id}>
                                        <td>
                                            <div className="font-medium">{g.name}</div>
                                            {g.relation && <div className="text-[10px] text-gray-500">{g.relation}</div>}
                                        </td>
                                        <td className="text-xs">
                                            <span className="badge-navy">{g.members?.length || 0} pax</span>
                                            <div className="text-[10px] text-gray-500 mt-0.5">
                                                {(g.members || []).map(m => m.fullName).filter(Boolean).join(', ')}
                                            </div>
                                        </td>
                                        <td className="text-sm">{g.payer?.fullName || '—'}</td>
                                        <td className="text-right text-xs text-red-600 font-semibold">{formatPKR(g.totalDebitPKR)}</td>
                                        <td className="text-right text-xs text-green-700 font-semibold">{formatPKR(g.totalCreditPKR)}</td>
                                        <td className={`text-right text-xs font-bold ${g.balancePKR > 0 ? 'text-red-600' : g.balancePKR < 0 ? 'text-green-700' : 'text-gray-500'}`}>
                                            {formatPKR(g.balancePKR)}
                                        </td>
                                        <td className="text-right whitespace-nowrap">
                                            <button onClick={() => openPayerLedger(g)} className="btn-icon text-navy-700 hover:bg-navy-50" title="Open the payer's ledger"><MdVisibility size={16} /></button>
                                            <button onClick={() => openEdit(g)} className="btn-icon text-navy-800 hover:bg-navy-50" title="Edit"><MdEdit size={16} /></button>
                                            <button onClick={() => remove(g)} className="btn-icon text-red-500 hover:bg-red-50" title="Remove"><MdDelete size={16} /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div></div>

            <p className="text-xs text-gray-500 mt-3 px-2">
                A mini group bills through one member, so charges and payments live on that
                pilgrim&apos;s ledger. Every member keeps their own profile, passport and visa record.
            </p>

            <FormModal isOpen={modal} onClose={() => setModal(false)}
                title={editId ? 'Edit Mini Group' : 'Create Mini Group'} onSubmit={submit} loading={saving}>
                <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="label">Group Name *</label>
                            <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Ahmed Family" />
                        </div>
                        <div>
                            <label className="label">Relation</label>
                            <select className="select" value={form.relation} onChange={e => set('relation', e.target.value)}>
                                <option>Family</option><option>Friends</option><option>Colleagues</option><option>Other</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="label">Members * <span className="text-gray-400 font-normal">(at least 2)</span></label>
                        <input className="input mb-2" value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="Search pilgrims by name, CNIC or phone…" />
                        <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
                            {visibleClients.length === 0 && <p className="text-sm text-gray-400 p-3 text-center">No pilgrims match</p>}
                            {visibleClients.map(c => (
                                <label key={c._id} className="flex items-center gap-2 p-2 hover:bg-gray-50 cursor-pointer">
                                    <input type="checkbox" checked={form.members.includes(c._id)} onChange={() => toggleMember(c._id)} className="w-4 h-4" />
                                    <span className="text-sm flex-1">{c.fullName}</span>
                                    <span className="text-[11px] text-gray-500">{c.cnic || c.phone || ''}</span>
                                </label>
                            ))}
                        </div>
                        <p className="text-[11px] text-gray-500 mt-1">{form.members.length} selected</p>
                    </div>

                    <div>
                        <label className="label">Who pays? *</label>
                        <select className="select" value={form.payer} onChange={e => set('payer', e.target.value)}>
                            <option value="">— Select the paying member —</option>
                            {chosen.map(c => <option key={c._id} value={c._id}>{c.fullName}</option>)}
                        </select>
                        <p className="text-[11px] text-gray-500 mt-1">
                            All charges and payments for the group post to this pilgrim&apos;s ledger.
                        </p>
                    </div>

                    <div>
                        <label className="label">Notes</label>
                        <textarea className="input" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
                    </div>
                </div>
            </FormModal>
        </div>
    );
}
