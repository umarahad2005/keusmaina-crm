import { useState, useEffect } from 'react';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import DataTable from '../../components/DataTable';
import FormModal from '../../components/FormModal';
import StatusBadge from '../../components/StatusBadge';
import toast from 'react-hot-toast';
import { MdLockReset, MdAdminPanelSettings } from 'react-icons/md';

const ROLES = [
    ['admin', 'Admin', 'Full system access — can manage users'],
    ['sales', 'Sales', 'Packages, clients, departures'],
    ['accounts', 'Accounts', 'Ledgers, suppliers, expenses, reports'],
    ['visa', 'Visa Officer', 'Visa tracker only'],
    ['operations', 'Operations', 'Inventory + departures + visa']
];
const ROLE_LABEL = Object.fromEntries(ROLES.map(([k, l]) => [k, l]));
const ROLE_COLORS = {
    admin: 'bg-red-50 text-red-700 border-red-200',
    sales: 'bg-blue-50 text-blue-700 border-blue-200',
    accounts: 'bg-green-50 text-green-700 border-green-200',
    visa: 'bg-purple-50 text-purple-700 border-purple-200',
    operations: 'bg-amber-50 text-amber-700 border-amber-200'
};

const empty = () => ({ name: '', email: '', password: '', role: 'sales' });
const fmtDate = (v) => v ? new Date(v).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function UserManagement() {
    const { user: me } = useAuth();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(false);
    const [pwModal, setPwModal] = useState(null); // user being password-reset
    const [pwInput, setPwInput] = useState('');
    const [form, setForm] = useState(empty());
    const [editId, setEditId] = useState(null);
    const [saving, setSaving] = useState(false);

    const fetchData = async () => {
        try { setLoading(true); const r = await api.get('/auth/users'); setData(r.data.data); }
        catch (e) { toast.error(e.response?.data?.message || 'Failed to load users'); }
        finally { setLoading(false); }
    };
    useEffect(() => { fetchData(); }, []);

    const columns = [
        { key: 'name', label: 'Name', render: (v, row) => (
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gold-500 text-white flex items-center justify-center text-xs font-bold">
                    {v?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div>
                    <div className="font-semibold">{v}</div>
                    {String(row._id) === String(me?._id) && <div className="text-[10px] text-gold-600">You</div>}
                </div>
            </div>
        )},
        { key: 'email', label: 'Email' },
        { key: 'role', label: 'Role', render: v => (
            <span className={`inline-block text-[11px] font-semibold border rounded-full px-2 py-0.5 ${ROLE_COLORS[v] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                {v === 'admin' && <MdAdminPanelSettings size={10} className="inline mr-1" />}
                {ROLE_LABEL[v] || v}
            </span>
        )},
        { key: 'isActive', label: 'Status', render: v => <StatusBadge active={v} /> },
        { key: 'createdAt', label: 'Joined', render: v => fmtDate(v) },
    ];

    const handleAdd = () => { setForm(empty()); setEditId(null); setModal(true); };
    const handleEdit = (row) => {
        setForm({ name: row.name, email: row.email, password: '', role: row.role, isActive: row.isActive });
        setEditId(row._id);
        setModal(true);
    };
    const handleDelete = async (row) => {
        if (String(row._id) === String(me?._id)) { toast.error('You cannot deactivate your own account'); return; }
        if (!confirm(`Deactivate "${row.name}"?`)) return;
        try { await api.delete(`/auth/users/${row._id}`); toast.success('Deactivated'); fetchData(); }
        catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    };
    const handleReactivate = async (row) => {
        try { await api.put(`/auth/users/${row._id}`, { isActive: true }); toast.success('Reactivated'); fetchData(); }
        catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    };

    const handleSubmit = async () => {
        if (!form.name || !form.email) { toast.error('Name and email required'); return; }
        if (!editId && (!form.password || form.password.length < 6)) { toast.error('Password (min 6 chars) required for new users'); return; }
        setSaving(true);
        try {
            if (editId) {
                await api.put(`/auth/users/${editId}`, { name: form.name, email: form.email, role: form.role, isActive: form.isActive });
            } else {
                await api.post('/auth/register', form);
            }
            toast.success(editId ? 'User updated' : 'User created');
            setModal(false); fetchData();
        } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
        finally { setSaving(false); }
    };

    const handleResetPassword = async () => {
        if (!pwInput || pwInput.length < 6) { toast.error('Min 6 characters'); return; }
        try {
            await api.put(`/auth/users/${pwModal._id}/password`, { password: pwInput });
            toast.success(`Password reset for ${pwModal.name}`);
            setPwModal(null); setPwInput('');
        } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    };

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const activeAdmins = data.filter(u => u.role === 'admin' && u.isActive).length;
    const totalActive = data.filter(u => u.isActive).length;

    return (
        <div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <div className="stat-card"><p className="stat-label">Total Users</p><p className="stat-value text-navy-800">{data.length}</p></div>
                <div className="stat-card"><p className="stat-label">Active Users</p><p className="stat-value text-green-700">{totalActive}</p></div>
                <div className="stat-card">
                    <div className="flex items-center justify-between">
                        <div><p className="stat-label">Admins</p><p className="stat-value text-red-600">{activeAdmins}</p></div>
                        <div className="stat-icon bg-red-500 text-white"><MdAdminPanelSettings size={22} /></div>
                    </div>
                </div>
            </div>

            <DataTable columns={columns} data={data} loading={loading}
                onAdd={handleAdd}
                onEdit={handleEdit}
                onDelete={(row) => row.isActive ? handleDelete(row) : handleReactivate(row)}
                extraActions={[{ icon: MdLockReset, title: 'Reset password', className: 'text-amber-700 hover:bg-amber-50', onClick: (row) => setPwModal(row) }]}
                title="User Management" addLabel="Add User" />

            {/* Add/edit modal */}
            <FormModal isOpen={modal} onClose={() => setModal(false)} title={editId ? 'Edit User' : 'Add User'} onSubmit={handleSubmit} loading={saving}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><label className="label">Full Name *</label>
                        <input className="input" value={form.name} onChange={e => set('name', e.target.value)} /></div>
                    <div><label className="label">Email *</label>
                        <input className="input" type="email" value={form.email} onChange={e => set('email', e.target.value)} /></div>
                    {!editId && (
                        <div className="sm:col-span-2"><label className="label">Password * (min 6 chars)</label>
                            <input className="input" type="password" value={form.password} onChange={e => set('password', e.target.value)} /></div>
                    )}
                    <div className="sm:col-span-2">
                        <label className="label">Role</label>
                        <div className="grid grid-cols-1 gap-1.5">
                            {ROLES.map(([k, label, hint]) => (
                                <label key={k} className={`flex items-start gap-2 p-2 rounded border cursor-pointer ${form.role === k ? 'border-gold-500 bg-gold-50' : 'border-gray-200'}`}>
                                    <input type="radio" name="role" checked={form.role === k} onChange={() => set('role', k)} className="mt-0.5" />
                                    <div className="flex-1">
                                        <div className="text-sm font-semibold">{label} {k === 'admin' && <span className="text-[10px] text-red-600 ml-1">(super admin)</span>}</div>
                                        <div className="text-[11px] text-gray-500">{hint}</div>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>
                    {editId && (
                        <div className="sm:col-span-2">
                            <label className="flex items-center gap-2 text-sm">
                                <input type="checkbox" checked={form.isActive !== false} onChange={e => set('isActive', e.target.checked)} />
                                Active (uncheck to deactivate)
                            </label>
                        </div>
                    )}
                </div>
            </FormModal>

            {/* Password reset modal */}
            <FormModal isOpen={!!pwModal} onClose={() => { setPwModal(null); setPwInput(''); }}
                title={`Reset Password — ${pwModal?.name || ''}`}
                onSubmit={handleResetPassword} submitLabel="Reset Password">
                <p className="text-sm text-gray-600 mb-2">Enter a new password for this user. They'll need to use this to log in next.</p>
                <label className="label">New Password (min 6 chars)</label>
                <input className="input" type="text" value={pwInput} onChange={e => setPwInput(e.target.value)} placeholder="Type new password" />
                <p className="text-[11px] text-gray-500 mt-1">Tip: share the new password with the user securely (in person, WhatsApp, etc.) — they should change it after logging in.</p>
            </FormModal>
        </div>
    );
}
