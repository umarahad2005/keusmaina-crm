import { useState, useEffect } from 'react';
import api from '../../utils/api';
import { useCurrency } from '../../context/CurrencyContext';
import DataTable from '../../components/DataTable';
import FormModal from '../../components/FormModal';
import StatusBadge from '../../components/StatusBadge';
import toast from 'react-hot-toast';
import { MdAdd, MdDelete } from 'react-icons/md';

const emptyRate = () => ({ label: 'Standard', validFrom: '', validTo: '', rateSAR: '' });
const emptyRoom = () => ({ typeName: '', maxOccupancy: 4, mealPlan: 'Bed Only', rates: [emptyRate()] });
const emptyForm = () => ({
    name: '', starRating: 3, distanceFromHaram: '',
    roomTypes: [emptyRoom()],
    totalRooms: '', checkInPolicy: '', checkOutPolicy: '', notes: ''
});

const isoDate = (v) => v ? String(v).slice(0, 10) : '';

const normalizeRoom = (rt) => ({
    ...emptyRoom(),
    ...rt,
    rates: Array.isArray(rt.rates) && rt.rates.length
        ? rt.rates.map(r => ({ ...emptyRate(), ...r, validFrom: isoDate(r.validFrom), validTo: isoDate(r.validTo) }))
        : [emptyRate()]
});

