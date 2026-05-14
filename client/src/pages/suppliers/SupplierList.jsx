import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { useCurrency } from '../../context/CurrencyContext';
import DataTable from '../../components/DataTable';
import FormModal from '../../components/FormModal';
import StatusBadge from '../../components/StatusBadge';
import toast from 'react-hot-toast';
import { MdVisibility, MdAccountBalance, MdPlayArrow, MdBlock } from 'react-icons/md';

const TYPE_LABELS = { hotel: '🏨 Hotel', airline: '✈️ Airline', transport: '🚌 Transport', visa_agent: '🛂 Visa Agent', ziyarat: '🕌 Ziyarat', other: 'Other' };

const empty = () => ({ name: '', type: 'other', contactPerson: '', phone: '', whatsapp: '', email: '', city: '', address: '', openingBalancePKR: 0, notes: '' });

export default function SupplierList() {
    const [data, setData] = useState([]);
    const [summary, setSummary] = useState({ totalPayable: 0, totalDebit: 0, totalCredit: 0, supplierCount: 0 });
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(false);
    const [form, setForm] = useState(empty());
    const [editId, setEditId] = useState(null);
    const [saving, setSaving] = useState(false);
    const { formatPKR } = useCurrency();
    const nav = useNavigate();

    const fetchData = async () => {
        try {
            setLoading(true);
            const [list, sum] = await Promise.all([api.get('/suppliers'), api.get('/suppliers/summary')]);
            setData(list.data.data);
            setSummary(sum.data.data);
        } catch { toast.error('Failed to load suppliers'); }
        finally { setLoading(false); }
    };
    useEffect(() => { fetchData(); }, []);

    const columns = [
        { key: 'name', label: 'Name' },
        { key: 'type', label: 'Type', render: v => <span className="badge-navy">{TYPE_LABELS[v] || v}</span> },
        { key: 'contactPerson', label: 'Contact' },
        { key: 'phone', label: 'Phone' },
        { key: 'city', label: 'City' },
        { key: 'totalDebit', label: 'Invoiced', render: v => <span className="text-red-600 font-semibold text-xs">{formatPKR(v || 0)}</span> },
        { key: 'totalCredit', label: 'Paid', render: v => <span className="text-green-700 font-semibold text-xs">{formatPKR(v || 0)}</span> },
        { key: 'balancePKR', label: 'Outstanding', render: v => <span className={`font-bold text-xs ${v > 0 ? 'text-red-600' : v < 0 ? 'text-green-700' : 'text-gray-600'}`}>{formatPKR(v || 0)}</span> },
        { key: 'isActive', label: 'Status', render: v => <StatusBadge active={v} /> },
    ];

    const handleAdd = () => { setForm(empty()); setEditId(null); setModal(true); };
    const handleEdit = (row) => { setForm({ ...empty(), ...row }); setEditId(row._id); setModal(true); };
    const handleDelete = async (row) => {
        if (!confirm(`Deactivate "${row.name}"? You won't be able to record new invoices or payments for this supplier until reactivated.`)) return;
        try { await api.delete(`/suppliers/${row._id}`); toast.success('Deactivated'); fetchData(); }
        catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    };
    const handleReactivate = async (row) => {
        if (!confirm(`Reactivate "${row.name}"? They'll appear in supplier dropdowns again and you can record new entries.`)) return;
        try { await api.put(`/suppliers/${row._id}`, { isActive: true }); toast.success(`${row.name} reactivated`); fetchData(); }
        catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    };
    const handleSubmit = async () => {
        if (!form.name) { toast.error('Name is required'); return; }
        setSaving(true);
        try {
            if (editId) await api.put(`/suppliers/${editId}`, form);
            else await api.post('/suppliers', form);
            toast.success(editId ? 'Updated' : 'Created');
            setModal(false); fetchData();
        } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
        finally { setSaving(false); }
    };
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    return (
        <div>
            {/* Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
                <div className="stat-card"><p className="stat-label">Suppliers</p><p className="stat-value text-navy-800">{summary.supplierCount}</p></div>
                <div className="stat-card"><p className="stat-label">Total Invoiced</p><p className="stat-value text-red-600">{formatPKR(summary.totalDebit)}</p></div>
                <div className="stat-card"><p className="stat-label">Total Paid</p><p className="stat-value text-green-700">{formatPKR(summary.totalCredit)}</p></div>
                <div className="stat-card flex items-center justify-between">
                    <div><p className="stat-label">Outstanding Payable</p><p className={`stat-value ${summary.totalPayable > 0 ? 'text-red-600' : 'text-green-700'}`}>{formatPKR(summary.totalPayable)}</p></div>
                    <div className="stat-icon bg-navy-800 text-white"><MdAccountBalance size={22} /></div>
                </div>
            </div>

            <DataTable
                columns={columns}
                data={data}
                loading={loading}
                onAdd={handleAdd}
                onEdit={handleEdit}
                extraActions={[
                    { icon: MdVisibility, title: 'View ledger', className: 'text-navy-700 hover:bg-navy-50', onClick: (row) => nav(`/suppliers/view/${row._id}`) },
                    { icon: MdPlayArrow, title: 'Reactivate supplier', className: 'text-green-600 hover:bg-green-50', onClick: handleReactivate, show: (row) => !row.isActive },
                    { icon: MdBlock, title: 'Deactivate (stop buying from this supplier)', className: 'text-amber-600 hover:bg-amber-50', onClick: handleDelete, show: (row) => row.isActive }
                ]}
                title="Suppliers" addLabel="Add Supplier" />

            <FormModal isOpen={modal} onClose={() => setModal(false)} title={editId ? 'Edit Supplier' : 'Add Supplier'} onSubmit={handleSubmit} loading={saving}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><label className="label">Name *</label>
                        <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Naseem Travel, Hilton Makkah" /></div>
                    <div><label className="label">Type</label>
                        <select className="select" value={form.type} onChange={e => set('type', e.target.value)}>
                            {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select></div>
                    <div><label className="label">Contact Person</label>
                        <input className="input" value={form.contactPerson} onChange={e => set('contactPerson', e.target.value)} /></div>
                    <div><label className="label">Phone</label>
                        <input className="input" value={form.phone} onChange={e => set('phone', e.target.value)} /></div>
                    <div><label className="label">WhatsApp</label>
                        <input className="input" value={form.whatsapp} onChange={e => set('whatsapp', e.target.value)} /></div>
                    <div><label className="label">Email</label>
                        <input className="input" type="email" value={form.email} onChange={e => set('email', e.target.value)} /></div>
                    <div><label className="label">City</label>
                        <input className="input" value={form.city} onChange={e => set('city', e.target.value)} /></div>
                    <div><label className="label">Opening Balance (PKR)</label>
                        <input className="input" type="number" value={form.openingBalancePKR} onChange={e => set('openingBalancePKR', Number(e.target.value) || 0)} placeholder="What we already owe at entry" />
                        <p className="text-[10px] text-gray-500 mt-1">Positive if we owe them; leave 0 if starting fresh</p></div>
                </div>
                <div><label className="label">Address</label>
                    <input className="input" value={form.address} onChange={e => set('address', e.target.value)} /></div>
                <div><label className="label">Notes</label>
                    <textarea className="input" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
            </FormModal>
        </div>
    );
}
