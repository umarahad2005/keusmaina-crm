import { useState, useEffect } from 'react';
import api from '../../utils/api';
import { useCurrency } from '../../context/CurrencyContext';
import DataTable from '../../components/DataTable';
import FormModal from '../../components/FormModal';
import StatusBadge from '../../components/StatusBadge';
import CurrencyDisplay from '../../components/CurrencyDisplay';
import toast from 'react-hot-toast';

const emptyForm = { typeName: '', route: '', capacity: '', ratePerPersonSAR: '', ratePerVehicleSAR: '', vendor: '', notes: '' };

export default function Transport() {
    const [data, setData] = useState([]); const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(false); const [form, setForm] = useState(emptyForm);
    const [editId, setEditId] = useState(null); const [saving, setSaving] = useState(false);
    const { convertToPKR, formatPKR } = useCurrency();

    const fetchData = async () => {
        try { setLoading(true); const res = await api.get('/transport'); setData(res.data.data); }
        catch { toast.error('Failed to load'); } finally { setLoading(false); }
    };
    useEffect(() => { fetchData(); }, []);

    const columns = [
        { key: 'typeName', label: 'Type' },
        { key: 'route', label: 'Route' },
        { key: 'capacity', label: 'Seats' },
        { key: 'ratePerPersonSAR', label: 'Per Person', render: (v, row) => v ? <CurrencyDisplay sar={v} pkr={row.ratePerPersonPKR} /> : '—' },
        { key: 'ratePerVehicleSAR', label: 'Per Vehicle', render: (v, row) => v ? <CurrencyDisplay sar={v} pkr={row.ratePerVehiclePKR} /> : '—' },
        { key: 'vendor', label: 'Vendor' },
        { key: 'isActive', label: 'Status', render: v => <StatusBadge active={v} /> },
    ];

    const handleAdd = () => { setForm(emptyForm); setEditId(null); setModal(true); };
    const handleEdit = (row) => { setForm({ ...emptyForm, ...row }); setEditId(row._id); setModal(true); };
    const handleDelete = async (row) => {
        if (!confirm(`Deactivate "${row.typeName}"?`)) return;
        try { await api.delete(`/transport/${row._id}`); toast.success('Deactivated'); fetchData(); }
        catch { toast.error('Failed'); }
    };

    const handleSubmit = async () => {
        if (!form.typeName) { toast.error('Type name required'); return; }
        setSaving(true);
        try {
            if (editId) { await api.put(`/transport/${editId}`, form); toast.success('Updated'); }
            else { await api.post('/transport', form); toast.success('Created'); }
            setModal(false); fetchData();
        } catch (err) { toast.error(err.response?.data?.message || 'Error'); }
        finally { setSaving(false); }
    };

    const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

    return (
        <div>
            <DataTable columns={columns} data={data} loading={loading}
                onAdd={handleAdd} onEdit={handleEdit} onDelete={handleDelete}
                title="Transportation" addLabel="Add Transport" />

            <FormModal isOpen={modal} onClose={() => setModal(false)}
                title={editId ? 'Edit Transport' : 'Add Transport'} onSubmit={handleSubmit} loading={saving}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><label className="label">Transport Type *</label>
                        <input className="input" value={form.typeName} onChange={e => set('typeName', e.target.value)} placeholder="e.g. Sharing Bus, Private Car" /></div>
                    <div><label className="label">Route</label>
                        <input className="input" value={form.route} onChange={e => set('route', e.target.value)} placeholder="e.g. Airport–Hotel" /></div>
                    <div><label className="label">Capacity (seats)</label>
                        <input className="input" type="number" value={form.capacity} onChange={e => set('capacity', e.target.value)} /></div>
                    <div><label className="label">Vendor</label>
                        <input className="input" value={form.vendor} onChange={e => set('vendor', e.target.value)} /></div>
                    <div><label className="label">Rate Per Person (SAR)</label>
                        <input className="input" type="number" value={form.ratePerPersonSAR} onChange={e => set('ratePerPersonSAR', e.target.value)} />
                        {form.ratePerPersonSAR && <p className="text-xs text-green-700 mt-1">≈ {formatPKR(convertToPKR(form.ratePerPersonSAR))}</p>}
                    </div>
                    <div><label className="label">Rate Per Vehicle (SAR)</label>
                        <input className="input" type="number" value={form.ratePerVehicleSAR} onChange={e => set('ratePerVehicleSAR', e.target.value)} />
                        {form.ratePerVehicleSAR && <p className="text-xs text-green-700 mt-1">≈ {formatPKR(convertToPKR(form.ratePerVehicleSAR))}</p>}
                    </div>
                </div>
                <div><label className="label">Notes</label>
                    <textarea className="input" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
            </FormModal>
        </div>
    );
}
