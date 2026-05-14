import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../utils/api';
import { useCurrency } from '../../context/CurrencyContext';
import toast from 'react-hot-toast';
import { MdArrowBack, MdSave, MdSearch } from 'react-icons/md';

const isoDate = (v) => v ? String(v).slice(0, 10) : '';

const empty = () => ({
    name: '', season: '', status: 'planning', capacity: 0,
    travelDates: { departure: '', returnDate: '' },
    components: {
        airline: '',
        makkahHotel: { hotel: '', roomType: '', nights: 0 },
        madinahHotel: { hotel: '', roomType: '', nights: 0 },
        ziyarats: [],
        transportation: []
    },
    notes: ''
});

const idOf = (v) => (v && typeof v === 'object' ? v._id : v) || '';
const arrIds = (a) => Array.isArray(a) ? a.map(idOf).filter(Boolean) : [];

function depToForm(d) {
    return {
        name: d.name || '',
        season: d.season || '',
        status: d.status || 'planning',
        capacity: d.capacity || 0,
        travelDates: {
            departure: isoDate(d.travelDates?.departure),
            returnDate: isoDate(d.travelDates?.returnDate)
        },
        components: {
            airline: idOf(d.components?.airline),
            makkahHotel: {
                hotel: idOf(d.components?.makkahHotel?.hotel),
                roomType: d.components?.makkahHotel?.roomType || '',
                nights: d.components?.makkahHotel?.nights || 0
            },
            madinahHotel: {
                hotel: idOf(d.components?.madinahHotel?.hotel),
                roomType: d.components?.madinahHotel?.roomType || '',
                nights: d.components?.madinahHotel?.nights || 0
            },
            ziyarats: arrIds(d.components?.ziyarats),
            transportation: arrIds(d.components?.transportation)
        },
        notes: d.notes || ''
    };
}

