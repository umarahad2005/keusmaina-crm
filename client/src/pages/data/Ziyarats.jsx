import { useState, useEffect } from 'react';
import api from '../../utils/api';
import { useCurrency } from '../../context/CurrencyContext';
import DataTable from '../../components/DataTable';
import FormModal from '../../components/FormModal';
import StatusBadge from '../../components/StatusBadge';
import CurrencyDisplay from '../../components/CurrencyDisplay';
import toast from 'react-hot-toast';

const emptyForm = { name: '', location: 'Makkah', duration: '', transportIncluded: false, ratePerPersonSAR: '', ratePerGroupSAR: '', description: '' };

export default function Ziyarats() {
    const [data, setData] = useState([]); const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(false); const [form, setForm] = useState(emptyForm);
    const [editId, setEditId] = useState(null); const [saving, setSaving] = useState(false);
    const { convertToPKR, formatPKR } = useCurrency();

    const fetchData = async () => {
        try { setLoading(true); const res = await api.get('/ziyarats'); setData(res.data.data); }
        catch { toast.error('Failed to load'); } finally { setLoading(false); }
    };
    useEffect(() => { fetchData(); }, []);

    const columns = [
        { key: 'name', label: 'Ziyarat Name' },
        { key: 'location', label: 'Location', render: v => <span className={`badge ${v === 'Makkah' ? 'badge-gold' : 'badge-active'}`}>{v}</span> },
        { key: 'duration', label: 'Duration' },
        { key: 'transportIncluded', label: 'Transport', render: v => v ? '✅ Yes' : '❌ No' },
        { key: 'ratePerPersonSAR', label: 'Per Person', render: (v, row) => v ? <CurrencyDisplay sar={v} pkr={row.ratePerPersonPKR} /> : '—' },
        { key: 'ratePerGroupSAR', label: 'Per Group', render: (v, row) => v ? <CurrencyDisplay sar={v} pkr={row.ratePerGroupPKR} /> : '—' },
        { key: 'isActive', label: 'Status', render: v => <StatusBadge active={v} /> },
    ];

    const handleAdd = () => { setForm(emptyForm); setEditId(null); setModal(true); };
    const handleEdit = (row) => { setForm({ ...emptyForm, ...row }); setEditId(row._id); setModal(true); };
    const handleDelete = async (row) => {
        if (!confirm(`Deactivate "${row.name}"?`)) return;
        try { await api.delete(`/ziyarats/${row._id}`); toast.success('Deactivated'); fetchData(); }
        catch { toast.error('Failed'); }
    };

    const handleSubmit = async () => {
        if (!form.name) { toast.error('Name required'); return; }
        setSaving(true);
        try {
            if (editId) { await api.put(`/ziyarats/${editId}`, form); toast.success('Updated'); }
            else { await api.post('/ziyarats', form); toast.success('Created'); }
            setModal(false); fetchData();
        } catch (err) { toast.error(err.response?.data?.message || 'Error'); }
        finally { setSaving(false); }
    };

    const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

    return (
        <div>
            <DataTable columns={columns} data={data} loading={loading}
                onAdd={handleAdd} onEdit={handleEdit} onDelete={handleDelete}
                title="Ziyarats" addLabel="Add Ziyarat" />

            <FormModal isOpen={modal} onClose={() => setModal(false)}
                title={editId ? 'Edit Ziyarat' : 'Add Ziyarat'} onSubmit={handleSubmit} loading={saving}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><label className="label">Ziyarat Name *</label>
                        <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Makkah City Ziyarat" /></div>
                    <div><label className="label">Location</label>
                        <select className="select" value={form.location} onChange={e => set('location', e.target.value)}>
                            <option>Makkah</option><option>Madinah</option><option>Other</option>
                        </select></div>
                    <div><label className="label">Duration</label>
                        <input className="input" value={form.duration} onChange={e => set('duration', e.target.value)} placeholder="e.g. 4 hours" /></div>
                    <div className="flex items-center gap-3 pt-6">
                        <input type="checkbox" id="transport" checked={form.transportIncluded} onChange={e => set('transportIncluded', e.target.checked)} className="w-4 h-4" />
                        <label htmlFor="transport" className="text-sm font-medium">Transport Included</label>
                    </div>
                    <div><label className="label">Rate Per Person (SAR)</label>
                        <input className="input" type="number" value={form.ratePerPersonSAR} onChange={e => set('ratePerPersonSAR', e.target.value)} />
                        {form.ratePerPersonSAR && <p className="text-xs text-green-700 mt-1">≈ {formatPKR(convertToPKR(form.ratePerPersonSAR))}</p>}
                    </div>
                    <div><label className="label">Rate Per Group (SAR)</label>
                        <input className="input" type="number" value={form.ratePerGroupSAR} onChange={e => set('ratePerGroupSAR', e.target.value)} />
                        {form.ratePerGroupSAR && <p className="text-xs text-green-700 mt-1">≈ {formatPKR(convertToPKR(form.ratePerGroupSAR))}</p>}
                    </div>
                </div>
                <div><label className="label">Description</label>
                    <textarea className="input" rows={3} value={form.description} onChange={e => set('description', e.target.value)} /></div>
            </FormModal>
        </div>
    );
}
