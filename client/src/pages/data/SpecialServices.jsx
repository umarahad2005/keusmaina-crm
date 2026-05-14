import { useState, useEffect } from 'react';
import api from '../../utils/api';
import { useCurrency } from '../../context/CurrencyContext';
import DataTable from '../../components/DataTable';
import FormModal from '../../components/FormModal';
import StatusBadge from '../../components/StatusBadge';
import CurrencyDisplay from '../../components/CurrencyDisplay';
import toast from 'react-hot-toast';

const emptyForm = { name: '', rateSAR: '', pricingType: 'perPerson', description: '' };

export default function SpecialServices() {
    const [data, setData] = useState([]); const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(false); const [form, setForm] = useState(emptyForm);
    const [editId, setEditId] = useState(null); const [saving, setSaving] = useState(false);
    const { convertToPKR, formatPKR } = useCurrency();

    const fetchData = async () => {
        try { setLoading(true); const res = await api.get('/special-services'); setData(res.data.data); }
        catch { toast.error('Failed to load'); } finally { setLoading(false); }
    };
    useEffect(() => { fetchData(); }, []);

    const pricingLabels = { perPerson: 'Per Person', perGroup: 'Per Group', fixed: 'Fixed Price' };
    const columns = [
        { key: 'name', label: 'Service Name' },
        { key: 'rateSAR', label: 'Rate', render: (v, row) => <CurrencyDisplay sar={v} pkr={row.ratePKR} /> },
        { key: 'pricingType', label: 'Pricing', render: v => <span className="badge-navy">{pricingLabels[v] || v}</span> },
        { key: 'description', label: 'Description', render: v => v ? (v.length > 40 ? v.slice(0, 40) + '...' : v) : '—' },
        { key: 'isActive', label: 'Status', render: v => <StatusBadge active={v} /> },
    ];

    const handleAdd = () => { setForm(emptyForm); setEditId(null); setModal(true); };
    const handleEdit = (row) => { setForm({ ...emptyForm, ...row }); setEditId(row._id); setModal(true); };
    const handleDelete = async (row) => {
        if (!confirm(`Deactivate "${row.name}"?`)) return;
        try { await api.delete(`/special-services/${row._id}`); toast.success('Deactivated'); fetchData(); }
        catch { toast.error('Failed'); }
    };

    const handleSubmit = async () => {
        if (!form.name || !form.rateSAR) { toast.error('Name and rate required'); return; }
        setSaving(true);
        try {
            if (editId) { await api.put(`/special-services/${editId}`, form); toast.success('Updated'); }
            else { await api.post('/special-services', form); toast.success('Created'); }
            setModal(false); fetchData();
        } catch (err) { toast.error(err.response?.data?.message || 'Error'); }
        finally { setSaving(false); }
    };

    const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

    return (
        <div>
            <DataTable columns={columns} data={data} loading={loading}
                onAdd={handleAdd} onEdit={handleEdit} onDelete={handleDelete}
                title="Special Services" addLabel="Add Service" />

            <FormModal isOpen={modal} onClose={() => setModal(false)}
                title={editId ? 'Edit Service' : 'Add Service'} onSubmit={handleSubmit} loading={saving}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><label className="label">Service Name *</label>
                        <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Meet & Greet, VIP Lounge" /></div>
                    <div><label className="label">Pricing Type</label>
                        <select className="select" value={form.pricingType} onChange={e => set('pricingType', e.target.value)}>
                            <option value="perPerson">Per Person</option>
                            <option value="perGroup">Per Group</option>
                            <option value="fixed">Fixed Price</option>
                        </select></div>
                    <div className="sm:col-span-2"><label className="label">Rate (SAR) *</label>
                        <input className="input" type="number" value={form.rateSAR} onChange={e => set('rateSAR', e.target.value)} />
                        {form.rateSAR && <p className="text-xs text-green-700 mt-1">≈ {formatPKR(convertToPKR(form.rateSAR))}</p>}
                    </div>
                </div>
                <div><label className="label">Description</label>
                    <textarea className="input" rows={3} value={form.description} onChange={e => set('description', e.target.value)} /></div>
            </FormModal>
        </div>
    );
}
