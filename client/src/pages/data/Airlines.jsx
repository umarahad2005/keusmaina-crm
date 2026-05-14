import { useState, useEffect } from 'react';
import api from '../../utils/api';
import { useCurrency } from '../../context/CurrencyContext';
import DataTable from '../../components/DataTable';
import FormModal from '../../components/FormModal';
import StatusBadge from '../../components/StatusBadge';
import CurrencyDisplay from '../../components/CurrencyDisplay';
import toast from 'react-hot-toast';

const emptyForm = {
    name: '', flightNumber: '', departureCity: '', departureAirportCode: '',
    arrivalCity: '', arrivalAirportCode: '',
    departureDateTime: '', arrivalDateTime: '', returnDateTime: '',
    seatClass: 'Economy', ticketPriceSAR: '',
    totalSeats: 0, soldSeats: 0,
    baggageAllowance: 23, transitDetails: '', notes: ''
};

const isoDateTime = (v) => v ? String(v).slice(0, 16) : '';

export default function Airlines() {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [editId, setEditId] = useState(null);
    const [saving, setSaving] = useState(false);
    const { convertToPKR, formatPKR } = useCurrency();

    const fetchData = async () => {
        try {
            setLoading(true);
            const res = await api.get('/airlines');
            setData(res.data.data);
        } catch (err) { toast.error('Failed to load airlines'); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchData(); }, []);

    const fmtDate = (v) => v ? new Date(v).toLocaleString('en-PK', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

    const columns = [
        { key: 'name', label: 'Airline' },
        { key: 'flightNumber', label: 'Flight #' },
        { key: 'departureCity', label: 'From' },
        { key: 'arrivalCity', label: 'To' },
        { key: 'departureDateTime', label: 'Departure', render: v => fmtDate(v) },
        { key: 'returnDateTime', label: 'Return', render: v => fmtDate(v) },
        { key: 'seatClass', label: 'Class', render: v => <span className="badge-navy">{v}</span> },
        { key: 'ticketPriceSAR', label: 'Price', render: v => <CurrencyDisplay sar={v} /> },
        { key: 'totalSeats', label: 'Seats', render: (v, row) => v ? `${(row.soldSeats || 0)}/${v}` : '—' },
        { key: 'isActive', label: 'Status', render: v => <StatusBadge active={v} /> },
    ];

    const handleAdd = () => { setForm(emptyForm); setEditId(null); setModal(true); };
    const handleEdit = (row) => {
        setForm({
            ...emptyForm,
            ...row,
            departureDateTime: isoDateTime(row.departureDateTime),
            arrivalDateTime: isoDateTime(row.arrivalDateTime),
            returnDateTime: isoDateTime(row.returnDateTime)
        });
        setEditId(row._id);
        setModal(true);
    };
    const handleDelete = async (row) => {
        if (!confirm(`Deactivate airline "${row.name}"?`)) return;
        try { await api.delete(`/airlines/${row._id}`); toast.success('Airline deactivated'); fetchData(); }
        catch { toast.error('Failed to delete'); }
    };

    const handleSubmit = async () => {
        if (!form.name || !form.ticketPriceSAR) { toast.error('Name and price are required'); return; }
        if (form.totalSeats && Number(form.soldSeats) > Number(form.totalSeats)) {
            toast.error('Sold seats cannot exceed total seats'); return;
        }
        setSaving(true);
        try {
            if (editId) {
                await api.put(`/airlines/${editId}`, form);
                toast.success('Airline updated');
            } else {
                await api.post('/airlines', form);
                toast.success('Airline created');
            }
            setModal(false); fetchData();
        } catch (err) { toast.error(err.response?.data?.message || 'Error saving'); }
        finally { setSaving(false); }
    };

    const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

    const seatsRemaining = Math.max(0, (Number(form.totalSeats) || 0) - (Number(form.soldSeats) || 0));

    return (
        <div>
            <DataTable columns={columns} data={data} loading={loading}
                onAdd={handleAdd} onEdit={handleEdit} onDelete={handleDelete}
                title="Airlines" addLabel="Add Flight" />

            <FormModal isOpen={modal} onClose={() => setModal(false)}
                title={editId ? 'Edit Flight' : 'Add Flight'}
                onSubmit={handleSubmit} loading={saving}>
                <p className="text-xs text-gray-500 mb-3">Each row is one specific departure. Add a separate row for each date you sell.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="label">Airline Name *</label>
                        <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. PIA, Saudi Airlines" />
                    </div>
                    <div>
                        <label className="label">Flight Number</label>
                        <input className="input" value={form.flightNumber} onChange={e => set('flightNumber', e.target.value)} placeholder="e.g. PK-741" />
                    </div>
                    <div>
                        <label className="label">Departure City</label>
                        <input className="input" value={form.departureCity} onChange={e => set('departureCity', e.target.value)} placeholder="e.g. Lahore" />
                    </div>
                    <div>
                        <label className="label">Departure Code</label>
                        <input className="input" value={form.departureAirportCode} onChange={e => set('departureAirportCode', e.target.value)} placeholder="LHE" />
                    </div>
                    <div>
                        <label className="label">Arrival City</label>
                        <input className="input" value={form.arrivalCity} onChange={e => set('arrivalCity', e.target.value)} placeholder="e.g. Jeddah" />
                    </div>
                    <div>
                        <label className="label">Arrival Code</label>
                        <input className="input" value={form.arrivalAirportCode} onChange={e => set('arrivalAirportCode', e.target.value)} placeholder="JED" />
                    </div>
                    <div>
                        <label className="label">Departure Date & Time *</label>
                        <input className="input" type="datetime-local" value={form.departureDateTime} onChange={e => set('departureDateTime', e.target.value)} />
                    </div>
                    <div>
                        <label className="label">Arrival Date & Time</label>
                        <input className="input" type="datetime-local" value={form.arrivalDateTime} onChange={e => set('arrivalDateTime', e.target.value)} />
                    </div>
                    <div>
                        <label className="label">Return Date & Time</label>
                        <input className="input" type="datetime-local" value={form.returnDateTime} onChange={e => set('returnDateTime', e.target.value)} />
                        <p className="text-[10px] text-gray-500 mt-1">Used by package wizard to match dates</p>
                    </div>
                    <div>
                        <label className="label">Seat Class</label>
                        <select className="select" value={form.seatClass} onChange={e => set('seatClass', e.target.value)}>
                            <option>Economy</option><option>Business</option><option>First</option>
                        </select>
                    </div>
                    <div>
                        <label className="label">Ticket Price (SAR) *</label>
                        <input className="input" type="number" value={form.ticketPriceSAR} onChange={e => set('ticketPriceSAR', e.target.value)} placeholder="0" />
                        {form.ticketPriceSAR && <p className="text-xs text-green-700 mt-1">≈ {formatPKR(convertToPKR(form.ticketPriceSAR))}</p>}
                    </div>
                    <div>
                        <label className="label">Baggage (kg)</label>
                        <input className="input" type="number" value={form.baggageAllowance} onChange={e => set('baggageAllowance', e.target.value)} />
                    </div>
                    <div>
                        <label className="label">Total Seats</label>
                        <input className="input" type="number" min="0" value={form.totalSeats} onChange={e => set('totalSeats', e.target.value)} placeholder="e.g. 40 (block of seats you bought)" />
                    </div>
                    <div>
                        <label className="label">Sold Seats</label>
                        <input className="input" type="number" min="0" value={form.soldSeats} onChange={e => set('soldSeats', e.target.value)} />
                        {form.totalSeats > 0 && <p className="text-xs text-gray-600 mt-1">Remaining: <strong>{seatsRemaining}</strong> of {form.totalSeats}</p>}
                    </div>
                    <div>
                        <label className="label">Transit Details</label>
                        <input className="input" value={form.transitDetails} onChange={e => set('transitDetails', e.target.value)} placeholder="Direct / via Dubai..." />
                    </div>
                </div>
                <div>
                    <label className="label">Notes</label>
                    <textarea className="input" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
                </div>
            </FormModal>
        </div>
    );
}