export default function DepartureForm() {
    const { id } = useParams();
    const isEdit = !!id;
    const nav = useNavigate();
    const { formatSAR } = useCurrency();

    const [form, setForm] = useState(empty());
    const [airlines, setAirlines] = useState([]);
    const [hotelsMakkah, setHotelsMakkah] = useState([]);
    const [hotelsMadinah, setHotelsMadinah] = useState([]);
    const [ziyarats, setZiyarats] = useState([]);
    const [transports, setTransports] = useState([]);

    const [airlineSearch, setAirlineSearch] = useState('');
    const [makkahSearch, setMakkahSearch] = useState('');
    const [madinahSearch, setMadinahSearch] = useState('');

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const [a, hm, hd, z, t] = await Promise.all([
                    api.get('/airlines'), api.get('/hotels-makkah'), api.get('/hotels-madinah'),
                    api.get('/ziyarats'), api.get('/transport')
                ]);
                setAirlines(a.data.data); setHotelsMakkah(hm.data.data); setHotelsMadinah(hd.data.data);
                setZiyarats(z.data.data); setTransports(t.data.data);
                if (isEdit) {
                    const d = await api.get(`/departures/${id}`);
                    setForm(depToForm(d.data.data));
                }
            } catch { toast.error('Failed to load form data'); nav('/departures'); }
            finally { setLoading(false); }
        })();
        // eslint-disable-next-line
    }, [id]);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const setTD = (k, v) => setForm(f => ({ ...f, travelDates: { ...f.travelDates, [k]: v } }));
    const setComp = (k, v) => setForm(f => ({ ...f, components: { ...f.components, [k]: v } }));
    const setMakkah = (k, v) => setForm(f => ({ ...f, components: { ...f.components, makkahHotel: { ...f.components.makkahHotel, [k]: v } } }));
    const setMadinah = (k, v) => setForm(f => ({ ...f, components: { ...f.components, madinahHotel: { ...f.components.madinahHotel, [k]: v } } }));
    const toggle = (arr, x) => arr.includes(x) ? arr.filter(y => y !== x) : [...arr, x];

    const filteredAirlines = useMemo(() => {
        const s = airlineSearch.trim().toLowerCase();
        const dep = form.travelDates.departure;
        const ret = form.travelDates.returnDate;
        return airlines.filter(a => {
            if (!a.isActive) return false;
            if (s && !`${a.name} ${a.flightNumber || ''} ${a.departureCity || ''} ${a.arrivalCity || ''}`.toLowerCase().includes(s)) return false;
            if (dep && a.departureDateTime) {
                const t = new Date(a.departureDateTime).getTime();
                const from = new Date(dep).getTime();
                const to = ret ? new Date(ret).getTime() : from + 60 * 86400000;
                if (t < from || t > to) return false;
            }
            return true;
        });
    }, [airlines, airlineSearch, form.travelDates]);

    const filteredMakkah = useMemo(() => {
        const s = makkahSearch.trim().toLowerCase();
        return hotelsMakkah.filter(h => h.isActive && (!s || h.name.toLowerCase().includes(s)));
    }, [hotelsMakkah, makkahSearch]);

    const filteredMadinah = useMemo(() => {
        const s = madinahSearch.trim().toLowerCase();
        return hotelsMadinah.filter(h => h.isActive && (!s || h.name.toLowerCase().includes(s)));
    }, [hotelsMadinah, madinahSearch]);

    const selMakkah = hotelsMakkah.find(h => h._id === form.components.makkahHotel.hotel);
    const selMadinah = hotelsMadinah.find(h => h._id === form.components.madinahHotel.hotel);

    const save = async () => {
        if (!form.name) { toast.error('Name is required'); return; }
        if (!form.travelDates.departure) { toast.error('Departure date is required'); return; }
        setSaving(true);
        try {
            if (isEdit) await api.put(`/departures/${id}`, form);
            else await api.post('/departures', form);
            toast.success(isEdit ? 'Departure updated' : 'Departure created');
            nav('/departures');
        } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
        finally { setSaving(false); }
    };

    if (loading) return <div className="flex items-center justify-center py-20"><div className="w-10 h-10 border-4 border-navy-800 border-t-gold-500 rounded-full animate-spin" /></div>;

    return (
        <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-4">
                <button onClick={() => nav('/departures')} className="btn-ghost flex items-center gap-1"><MdArrowBack size={16} /> Departures</button>
                <h1 className="text-lg font-heading font-bold text-navy-800">{isEdit ? 'Edit Departure' : 'New Departure Batch'}</h1>
                <button onClick={save} disabled={saving} className="btn-gold flex items-center gap-1"><MdSave size={16} /> {saving ? 'Saving...' : 'Save'}</button>
            </div>

            <div className="card mb-4">
                <div className="card-body grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2"><label className="label">Name *</label>
                        <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Ramadan Batch 1 — March 5, 2026" /></div>
                    <div><label className="label">Season</label>
                        <input className="input" value={form.season} onChange={e => set('season', e.target.value)} placeholder="e.g. Ramadan 2026" /></div>
                    <div><label className="label">Status</label>
                        <select className="select" value={form.status} onChange={e => set('status', e.target.value)}>
                            <option value="planning">Planning</option>
                            <option value="open">Open for Booking</option>
                            <option value="closed">Closed</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                        </select></div>
                    <div><label className="label">Departure Date *</label>
                        <input className="input" type="date" value={form.travelDates.departure} onChange={e => setTD('departure', e.target.value)} /></div>
                    <div><label className="label">Return Date</label>
                        <input className="input" type="date" value={form.travelDates.returnDate} onChange={e => setTD('returnDate', e.target.value)} /></div>
                    <div><label className="label">Capacity (pilgrims)</label>
                        <input className="input" type="number" min="0" value={form.capacity} onChange={e => set('capacity', parseInt(e.target.value) || 0)} placeholder="e.g. 50" />
                        <p className="text-[10px] text-gray-500 mt-1">Total pilgrims you can sell on this batch</p></div>
                </div>
            </div>

            {/* Airline */}
            <div className="card mb-4">
                <div className="card-body">
                    <h3 className="text-sm font-bold text-navy-800 mb-2">✈️ Flight</h3>
                    <div className="relative mb-2">
                        <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input value={airlineSearch} onChange={e => setAirlineSearch(e.target.value)} className="search-input w-full" placeholder="Search flights..." />
                    </div>
                    {filteredAirlines.length === 0 ? (
                        <p className="text-sm text-gray-400">No flights match. Try widening dates.</p>
                    ) : (
                        <div className="space-y-1 max-h-56 overflow-y-auto">
                            {filteredAirlines.map(a => (
                                <label key={a._id} className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer text-sm ${form.components.airline === a._id ? 'border-gold-500 bg-gold-50' : 'border-gray-200 hover:border-gray-300'}`}>
                                    <input type="radio" name="airline" checked={form.components.airline === a._id} onChange={() => setComp('airline', a._id)} />
                                    <div className="flex-1">
                                        <p className="font-semibold">{a.name} <span className="text-gray-400">{a.flightNumber}</span></p>
                                        <p className="text-xs text-gray-500">{a.departureCity} → {a.arrivalCity} · {formatSAR(a.ticketPriceSAR)} · {a.departureDateTime ? new Date(a.departureDateTime).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : 'no date'}</p>
                                    </div>
                                </label>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Makkah */}
            <div className="card mb-4">
                <div className="card-body">
                    <h3 className="text-sm font-bold text-navy-800 mb-2">🕋 Makkah Hotel</h3>
                    <div className="relative mb-2">
                        <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input value={makkahSearch} onChange={e => setMakkahSearch(e.target.value)} className="search-input w-full" placeholder="Search hotels..." />
                    </div>
                    <div className="space-y-1 mb-2 max-h-48 overflow-y-auto">
                        {filteredMakkah.map(h => (
                            <label key={h._id} className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer text-sm ${form.components.makkahHotel.hotel === h._id ? 'border-gold-500 bg-gold-50' : 'border-gray-200 hover:border-gray-300'}`}>
                                <input type="radio" name="makkah" checked={form.components.makkahHotel.hotel === h._id} onChange={() => { setMakkah('hotel', h._id); setMakkah('roomType', ''); }} />
                                <div><p className="font-semibold">{h.name} {'⭐'.repeat(h.starRating)}</p><p className="text-xs text-gray-500">{h.distanceFromHaram}</p></div>
                            </label>
                        ))}
                    </div>
                    {selMakkah && (
                        <div className="grid grid-cols-2 gap-2 p-3 bg-gray-50 rounded-lg">
                            <div><label className="label text-xs">Room Type</label>
                                <select className="select text-sm" value={form.components.makkahHotel.roomType} onChange={e => setMakkah('roomType', e.target.value)}>
                                    <option value="">Select</option>
                                    {selMakkah.roomTypes?.map((r, i) => <option key={i} value={r.typeName}>{r.typeName} ({r.mealPlan}, max {r.maxOccupancy})</option>)}
                                </select></div>
                            <div><label className="label text-xs">Nights</label>
                                <input className="input text-sm" type="number" min="0" value={form.components.makkahHotel.nights} onChange={e => setMakkah('nights', parseInt(e.target.value) || 0)} /></div>
                        </div>
                    )}
                </div>
            </div>

            {/* Madinah */}
            <div className="card mb-4">
                <div className="card-body">
                    <h3 className="text-sm font-bold text-navy-800 mb-2">🕌 Madinah Hotel</h3>
                    <div className="relative mb-2">
                        <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input value={madinahSearch} onChange={e => setMadinahSearch(e.target.value)} className="search-input w-full" placeholder="Search hotels..." />
                    </div>
                    <div className="space-y-1 mb-2 max-h-48 overflow-y-auto">
                        {filteredMadinah.map(h => (
                            <label key={h._id} className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer text-sm ${form.components.madinahHotel.hotel === h._id ? 'border-gold-500 bg-gold-50' : 'border-gray-200 hover:border-gray-300'}`}>
                                <input type="radio" name="madinah" checked={form.components.madinahHotel.hotel === h._id} onChange={() => { setMadinah('hotel', h._id); setMadinah('roomType', ''); }} />
                                <div><p className="font-semibold">{h.name} {'⭐'.repeat(h.starRating)}</p><p className="text-xs text-gray-500">{h.distanceFromMasjidNabawi}</p></div>
                            </label>
                        ))}
                    </div>
                    {selMadinah && (
                        <div className="grid grid-cols-2 gap-2 p-3 bg-gray-50 rounded-lg">
                            <div><label className="label text-xs">Room Type</label>
                                <select className="select text-sm" value={form.components.madinahHotel.roomType} onChange={e => setMadinah('roomType', e.target.value)}>
                                    <option value="">Select</option>
                                    {selMadinah.roomTypes?.map((r, i) => <option key={i} value={r.typeName}>{r.typeName} ({r.mealPlan}, max {r.maxOccupancy})</option>)}
                                </select></div>
                            <div><label className="label text-xs">Nights</label>
                                <input className="input text-sm" type="number" min="0" value={form.components.madinahHotel.nights} onChange={e => setMadinah('nights', parseInt(e.target.value) || 0)} /></div>
                        </div>
                    )}
                </div>
            </div>

            {/* Ziyarats + Transport */}
            <div className="card mb-4">
                <div className="card-body grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <h3 className="text-sm font-bold text-navy-800 mb-2">🕌 Ziyarats</h3>
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                            {ziyarats.filter(z => z.isActive).map(z => (
                                <label key={z._id} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-sm ${form.components.ziyarats.includes(z._id) ? 'border-gold-500 bg-gold-50' : 'border-gray-200'}`}>
                                    <input type="checkbox" checked={form.components.ziyarats.includes(z._id)} onChange={() => setComp('ziyarats', toggle(form.components.ziyarats, z._id))} />
                                    <span>{z.name} <span className="text-xs text-gray-500">({z.location} · {formatSAR(z.ratePerPersonSAR)}/pax)</span></span>
                                </label>
                            ))}
                        </div>
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-navy-800 mb-2">🚌 Transport</h3>
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                            {transports.filter(t => t.isActive).map(t => (
                                <label key={t._id} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-sm ${form.components.transportation.includes(t._id) ? 'border-gold-500 bg-gold-50' : 'border-gray-200'}`}>
                                    <input type="checkbox" checked={form.components.transportation.includes(t._id)} onChange={() => setComp('transportation', toggle(form.components.transportation, t._id))} />
                                    <span>{t.typeName} <span className="text-xs text-gray-500">({t.route} · {formatSAR(t.ratePerPersonSAR)}/pax)</span></span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="card mb-4">
                <div className="card-body">
                    <label className="label">Notes</label>
                    <textarea className="input" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
                </div>
            </div>

            <div className="flex justify-end gap-2 mb-8">
                <button onClick={() => nav('/departures')} className="btn-ghost">Cancel</button>
                <button onClick={save} disabled={saving} className="btn-gold flex items-center gap-1"><MdSave size={16} /> {saving ? 'Saving...' : 'Save Departure'}</button>
            </div>
        </div>
    );
}