export default function HotelsMakkah() {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(false);
    const [form, setForm] = useState(emptyForm());
    const [editId, setEditId] = useState(null);
    const [saving, setSaving] = useState(false);
    const { formatSAR } = useCurrency();

    const fetchData = async () => {
        try { setLoading(true); const res = await api.get('/hotels-makkah'); setData(res.data.data); }
        catch { toast.error('Failed to load hotels'); } finally { setLoading(false); }
    };
    useEffect(() => { fetchData(); }, []);

    const columns = [
        { key: 'name', label: 'Hotel Name' },
        { key: 'starRating', label: 'Stars', render: v => '⭐'.repeat(v) },
        { key: 'distanceFromHaram', label: 'Distance' },
        { key: 'roomTypes', label: 'Rooms / Rates', render: v => `${v?.length || 0} rooms · ${(v || []).reduce((n, rt) => n + (rt.rates?.length || 0), 0)} rates` },
        { key: 'totalRooms', label: 'Total' },
        { key: 'isActive', label: 'Status', render: v => <StatusBadge active={v} /> },
    ];

    const handleAdd = () => { setForm(emptyForm()); setEditId(null); setModal(true); };
    const handleEdit = (row) => {
        setForm({
            ...emptyForm(),
            ...row,
            roomTypes: Array.isArray(row.roomTypes) && row.roomTypes.length
                ? row.roomTypes.map(normalizeRoom)
                : [emptyRoom()]
        });
        setEditId(row._id);
        setModal(true);
    };
    const handleDelete = async (row) => {
        if (!confirm(`Deactivate "${row.name}"?`)) return;
        try { await api.delete(`/hotels-makkah/${row._id}`); toast.success('Hotel deactivated'); fetchData(); }
        catch { toast.error('Failed'); }
    };

    const validate = () => {
        if (!form.name) return 'Hotel name is required';
        for (const rt of form.roomTypes) {
            if (!rt.typeName) return 'Each room type needs a name';
            if (!rt.rates?.length) return `Room "${rt.typeName}" needs at least one rate period`;
            for (const r of rt.rates) {
                if (!r.validFrom || !r.validTo) return `Room "${rt.typeName}" — every rate needs From & To dates`;
                if (new Date(r.validFrom) > new Date(r.validTo)) return `Room "${rt.typeName}" — "From" must be before "To"`;
                if (r.rateSAR === '' || r.rateSAR === null || isNaN(Number(r.rateSAR))) return `Room "${rt.typeName}" — rate (SAR) is required`;
            }
        }
        return null;
    };

    const handleSubmit = async () => {
        const err = validate();
        if (err) { toast.error(err); return; }
        setSaving(true);
        try {
            if (editId) { await api.put(`/hotels-makkah/${editId}`, form); toast.success('Updated'); }
            else { await api.post('/hotels-makkah', form); toast.success('Created'); }
            setModal(false); fetchData();
        } catch (e) { toast.error(e.response?.data?.message || 'Error'); }
        finally { setSaving(false); }
    };

    const set = (key, val) => setForm(f => ({ ...f, [key]: val }));
    const setRoom = (i, key, val) => {
        const rooms = [...form.roomTypes];
        rooms[i] = { ...rooms[i], [key]: val };
        set('roomTypes', rooms);
    };
    const setRate = (ri, idx, key, val) => {
        const rooms = [...form.roomTypes];
        const rates = [...rooms[ri].rates];
        rates[idx] = { ...rates[idx], [key]: val };
        rooms[ri] = { ...rooms[ri], rates };
        set('roomTypes', rooms);
    };
    const addRoom = () => set('roomTypes', [...form.roomTypes, emptyRoom()]);
    const removeRoom = (i) => set('roomTypes', form.roomTypes.filter((_, idx) => idx !== i));
    const addRate = (ri) => {
        const rooms = [...form.roomTypes];
        rooms[ri] = { ...rooms[ri], rates: [...rooms[ri].rates, emptyRate()] };
        set('roomTypes', rooms);
    };
    const removeRate = (ri, idx) => {
        const rooms = [...form.roomTypes];
        rooms[ri] = { ...rooms[ri], rates: rooms[ri].rates.filter((_, i) => i !== idx) };
        set('roomTypes', rooms);
    };

    return (
        <div>
            <DataTable columns={columns} data={data} loading={loading}
                onAdd={handleAdd} onEdit={handleEdit} onDelete={handleDelete}
                title="Hotels — Makkah" addLabel="Add Hotel" />

            <FormModal isOpen={modal} onClose={() => setModal(false)}
                title={editId ? 'Edit Hotel' : 'Add Hotel (Makkah)'}
                onSubmit={handleSubmit} loading={saving}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><label className="label">Hotel Name *</label>
                        <input className="input" value={form.name} onChange={e => set('name', e.target.value)} /></div>
                    <div><label className="label">Star Rating</label>
                        <select className="select" value={form.starRating} onChange={e => set('starRating', Number(e.target.value))}>
                            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} Star{'⭐'.repeat(n)}</option>)}
                        </select></div>
                    <div><label className="label">Distance from Haram</label>
                        <input className="input" value={form.distanceFromHaram} onChange={e => set('distanceFromHaram', e.target.value)} placeholder="e.g. 200m / 5 min" /></div>
                    <div><label className="label">Total Rooms</label>
                        <input className="input" type="number" value={form.totalRooms} onChange={e => set('totalRooms', e.target.value)} /></div>
                    <div><label className="label">Check-in Policy</label>
                        <input className="input" value={form.checkInPolicy} onChange={e => set('checkInPolicy', e.target.value)} /></div>
                    <div><label className="label">Check-out Policy</label>
                        <input className="input" value={form.checkOutPolicy} onChange={e => set('checkOutPolicy', e.target.value)} /></div>
                </div>

                {/* Room Types */}
                <div className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                        <label className="label mb-0">Room Types & Seasonal Rates</label>
                        <button type="button" onClick={addRoom} className="btn-sm btn-outline flex items-center gap-1"><MdAdd size={14} /> Add Room Type</button>
                    </div>

                    {form.roomTypes.map((rt, ri) => (
                        <div key={ri} className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-3">
                                <input className="input text-sm" value={rt.typeName} onChange={e => setRoom(ri, 'typeName', e.target.value)} placeholder="Type name (e.g. Quad, Triple, Double)" />
                                <input className="input text-sm" type="number" value={rt.maxOccupancy} onChange={e => setRoom(ri, 'maxOccupancy', Number(e.target.value) || 1)} placeholder="Max occupancy" />
                                <select className="select text-sm" value={rt.mealPlan} onChange={e => setRoom(ri, 'mealPlan', e.target.value)}>
                                    <option>Bed Only</option><option>Breakfast</option><option>Half Board</option><option>Full Board</option>
                                </select>
                                <button type="button" onClick={() => removeRoom(ri)} disabled={form.roomTypes.length === 1}
                                    className="btn-icon text-red-500 hover:bg-red-50 disabled:opacity-30 self-center justify-self-end"
                                    title="Remove room type"><MdDelete size={16} /></button>
                            </div>

                            <div className="ml-1">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-semibold text-gray-600 uppercase">Rate Periods</span>
                                    <button type="button" onClick={() => addRate(ri)} className="btn-sm btn-outline flex items-center gap-1 text-xs"><MdAdd size={12} /> Add Period</button>
                                </div>
                                {rt.rates.map((r, idx) => (
                                    <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 mb-2 items-end">
                                        <div className="sm:col-span-3">
                                            <label className="label text-[10px]">Label</label>
                                            <input className="input text-sm" value={r.label} onChange={e => setRate(ri, idx, 'label', e.target.value)} placeholder="e.g. Off-Peak / Ramadan" />
                                        </div>
                                        <div className="sm:col-span-3">
                                            <label className="label text-[10px]">Valid From *</label>
                                            <input className="input text-sm" type="date" value={r.validFrom} onChange={e => setRate(ri, idx, 'validFrom', e.target.value)} />
                                        </div>
                                        <div className="sm:col-span-3">
                                            <label className="label text-[10px]">Valid To *</label>
                                            <input className="input text-sm" type="date" value={r.validTo} onChange={e => setRate(ri, idx, 'validTo', e.target.value)} />
                                        </div>
                                        <div className="sm:col-span-2">
                                            <label className="label text-[10px]">Rate (SAR/night) *</label>
                                            <input className="input text-sm" type="number" min="0" value={r.rateSAR} onChange={e => setRate(ri, idx, 'rateSAR', e.target.value)} placeholder="0" />
                                        </div>
                                        <div className="sm:col-span-1">
                                            <button type="button" onClick={() => removeRate(ri, idx)} disabled={rt.rates.length === 1}
                                                className="btn-icon text-red-500 hover:bg-red-50 disabled:opacity-30"
                                                title="Remove period"><MdDelete size={14} /></button>
                                        </div>
                                    </div>
                                ))}
                                {rt.rates.length > 0 && (
                                    <p className="text-[11px] text-gray-500 mt-1">
                                        Lowest: {formatSAR(Math.min(...rt.rates.map(x => Number(x.rateSAR) || 0)))} ·
                                        Highest: {formatSAR(Math.max(...rt.rates.map(x => Number(x.rateSAR) || 0)))}
                                    </p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                <div><label className="label">Notes</label>
                    <textarea className="input" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
            </FormModal>
        </div>
    );
}
