import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api from '../../utils/api';
import { useCurrency } from '../../context/CurrencyContext';
import toast from 'react-hot-toast';
import { MdArrowBack, MdArrowForward, MdCheck, MdFlight, MdHotel, MdMosque, MdDirectionsBus, MdStar, MdSearch, MdSave, MdGroups, MdAddCircleOutline } from 'react-icons/md';
import FormModal from '../../components/FormModal';

const FULL_STEPS = ['Basic Info', 'Airline', 'Makkah Hotel', 'Madinah Hotel', 'Ziyarats', 'Transport', 'Services', 'Pricing', 'Client & Save'];
// When part of a Departure, the airline/hotels/ziyarats/transport are inherited.
const BATCH_STEPS = ['Basic Info', 'Services', 'Pricing', 'Client & Save'];

const isoDate = (v) => v ? String(v).slice(0, 10) : '';

const emptyForm = () => ({
    packageName: '', packageType: 'Umrah', travelSeason: '', duration: '', numberOfPilgrims: 1,
    departure: '', // optional Departure batch link
    travelDates: { departure: '', returnDate: '' },
    components: {
        airline: '',
        makkahHotel: { hotel: '', roomType: '', nights: 0, ratePerNightSAR: 0 },
        madinahHotel: { hotel: '', roomType: '', nights: 0, ratePerNightSAR: 0 },
        ziyarats: [], transportation: [], specialServices: []
    },
    pricingSummary: { markupType: 'fixed', markupValue: 0 },
    clientType: 'B2C', client: '', status: 'draft'
});

// Pick rate period for a date — must mirror server logic
function pickRateForDate(rates, dateStr) {
    if (!Array.isArray(rates) || rates.length === 0) return null;
    if (dateStr) {
        const t = new Date(dateStr).getTime();
        const match = rates.find(r => {
            const from = r.validFrom ? new Date(r.validFrom).getTime() : -Infinity;
            const to = r.validTo ? new Date(r.validTo).getTime() : Infinity;
            return t >= from && t <= to;
        });
        if (match) return match;
    }
    return [...rates].sort((a, b) => (a.rateSAR || 0) - (b.rateSAR || 0))[0];
}

// Normalize a populated package back into form state (IDs only).
function packageToForm(pkg, mode) {
    const idOf = (v) => (v && typeof v === 'object' ? v._id : v) || '';
    const arrIds = (a) => Array.isArray(a) ? a.map(idOf).filter(Boolean) : [];
    return {
        packageName: mode === 'duplicate' ? `${pkg.packageName || ''} (copy)` : pkg.packageName || '',
        packageType: pkg.packageType || 'Umrah',
        travelSeason: pkg.travelSeason || '',
        duration: pkg.duration || '',
        numberOfPilgrims: pkg.numberOfPilgrims || 1,
        departure: idOf(pkg.departure),
        travelDates: {
            departure: isoDate(pkg.travelDates?.departure),
            returnDate: isoDate(pkg.travelDates?.returnDate)
        },
        components: {
            airline: idOf(pkg.components?.airline),
            makkahHotel: {
                hotel: idOf(pkg.components?.makkahHotel?.hotel),
                roomType: pkg.components?.makkahHotel?.roomType || '',
                nights: pkg.components?.makkahHotel?.nights || 0,
                ratePerNightSAR: pkg.components?.makkahHotel?.ratePerNightSAR || 0
            },
            madinahHotel: {
                hotel: idOf(pkg.components?.madinahHotel?.hotel),
                roomType: pkg.components?.madinahHotel?.roomType || '',
                nights: pkg.components?.madinahHotel?.nights || 0,
                ratePerNightSAR: pkg.components?.madinahHotel?.ratePerNightSAR || 0
            },
            ziyarats: arrIds(pkg.components?.ziyarats),
            transportation: arrIds(pkg.components?.transportation),
            specialServices: arrIds(pkg.components?.specialServices)
        },
        pricingSummary: {
            markupType: pkg.pricingSummary?.markupType || 'fixed',
            markupValue: pkg.pricingSummary?.markupValue || 0
        },
        clientType: pkg.clientType || 'B2C',
        client: idOf(pkg.client),
        status: mode === 'duplicate' ? 'draft' : (pkg.status || 'draft')
    };
}

function AvailabilityBar({ avail, need, window }) {
    if (!avail || avail.totalRooms === 0) {
        return (
            <div className="mb-3 p-3 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-600">
                <strong>{avail?.hotelName || 'Hotel'}</strong> — total room count not set. Add it under Hotels &gt; Total Rooms to enable availability tracking.
            </div>
        );
    }
    const insufficient = need > avail.roomsAvailable;
    return (
        <div className={`mb-3 p-3 rounded-lg border text-xs ${insufficient ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
            <div className="flex items-center justify-between gap-2">
                <span><strong>{avail.hotelName}</strong> — {avail.roomsBooked} of {avail.totalRooms} rooms already booked during {window?.from} → {window?.to}</span>
                <span className="font-bold">{avail.roomsAvailable} available</span>
            </div>
            {need > 0 && (
                <p className="mt-1">
                    This package needs <strong>{need} room{need === 1 ? '' : 's'}</strong>
                    {insufficient
                        ? <span> — ⚠ exceeds remaining inventory by {need - avail.roomsAvailable}.</span>
                        : <span> — fits within remaining inventory.</span>}
                </p>
            )}
        </div>
    );
}

export default function PackageWizard({ mode = 'new' }) {
    const nav = useNavigate();
    const params = useParams();
    const [searchParams] = useSearchParams();
    const { formatSAR, formatPKR } = useCurrency();
    const [step, setStep] = useState(0);
    const [saving, setSaving] = useState(false);
    const [bootstrapping, setBootstrapping] = useState(mode !== 'new');

    const editId = mode === 'edit' ? params.id : null;
    const sourceId = mode === 'duplicate' ? params.id : null;
    const presetDepartureId = mode === 'new' ? searchParams.get('departure') : null;

    // ── Auto-save draft (mode='new' only) ─────────────────────────────
    // Stored in localStorage so a half-completed wizard survives tab close.
    // Cleared when the package is persisted or the user explicitly discards.
    const DRAFT_KEY = 'pkg-wizard-draft-v1';
    const [draftLoaded, setDraftLoaded] = useState(false);
    const [draftNoticeShown, setDraftNoticeShown] = useState(false);

    // Inventory from Module 1
    const [airlines, setAirlines] = useState([]);
    const [hotelsMakkah, setHotelsMakkah] = useState([]);
    const [hotelsMadinah, setHotelsMadinah] = useState([]);
    const [ziyarats, setZiyarats] = useState([]);
    const [transports, setTransports] = useState([]);
    const [services, setServices] = useState([]);
    const [clientsB2C, setClientsB2C] = useState([]);
    const [clientsB2B, setClientsB2B] = useState([]);
    const [departures, setDepartures] = useState([]);

    const [form, setForm] = useState(emptyForm());
    const [pricing, setPricing] = useState(null);

    // The wizard collapses to 4 steps when the package is part of a Departure.
    const STEPS = form.departure ? BATCH_STEPS : FULL_STEPS;
    const selectedDeparture = departures.find(d => d._id === form.departure);

    // Search filters per step
    const [airlineSearch, setAirlineSearch] = useState('');
    const [makkahSearch, setMakkahSearch] = useState('');
    const [madinahSearch, setMadinahSearch] = useState('');

    // Live allotment data
    const [makkahAvail, setMakkahAvail] = useState(null);
    const [madinahAvail, setMadinahAvail] = useState(null);

    // Inline quick-add modals
    const [addAirlineOpen, setAddAirlineOpen] = useState(false);
    const [addMakkahOpen, setAddMakkahOpen] = useState(false);
    const [addMadinahOpen, setAddMadinahOpen] = useState(false);
    const [addClientOpen, setAddClientOpen] = useState(false);

    useEffect(() => {
        const load = async () => {
            try {
                const [a, hm, hd, z, t, s, cb, ca, dep] = await Promise.all([
                    api.get('/airlines'), api.get('/hotels-makkah'), api.get('/hotels-madinah'),
                    api.get('/ziyarats'), api.get('/transport'), api.get('/special-services'),
                    api.get('/clients/b2c'), api.get('/clients/b2b'),
                    api.get('/departures?status=open')
                ]);
                setAirlines(a.data.data); setHotelsMakkah(hm.data.data); setHotelsMadinah(hd.data.data);
                setZiyarats(z.data.data); setTransports(t.data.data); setServices(s.data.data);
                setClientsB2C(cb.data.data); setClientsB2B(ca.data.data);
                setDepartures(dep.data.data);

                // Edit / duplicate: pull existing package
                const id = editId || sourceId;
                if (id) {
                    try {
                        const pkgRes = await api.get(`/packages/${id}`);
                        setForm(packageToForm(pkgRes.data.data, mode));
                    } catch {
                        toast.error('Could not load package');
                        nav('/packages');
                        return;
                    }
                } else if (presetDepartureId) {
                    // Preset from "New Package in this Batch" link
                    setForm(f => ({ ...f, departure: presetDepartureId }));
                } else if (mode === 'new') {
                    // Try to restore an auto-saved draft from a previous session
                    try {
                        const raw = localStorage.getItem(DRAFT_KEY);
                        if (raw) {
                            const { savedAt, form: saved } = JSON.parse(raw);
                            const ageH = (Date.now() - savedAt) / 3600000;
                            // Only offer drafts younger than 7 days, and not the empty initial state
                            if (saved && saved.packageName && ageH < 168) {
                                if (window.confirm(`Restore your unsaved draft package "${saved.packageName}" from ${new Date(savedAt).toLocaleString('en-PK')}?`)) {
                                    setForm(saved);
                                    toast.success('Draft restored');
                                } else {
                                    localStorage.removeItem(DRAFT_KEY);
                                }
                            } else if (ageH >= 168) {
                                localStorage.removeItem(DRAFT_KEY);
                            }
                        }
                    } catch { /* ignore localStorage errors */ }
                }
            } catch { toast.error('Failed to load data'); }
            finally { setBootstrapping(false); setDraftLoaded(true); }
        };
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Persist form state to localStorage as the user fills it in (mode=new only)
    useEffect(() => {
        if (mode !== 'new' || !draftLoaded) return;
        // Don't bother saving an empty / pristine form
        if (!form.packageName && !form.client && !form.travelDates.departure) return;
        try {
            localStorage.setItem(DRAFT_KEY, JSON.stringify({ savedAt: Date.now(), form }));
            if (!draftNoticeShown) {
                setDraftNoticeShown(true);
                // Small subtle hint the first time auto-save kicks in
                toast.success('Draft auto-saved', { duration: 1500, icon: '💾' });
            }
        } catch { /* ignore localStorage quota errors */ }
    }, [form, mode, draftLoaded, draftNoticeShown]);

    const discardDraft = () => {
        try { localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
    };

    // When a departure gets selected, inherit travel dates if the package
    // doesn't already have its own.
    useEffect(() => {
        if (!selectedDeparture) return;
        if (form.travelDates.departure) return;
        setForm(f => ({
            ...f,
            travelDates: {
                departure: isoDate(selectedDeparture.travelDates?.departure),
                returnDate: isoDate(selectedDeparture.travelDates?.returnDate)
            }
        }));
        // eslint-disable-next-line
    }, [selectedDeparture?._id]);

    const set = (key, val) => setForm(f => ({ ...f, [key]: val }));
    const setComp = (key, val) => setForm(f => ({ ...f, components: { ...f.components, [key]: val } }));
    const setMakkah = (key, val) => setForm(f => ({ ...f, components: { ...f.components, makkahHotel: { ...f.components.makkahHotel, [key]: val } } }));
    const setMadinah = (key, val) => setForm(f => ({ ...f, components: { ...f.components, madinahHotel: { ...f.components.madinahHotel, [key]: val } } }));
    const toggleArray = (arr, id) => arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id];

    // ── Filters ──────────────────────────────────────
    const departure = form.travelDates.departure;
    const returnDate = form.travelDates.returnDate;

    // Airlines that depart within the package's travel window (if dates set)
    const filteredAirlines = useMemo(() => {
        const s = airlineSearch.trim().toLowerCase();
        return airlines.filter(a => {
            if (!a.isActive) return false;
            if (s) {
                const blob = `${a.name} ${a.flightNumber || ''} ${a.departureCity || ''} ${a.arrivalCity || ''}`.toLowerCase();
                if (!blob.includes(s)) return false;
            }
            if (departure && a.departureDateTime) {
                const dep = new Date(a.departureDateTime).getTime();
                const from = new Date(departure).getTime();
                const to = returnDate ? new Date(returnDate).getTime() : from + 60 * 24 * 3600 * 1000;
                if (dep < from || dep > to) return false;
            }
            return true;
        });
    }, [airlines, airlineSearch, departure, returnDate]);

    const filterHotels = (list, search) => {
        const s = search.trim().toLowerCase();
        return list.filter(h => h.isActive && (s ? h.name.toLowerCase().includes(s) : true));
    };
    const filteredMakkah = useMemo(() => filterHotels(hotelsMakkah, makkahSearch), [hotelsMakkah, makkahSearch]);
    const filteredMadinah = useMemo(() => filterHotels(hotelsMadinah, madinahSearch), [hotelsMadinah, madinahSearch]);

    const selectedMakkahHotel = hotelsMakkah.find(h => h._id === form.components.makkahHotel.hotel);
    const selectedMadinahHotel = hotelsMadinah.find(h => h._id === form.components.madinahHotel.hotel);

    const makkahRoom = selectedMakkahHotel?.roomTypes?.find(r => r.typeName === form.components.makkahHotel.roomType);
    const madinahRoom = selectedMadinahHotel?.roomTypes?.find(r => r.typeName === form.components.madinahHotel.roomType);
    const makkahActiveRate = pickRateForDate(makkahRoom?.rates, departure);
    const madinahActiveRate = pickRateForDate(madinahRoom?.rates, departure);

    // Keep ratePerNightSAR in sync with the active seasonal rate
    useEffect(() => {
        if (makkahActiveRate && Number(form.components.makkahHotel.ratePerNightSAR) !== Number(makkahActiveRate.rateSAR)) {
            setMakkah('ratePerNightSAR', Number(makkahActiveRate.rateSAR) || 0);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [makkahActiveRate?.rateSAR]);

    useEffect(() => {
        if (madinahActiveRate && Number(form.components.madinahHotel.ratePerNightSAR) !== Number(madinahActiveRate.rateSAR)) {
            setMadinah('ratePerNightSAR', Number(madinahActiveRate.rateSAR) || 0);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [madinahActiveRate?.rateSAR]);

    // Fetch hotel availability whenever the chosen hotel or travel dates change
    const availabilityWindow = useMemo(() => {
        if (!departure) return null;
        const from = departure;
        const to = returnDate || new Date(new Date(departure).getTime() + 30 * 86400000).toISOString().slice(0, 10);
        return { from, to };
    }, [departure, returnDate]);

    useEffect(() => {
        let cancelled = false;
        const fetchAvail = async (hotelId, hotelField, setter) => {
            if (!hotelId || !availabilityWindow) { setter(null); return; }
            try {
                const path = hotelField === 'makkahHotel' ? '/hotels-makkah' : '/hotels-madinah';
                const params = new URLSearchParams({ from: availabilityWindow.from, to: availabilityWindow.to });
                if (editId) params.set('excludePackageId', editId);
                const res = await api.get(`${path}/${hotelId}/availability?${params.toString()}`);
                if (!cancelled) setter(res.data.data);
            } catch { if (!cancelled) setter(null); }
        };
        fetchAvail(form.components.makkahHotel.hotel, 'makkahHotel', setMakkahAvail);
        fetchAvail(form.components.madinahHotel.hotel, 'madinahHotel', setMadinahAvail);
        return () => { cancelled = true; };
    }, [form.components.makkahHotel.hotel, form.components.madinahHotel.hotel, availabilityWindow, editId]);

    // Rooms this package needs from the chosen room types
    const makkahRoomsNeeded = makkahRoom ? Math.ceil((Number(form.numberOfPilgrims) || 1) / Math.max(1, Number(makkahRoom.maxOccupancy) || 1)) : 0;
    const madinahRoomsNeeded = madinahRoom ? Math.ceil((Number(form.numberOfPilgrims) || 1) / Math.max(1, Number(madinahRoom.maxOccupancy) || 1)) : 0;

    // Recalculate pricing on Pricing step
    useEffect(() => { if (STEPS[step] === 'Pricing') calculatePricing(); /* eslint-disable-next-line */ }, [step, STEPS]);

    // If departure mode toggles, the step set changes — reset to step 0 to keep things sane.
    useEffect(() => { setStep(0); }, [!!form.departure]);

    const calculatePricing = async () => {
        try {
            const res = await api.post('/packages/calculate-pricing', {
                departure: form.departure || undefined,
                components: form.components,
                numberOfPilgrims: form.numberOfPilgrims,
                markupType: form.pricingSummary.markupType,
                markupValue: form.pricingSummary.markupValue,
                travelDates: form.travelDates
            });
            setPricing(res.data.data);
        } catch { toast.error('Pricing calculation failed'); }
    };

    const buildPayload = (overrideStatus) => {
        const payload = { ...form };
        if (overrideStatus) payload.status = overrideStatus;
        if (!payload.departure) delete payload.departure;
        if (form.client) {
            payload.clientModel = form.clientType === 'B2C' ? 'ClientB2C' : 'ClientB2B';
        } else {
            delete payload.client;
            delete payload.clientModel;
        }
        return payload;
    };

    const persist = async (overrideStatus) => {
        if (!form.packageName) { toast.error('Package name is required'); return; }
        setSaving(true);
        try {
            const payload = buildPayload(overrideStatus);
            if (editId) {
                await api.put(`/packages/${editId}`, payload);
                toast.success('Package updated');
            } else {
                await api.post('/packages', payload);
                toast.success(overrideStatus === 'draft' ? 'Draft saved' : 'Package created');
            }
            // Successfully persisted → clear any auto-save draft
            if (mode === 'new') discardDraft();
            nav('/packages');
        } catch (err) { toast.error(err.response?.data?.message || 'Error saving'); }
        finally { setSaving(false); }
    };

    const handleSaveDraft = () => persist('draft');
    const handleSave = () => persist(form.status || 'confirmed');

    const headerLabel = mode === 'edit' ? 'Edit Package' : mode === 'duplicate' ? 'Duplicate Package' : 'New Package';

    if (bootstrapping) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="w-10 h-10 border-4 border-navy-800 border-t-gold-500 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <h1 className="text-lg font-heading font-bold text-navy-800">{headerLabel}</h1>
                <div className="flex items-center gap-2">
                    {mode === 'new' && draftNoticeShown && (
                        <button onClick={() => { if (confirm('Discard auto-saved draft? Form fields stay where they are; only the localStorage backup is cleared.')) { discardDraft(); setDraftNoticeShown(false); toast.success('Draft discarded'); } }}
                            className="text-xs text-red-500 hover:underline">
                            Discard auto-save
                        </button>
                    )}
                    <button onClick={handleSaveDraft} disabled={saving} className="btn-outline btn-sm flex items-center gap-1">
                        <MdSave size={14} /> Save as Draft
                    </button>
                </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-6">
                <div className="flex justify-between mb-2">
                    {STEPS.map((s, i) => (
                        <button key={i} onClick={() => setStep(i)} className={`text-[10px] sm:text-xs font-medium transition-colors ${i === step ? 'text-gold-600 font-bold' : i < step ? 'text-green-600' : 'text-gray-400'}`}>
                            {i < step ? '✓' : i + 1}
                        </button>
                    ))}
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-navy-800 to-gold-500 rounded-full transition-all duration-500" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
                </div>
                <p className="text-center text-sm font-semibold text-navy-800 mt-2">Step {step + 1}: {STEPS[step]}</p>
            </div>

            <div className="card">
                <div className="card-body">
                    {/* STEP: Basic Info */}
                    {STEPS[step] === 'Basic Info' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Standalone vs Batch toggle */}
                            <div className="sm:col-span-2 p-3 bg-navy-50/50 rounded-xl border border-navy-100">
                                <label className="label flex items-center gap-2"><MdGroups /> Booking Mode</label>
                                <div className="flex flex-wrap gap-2">
                                    <button type="button" onClick={() => set('departure', '')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${!form.departure ? 'bg-navy-800 text-white border-navy-800' : 'bg-white text-gray-600 border-gray-200'}`}>
                                        Standalone Package
                                    </button>
                                    <button type="button" onClick={() => { if (departures.length === 0) { toast.error('Create a Departure first under Departures'); return; } set('departure', departures[0]?._id || ''); }}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${form.departure ? 'bg-navy-800 text-white border-navy-800' : 'bg-white text-gray-600 border-gray-200'}`}>
                                        Part of a Departure Batch
                                    </button>
                                </div>
                                {form.departure && (
                                    <div className="mt-3">
                                        <label className="label text-xs">Pick the Group</label>
                                        <select className="select text-sm" value={form.departure} onChange={e => set('departure', e.target.value)}>
                                            {departures.map(d => {
                                                const cap = d.capacity || 0;
                                                const booked = d.rollup?.booked || 0;
                                                const remaining = cap ? Math.max(0, cap - booked) : null;
                                                const tag = cap ? ` · ${booked}/${cap}${remaining !== null ? ` (${remaining} left)` : ''}` : '';
                                                return (
                                                    <option key={d._id} value={d._id}>
                                                        {d.code} — {d.name} ({d.travelDates?.departure ? new Date(d.travelDates.departure).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' }) : ''}){tag}
                                                    </option>
                                                );
                                            })}
                                        </select>
                                        {selectedDeparture && (() => {
                                            const cap = selectedDeparture.capacity || 0;
                                            const booked = selectedDeparture.rollup?.booked || 0;
                                            const need = Number(form.numberOfPilgrims) || 0;
                                            // When editing, the package's own seats are already counted in `booked`, so don't double-count
                                            const need_after = need;
                                            const remaining = cap ? Math.max(0, cap - booked) : null;
                                            const wouldExceed = cap > 0 && (booked + need_after) > cap;
                                            const pct = cap > 0 ? Math.min(100, (booked / cap) * 100) : 0;
                                            const tone = wouldExceed ? 'bg-red-50 border-red-300 text-red-700' : pct >= 80 ? 'bg-orange-50 border-orange-300 text-orange-700' : 'bg-emerald-50 border-emerald-300 text-emerald-700';
                                            return (
                                                <div className={`mt-2 p-3 rounded-lg border ${tone}`}>
                                                    <div className="flex items-center justify-between text-xs font-semibold mb-2">
                                                        <span>📊 Group capacity</span>
                                                        <span>{cap ? `${booked} / ${cap} seats booked${remaining !== null ? ` · ${remaining} left` : ''}` : 'Capacity not set on this group'}</span>
                                                    </div>
                                                    {cap > 0 && (
                                                        <div className="h-2 bg-white/60 rounded-full overflow-hidden">
                                                            <div className="h-full transition-all" style={{ width: `${pct}%`, background: wouldExceed ? '#dc2626' : pct >= 80 ? '#f97316' : '#10b981' }} />
                                                        </div>
                                                    )}
                                                    {wouldExceed && (
                                                        <p className="text-[11px] mt-2">⚠ Adding {need_after} pilgrim{need_after === 1 ? '' : 's'} exceeds remaining inventory by {(booked + need_after) - cap}. You can still save, but the group will be overbooked.</p>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                        {selectedDeparture && (
                                            <div className="mt-2 text-xs text-gray-700 grid grid-cols-1 sm:grid-cols-3 gap-2 p-2 bg-white rounded border border-gray-200">
                                                <div>✈️ {selectedDeparture.components?.airline?.name || '—'} {selectedDeparture.components?.airline?.flightNumber || ''}</div>
                                                <div>🕋 {selectedDeparture.components?.makkahHotel?.hotel?.name || '—'}</div>
                                                <div>🕌 {selectedDeparture.components?.madinahHotel?.hotel?.name || '—'}</div>
                                            </div>
                                        )}
                                        <p className="text-[10px] text-gray-500 mt-1">Flight, hotels, ziyarats and transport are inherited from the group — you only set client, services and pricing.</p>
                                    </div>
                                )}
                            </div>

                            <div className="sm:col-span-2"><label className="label">Package Name *</label>
                                <input className="input" value={form.packageName} onChange={e => set('packageName', e.target.value)} placeholder="e.g. Umrah Ramadan 2026 — Economy" /></div>
                            <div><label className="label">Package Type</label>
                                <select className="select" value={form.packageType} onChange={e => set('packageType', e.target.value)}>
                                    <option>Umrah</option><option>Ziyarat</option><option>Custom</option><option>VIP</option>
                                </select></div>
                            <div><label className="label">Travel Season</label>
                                <input className="input" value={form.travelSeason} onChange={e => set('travelSeason', e.target.value)} placeholder="e.g. Ramadan 2026" /></div>
                            <div><label className="label">Duration</label>
                                <input className="input" value={form.duration} onChange={e => set('duration', e.target.value)} placeholder="e.g. 14 Days" /></div>
                            <div><label className="label">Number of Pilgrims</label>
                                <input className="input" type="number" min="1" value={form.numberOfPilgrims} onChange={e => set('numberOfPilgrims', parseInt(e.target.value) || 1)} /></div>
                            <div><label className="label">Departure Date *</label>
                                <input className="input" type="date" value={form.travelDates.departure} onChange={e => set('travelDates', { ...form.travelDates, departure: e.target.value })} />
                                <p className="text-[10px] text-gray-500 mt-1">Used to pick the correct seasonal hotel rate</p></div>
                            <div><label className="label">Return Date</label>
                                <input className="input" type="date" value={form.travelDates.returnDate} onChange={e => set('travelDates', { ...form.travelDates, returnDate: e.target.value })} /></div>
                        </div>
                    )}

                    {/* STEP: Airline */}
                    {STEPS[step] === 'Airline' && (
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-lg font-heading font-bold text-dark flex items-center gap-2"><MdFlight className="text-gold-500" /> Select Flight</h3>
                                {departure && <p className="text-xs text-gray-500">Filtered by travel dates {departure}{returnDate ? ` → ${returnDate}` : ''}</p>}
                            </div>
                            <div className="flex gap-2 mb-3">
                                <div className="relative flex-1">
                                    <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                    <input value={airlineSearch} onChange={e => setAirlineSearch(e.target.value)} className="search-input w-full" placeholder="Search by airline, flight #, city..." />
                                </div>
                                <button type="button" onClick={() => setAddAirlineOpen(true)} className="btn-outline btn-sm flex items-center gap-1 whitespace-nowrap"><MdAddCircleOutline size={14} /> Add Flight</button>
                            </div>
                            {filteredAirlines.length === 0 ? (
                                <p className="text-gray-400">No flights match. Try widening dates or adding a flight in Airlines.</p>
                            ) : (
                                <div className="space-y-2 max-h-96 overflow-y-auto">
                                    {filteredAirlines.map(a => {
                                        const remaining = a.totalSeats ? Math.max(0, a.totalSeats - (a.soldSeats || 0)) : null;
                                        const sold = remaining !== null && remaining < (form.numberOfPilgrims || 1);
                                        return (
                                            <label key={a._id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${form.components.airline === a._id ? 'border-gold-500 bg-gold-50' : 'border-gray-200 hover:border-gray-300'}`}>
                                                <input type="radio" name="airline" checked={form.components.airline === a._id} onChange={() => setComp('airline', a._id)} className="w-4 h-4 text-gold-500" />
                                                <div className="flex-1">
                                                    <p className="font-semibold">{a.name} <span className="text-gray-400">({a.flightNumber})</span></p>
                                                    <p className="text-sm text-gray-500">
                                                        {a.departureCity} → {a.arrivalCity} · {a.seatClass} · {formatSAR(a.ticketPriceSAR)}
                                                        {a.departureDateTime && <> · {new Date(a.departureDateTime).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}</>}
                                                    </p>
                                                    {remaining !== null && (
                                                        <p className={`text-xs mt-1 ${sold ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                                                            {sold ? `⚠ Only ${remaining} seat(s) left — need ${form.numberOfPilgrims}` : `${remaining} of ${a.totalSeats} seats available`}
                                                        </p>
                                                    )}
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* STEP: Makkah Hotel */}
                    {STEPS[step] === 'Makkah Hotel' && (
                        <div>
                            <h3 className="text-lg font-heading font-bold text-dark mb-3 flex items-center gap-2"><MdHotel className="text-gold-500" /> Select Makkah Hotel</h3>
                            <div className="flex gap-2 mb-3">
                                <div className="relative flex-1">
                                    <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                    <input value={makkahSearch} onChange={e => setMakkahSearch(e.target.value)} className="search-input w-full" placeholder="Search hotels..." />
                                </div>
                                <button type="button" onClick={() => setAddMakkahOpen(true)} className="btn-outline btn-sm flex items-center gap-1 whitespace-nowrap"><MdAddCircleOutline size={14} /> Add Hotel</button>
                            </div>
                            <div className="space-y-2 mb-4 max-h-72 overflow-y-auto">
                                {filteredMakkah.map(h => (
                                    <label key={h._id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${form.components.makkahHotel.hotel === h._id ? 'border-gold-500 bg-gold-50' : 'border-gray-200 hover:border-gray-300'}`}>
                                        <input type="radio" name="makkahHotel" checked={form.components.makkahHotel.hotel === h._id} onChange={() => { setMakkah('hotel', h._id); setMakkah('roomType', ''); setMakkah('ratePerNightSAR', 0); }} className="w-4 h-4 text-gold-500" />
                                        <div><p className="font-semibold">{h.name} {'⭐'.repeat(h.starRating)}</p><p className="text-sm text-gray-500">{h.distanceFromHaram}</p></div>
                                    </label>
                                ))}
                            </div>
                            {selectedMakkahHotel && (
                                <>
                                    {makkahAvail && (
                                        <AvailabilityBar avail={makkahAvail} need={makkahRoomsNeeded} window={availabilityWindow} />
                                    )}
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-gray-50 rounded-lg">
                                        <div><label className="label text-xs">Room Type</label>
                                            <select className="select text-sm" value={form.components.makkahHotel.roomType} onChange={e => { setMakkah('roomType', e.target.value); setMakkah('ratePerNightSAR', 0); }}>
                                                <option value="">Select room</option>
                                                {selectedMakkahHotel.roomTypes?.map((rt, i) => <option key={i} value={rt.typeName}>{rt.typeName} ({rt.mealPlan}, max {rt.maxOccupancy})</option>)}
                                            </select></div>
                                        <div><label className="label text-xs">Nights</label>
                                            <input className="input text-sm" type="number" min="0" value={form.components.makkahHotel.nights} onChange={e => setMakkah('nights', parseInt(e.target.value) || 0)} /></div>
                                        <div className="flex items-end">
                                            {makkahActiveRate ? (
                                                <div>
                                                    <p className="text-xs text-gray-500">Rate ({makkahActiveRate.label || 'Standard'}): <strong>{formatSAR(makkahActiveRate.rateSAR)}/night</strong></p>
                                                    <p className="text-sm font-semibold text-navy-800">Total: {formatSAR((makkahActiveRate.rateSAR || 0) * (form.components.makkahHotel.nights || 0))}</p>
                                                </div>
                                            ) : makkahRoom ? (
                                                <p className="text-xs text-orange-600">⚠ No rate period defined for {departure || 'these dates'}</p>
                                            ) : null}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* STEP: Madinah Hotel */}
                    {STEPS[step] === 'Madinah Hotel' && (
                        <div>
                            <h3 className="text-lg font-heading font-bold text-dark mb-3 flex items-center gap-2"><MdHotel className="text-gold-500" /> Select Madinah Hotel</h3>
                            <div className="flex gap-2 mb-3">
                                <div className="relative flex-1">
                                    <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                    <input value={madinahSearch} onChange={e => setMadinahSearch(e.target.value)} className="search-input w-full" placeholder="Search hotels..." />
                                </div>
                                <button type="button" onClick={() => setAddMadinahOpen(true)} className="btn-outline btn-sm flex items-center gap-1 whitespace-nowrap"><MdAddCircleOutline size={14} /> Add Hotel</button>
                            </div>
                            <div className="space-y-2 mb-4 max-h-72 overflow-y-auto">
                                {filteredMadinah.map(h => (
                                    <label key={h._id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${form.components.madinahHotel.hotel === h._id ? 'border-gold-500 bg-gold-50' : 'border-gray-200 hover:border-gray-300'}`}>
                                        <input type="radio" name="madinahHotel" checked={form.components.madinahHotel.hotel === h._id} onChange={() => { setMadinah('hotel', h._id); setMadinah('roomType', ''); setMadinah('ratePerNightSAR', 0); }} className="w-4 h-4 text-gold-500" />
                                        <div><p className="font-semibold">{h.name} {'⭐'.repeat(h.starRating)}</p><p className="text-sm text-gray-500">{h.distanceFromMasjidNabawi}</p></div>
                                    </label>
                                ))}
                            </div>
                            {selectedMadinahHotel && (
                                <>
                                    {madinahAvail && (
                                        <AvailabilityBar avail={madinahAvail} need={madinahRoomsNeeded} window={availabilityWindow} />
                                    )}
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-gray-50 rounded-lg">
                                        <div><label className="label text-xs">Room Type</label>
                                            <select className="select text-sm" value={form.components.madinahHotel.roomType} onChange={e => { setMadinah('roomType', e.target.value); setMadinah('ratePerNightSAR', 0); }}>
                                                <option value="">Select room</option>
                                                {selectedMadinahHotel.roomTypes?.map((rt, i) => <option key={i} value={rt.typeName}>{rt.typeName} ({rt.mealPlan}, max {rt.maxOccupancy})</option>)}
                                            </select></div>
                                        <div><label className="label text-xs">Nights</label>
                                            <input className="input text-sm" type="number" min="0" value={form.components.madinahHotel.nights} onChange={e => setMadinah('nights', parseInt(e.target.value) || 0)} /></div>
                                        <div className="flex items-end">
                                            {madinahActiveRate ? (
                                                <div>
                                                    <p className="text-xs text-gray-500">Rate ({madinahActiveRate.label || 'Standard'}): <strong>{formatSAR(madinahActiveRate.rateSAR)}/night</strong></p>
                                                    <p className="text-sm font-semibold text-navy-800">Total: {formatSAR((madinahActiveRate.rateSAR || 0) * (form.components.madinahHotel.nights || 0))}</p>
                                                </div>
                                            ) : madinahRoom ? (
                                                <p className="text-xs text-orange-600">⚠ No rate period defined for {departure || 'these dates'}</p>
                                            ) : null}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* STEP: Ziyarats */}
                    {STEPS[step] === 'Ziyarats' && (
                        <div>
                            <h3 className="text-lg font-heading font-bold text-dark mb-4 flex items-center gap-2"><MdMosque className="text-gold-500" /> Select Ziyarats</h3>
                            {ziyarats.filter(z => z.isActive).length === 0 ? <p className="text-gray-400">No ziyarats available</p> : (
                                <div className="space-y-2">
                                    {ziyarats.filter(z => z.isActive).map(z => (
                                        <label key={z._id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${form.components.ziyarats.includes(z._id) ? 'border-gold-500 bg-gold-50' : 'border-gray-200 hover:border-gray-300'}`}>
                                            <input type="checkbox" checked={form.components.ziyarats.includes(z._id)} onChange={() => setComp('ziyarats', toggleArray(form.components.ziyarats, z._id))} className="w-4 h-4 text-gold-500 rounded" />
                                            <div className="flex-1"><p className="font-semibold">{z.name} <span className="badge-navy text-xs ml-2">{z.location}</span></p>
                                                <p className="text-sm text-gray-500">{z.duration} · {formatSAR(z.ratePerPersonSAR)}/person</p></div>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* STEP: Transport */}
                    {STEPS[step] === 'Transport' && (
                        <div>
                            <h3 className="text-lg font-heading font-bold text-dark mb-4 flex items-center gap-2"><MdDirectionsBus className="text-gold-500" /> Select Transportation</h3>
                            <div className="space-y-2">
                                {transports.filter(t => t.isActive).map(t => (
                                    <label key={t._id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${form.components.transportation.includes(t._id) ? 'border-gold-500 bg-gold-50' : 'border-gray-200 hover:border-gray-300'}`}>
                                        <input type="checkbox" checked={form.components.transportation.includes(t._id)} onChange={() => setComp('transportation', toggleArray(form.components.transportation, t._id))} className="w-4 h-4 text-gold-500 rounded" />
                                        <div className="flex-1"><p className="font-semibold">{t.typeName}</p>
                                            <p className="text-sm text-gray-500">{t.route} · {t.capacity} seats · {formatSAR(t.ratePerPersonSAR)}/person</p></div>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* STEP: Special Services */}
                    {STEPS[step] === 'Services' && (
                        <div>
                            <h3 className="text-lg font-heading font-bold text-dark mb-4 flex items-center gap-2"><MdStar className="text-gold-500" /> Select Special Services</h3>
                            <div className="space-y-2">
                                {services.filter(s => s.isActive).map(s => (
                                    <label key={s._id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${form.components.specialServices.includes(s._id) ? 'border-gold-500 bg-gold-50' : 'border-gray-200 hover:border-gray-300'}`}>
                                        <input type="checkbox" checked={form.components.specialServices.includes(s._id)} onChange={() => setComp('specialServices', toggleArray(form.components.specialServices, s._id))} className="w-4 h-4 text-gold-500 rounded" />
                                        <div className="flex-1"><p className="font-semibold">{s.name}</p>
                                            <p className="text-sm text-gray-500">{formatSAR(s.rateSAR)} · {s.pricingType}</p></div>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* STEP: Pricing Review */}
                    {STEPS[step] === 'Pricing' && (
                        <div>
                            <h3 className="text-lg font-heading font-bold text-dark mb-4">💰 Pricing Summary</h3>
                            {pricing ? (
                                <div>
                                    <div className="table-container mb-4">
                                        <table className="data-table">
                                            <thead><tr><th>Component</th><th className="text-right">Cost (SAR)</th></tr></thead>
                                            <tbody>
                                                <tr><td>✈️ Airline ({form.numberOfPilgrims} pax)</td><td className="text-right">{formatSAR(pricing.airlineCostSAR)}</td></tr>
                                                <tr>
                                                    <td>🕋 Makkah Hotel {pricing.makkahRateLabel ? <span className="text-xs text-gray-500">({pricing.makkahRateLabel} @ {formatSAR(pricing.makkahRatePerNightSAR)}/night)</span> : ''}</td>
                                                    <td className="text-right">{formatSAR(pricing.makkahHotelCostSAR)}</td>
                                                </tr>
                                                <tr>
                                                    <td>🕌 Madinah Hotel {pricing.madinahRateLabel ? <span className="text-xs text-gray-500">({pricing.madinahRateLabel} @ {formatSAR(pricing.madinahRatePerNightSAR)}/night)</span> : ''}</td>
                                                    <td className="text-right">{formatSAR(pricing.madinahHotelCostSAR)}</td>
                                                </tr>
                                                <tr><td>🕌 Ziyarats</td><td className="text-right">{formatSAR(pricing.ziyaratsCostSAR)}</td></tr>
                                                <tr><td>🚌 Transport</td><td className="text-right">{formatSAR(pricing.transportCostSAR)}</td></tr>
                                                <tr><td>⭐ Special Services</td><td className="text-right">{formatSAR(pricing.servicesCostSAR)}</td></tr>
                                                <tr className="font-bold bg-gray-50"><td>Subtotal</td><td className="text-right">{formatSAR(pricing.subtotalSAR)}</td></tr>
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                                        <div><label className="label text-xs">Markup Type</label>
                                            <select className="select text-sm" value={form.pricingSummary.markupType} onChange={e => { setForm(f => ({ ...f, pricingSummary: { ...f.pricingSummary, markupType: e.target.value } })); }}>
                                                <option value="fixed">Fixed (SAR)</option><option value="percentage">Percentage (%)</option>
                                            </select></div>
                                        <div><label className="label text-xs">Markup Value</label>
                                            <input className="input text-sm" type="number" min="0" value={form.pricingSummary.markupValue} onChange={e => setForm(f => ({ ...f, pricingSummary: { ...f.pricingSummary, markupValue: parseFloat(e.target.value) || 0 } }))} /></div>
                                        <div className="flex items-end"><button onClick={calculatePricing} className="btn-outline text-sm">Recalculate</button></div>
                                    </div>
                                    <div className="p-4 bg-navy-50 rounded-xl text-center">
                                        <p className="text-sm text-gray-600">Markup: {formatSAR(pricing.markupAmountSAR)}</p>
                                        <p className="text-2xl font-heading font-bold text-navy-800 mt-1">{formatSAR(pricing.finalPriceSAR)}</p>
                                        <p className="text-lg text-gold-600 font-semibold">{formatPKR(pricing.finalPricePKR)}</p>
                                        <p className="text-sm text-gray-500 mt-1">Per Person: {formatSAR(pricing.costPerPersonSAR)} / {formatPKR(pricing.costPerPersonPKR)}</p>
                                    </div>
                                </div>
                            ) : <div className="text-center py-8"><div className="w-8 h-8 border-4 border-navy-800 border-t-gold-500 rounded-full animate-spin mx-auto" /><p className="text-gray-500 mt-2 text-sm">Calculating pricing...</p></div>}
                        </div>
                    )}

                    {/* STEP: Client & Save */}
                    {STEPS[step] === 'Client & Save' && (
                        <div>
                            <h3 className="text-lg font-heading font-bold text-dark mb-4">👤 Attach Client & Save</h3>
                            <div className="mb-4">
                                <label className="label">Client Type</label>
                                <div className="flex gap-2">
                                    <button onClick={() => set('clientType', 'B2C')} className={`px-4 py-2 rounded-lg text-sm font-semibold ${form.clientType === 'B2C' ? 'bg-navy-800 text-white' : 'bg-gray-100 text-gray-600'}`}>👤 B2C Pilgrim</button>
                                    <button onClick={() => set('clientType', 'B2B')} className={`px-4 py-2 rounded-lg text-sm font-semibold ${form.clientType === 'B2B' ? 'bg-navy-800 text-white' : 'bg-gray-100 text-gray-600'}`}>🏢 B2B Agent</button>
                                </div>
                            </div>
                            <div className="mb-4">
                                <label className="label">Select {form.clientType === 'B2C' ? 'Pilgrim' : 'Agent'}</label>
                                <div className="flex gap-2">
                                    <select className="select flex-1" value={form.client} onChange={e => set('client', e.target.value)}>
                                        <option value="">— Select —</option>
                                        {form.clientType === 'B2C'
                                            ? clientsB2C.filter(c => c.isActive).map(c => <option key={c._id} value={c._id}>{c.fullName} — {c.phone}</option>)
                                            : clientsB2B.filter(c => c.isActive).map(c => <option key={c._id} value={c._id}>{c.agentCode}: {c.companyName}</option>)
                                        }
                                    </select>
                                    <button type="button" onClick={() => setAddClientOpen(true)} className="btn-outline btn-sm flex items-center gap-1 whitespace-nowrap">
                                        <MdAddCircleOutline size={14} /> New {form.clientType === 'B2C' ? 'Pilgrim' : 'Agent'}
                                    </button>
                                </div>
                                <p className="text-[10px] text-gray-500 mt-1">Don't see them in the list? Create one inline — they'll appear in your Clients tab automatically.</p>
                            </div>
                            <div className="mb-4">
                                <label className="label">Status</label>
                                <select className="select" value={form.status} onChange={e => set('status', e.target.value)}>
                                    <option value="draft">Draft</option>
                                    <option value="quoted">Quoted</option>
                                    <option value="confirmed">Confirmed</option>
                                    <option value="deposit_received">Deposit Received</option>
                                    <option value="fully_paid">Fully Paid</option>
                                    <option value="completed">Completed</option>
                                    <option value="cancelled">Cancelled</option>
                                </select>
                                <p className="text-[10px] text-gray-500 mt-1">Confirmed and beyond reserve seats/rooms. Cancelled releases them.</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Navigation Buttons */}
                <div className="card-footer flex justify-between">
                    <button onClick={() => step > 0 ? setStep(s => s - 1) : nav('/packages')} className="btn-ghost flex items-center gap-1">
                        <MdArrowBack size={16} /> {step === 0 ? 'Cancel' : 'Back'}
                    </button>
                    {step < STEPS.length - 1 ? (
                        <button onClick={() => setStep(s => s + 1)} className="btn-gold flex items-center gap-1">
                            Next <MdArrowForward size={16} />
                        </button>
                    ) : (
                        <button onClick={handleSave} disabled={saving} className="btn-gold flex items-center gap-1">
                            <MdCheck size={16} /> {saving ? 'Saving...' : (editId ? 'Update Package' : 'Create Package')}
                        </button>
                    )}
                </div>
            </div>

            <QuickAddAirline
                isOpen={addAirlineOpen}
                onClose={() => setAddAirlineOpen(false)}
                defaultDeparture={departure}
                onCreated={(a) => { setAirlines(list => [a, ...list]); setComp('airline', a._id); setAddAirlineOpen(false); }}
            />
            <QuickAddHotel
                isOpen={addMakkahOpen}
                onClose={() => setAddMakkahOpen(false)}
                kind="makkah"
                onCreated={(h) => { setHotelsMakkah(list => [h, ...list]); setMakkah('hotel', h._id); setAddMakkahOpen(false); }}
            />
            <QuickAddHotel
                isOpen={addMadinahOpen}
                onClose={() => setAddMadinahOpen(false)}
                kind="madinah"
                onCreated={(h) => { setHotelsMadinah(list => [h, ...list]); setMadinah('hotel', h._id); setAddMadinahOpen(false); }}
            />
            <QuickAddClient
                isOpen={addClientOpen}
                onClose={() => setAddClientOpen(false)}
                clientType={form.clientType}
                onCreated={(c) => {
                    if (form.clientType === 'B2C') setClientsB2C(list => [c, ...list]);
                    else setClientsB2B(list => [c, ...list]);
                    set('client', c._id);
                    setAddClientOpen(false);
                }}
            />
        </div>
    );
}

// ── Quick-create modals ──

function QuickAddAirline({ isOpen, onClose, onCreated, defaultDeparture }) {
    const [form, setForm] = useState({ name: '', flightNumber: '', departureCity: '', arrivalCity: '', seatClass: 'Economy', departureDateTime: '', returnDateTime: '', ticketPriceSAR: '', totalSeats: 0 });
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        if (isOpen) setForm(f => ({ ...f, departureDateTime: defaultDeparture ? `${defaultDeparture}T08:00` : '' }));
    }, [isOpen, defaultDeparture]);
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const submit = async () => {
        if (!form.name || !form.ticketPriceSAR) { toast.error('Name & ticket price required'); return; }
        setSaving(true);
        try {
            const r = await api.post('/airlines', form);
            toast.success('Flight added');
            onCreated(r.data.data);
            setForm({ name: '', flightNumber: '', departureCity: '', arrivalCity: '', seatClass: 'Economy', departureDateTime: '', returnDateTime: '', ticketPriceSAR: '', totalSeats: 0 });
        } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
        finally { setSaving(false); }
    };
    return (
        <FormModal isOpen={isOpen} onClose={onClose} title="Quick-Add Flight" onSubmit={submit} loading={saving}>
            <p className="text-xs text-gray-500 -mt-2 mb-1">Adds a new flight you can pick immediately. Edit full details later under Airlines.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="label">Airline Name *</label><input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="PIA / Saudi" /></div>
                <div><label className="label">Flight Number</label><input className="input" value={form.flightNumber} onChange={e => set('flightNumber', e.target.value)} placeholder="PK-741" /></div>
                <div><label className="label">From</label><input className="input" value={form.departureCity} onChange={e => set('departureCity', e.target.value)} /></div>
                <div><label className="label">To</label><input className="input" value={form.arrivalCity} onChange={e => set('arrivalCity', e.target.value)} /></div>
                <div><label className="label">Departure Date/Time</label><input className="input" type="datetime-local" value={form.departureDateTime} onChange={e => set('departureDateTime', e.target.value)} /></div>
                <div><label className="label">Return Date/Time</label><input className="input" type="datetime-local" value={form.returnDateTime} onChange={e => set('returnDateTime', e.target.value)} /></div>
                <div><label className="label">Seat Class</label>
                    <select className="select" value={form.seatClass} onChange={e => set('seatClass', e.target.value)}>
                        <option>Economy</option><option>Business</option><option>First</option>
                    </select></div>
                <div><label className="label">Ticket Price (SAR) *</label><input className="input" type="number" min="0" value={form.ticketPriceSAR} onChange={e => set('ticketPriceSAR', e.target.value)} /></div>
                <div><label className="label">Total Seats</label><input className="input" type="number" min="0" value={form.totalSeats} onChange={e => set('totalSeats', Number(e.target.value) || 0)} /></div>
            </div>
        </FormModal>
    );
}

function QuickAddHotel({ isOpen, onClose, onCreated, kind }) {
    const isMakkah = kind === 'makkah';
    const distanceKey = isMakkah ? 'distanceFromHaram' : 'distanceFromMasjidNabawi';
    const [form, setForm] = useState({
        name: '', starRating: 4, [distanceKey]: '',
        roomType: 'Quad', maxOccupancy: 4, mealPlan: 'Breakfast',
        rateSAR: '', validFrom: '', validTo: '', totalRooms: 0
    });
    const [saving, setSaving] = useState(false);
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const submit = async () => {
        if (!form.name || !form.rateSAR) { toast.error('Hotel name and rate required'); return; }
        setSaving(true);
        try {
            const today = new Date().toISOString().slice(0, 10);
            const farFuture = `${new Date().getFullYear() + 5}-12-31`;
            const body = {
                name: form.name,
                starRating: form.starRating,
                [distanceKey]: form[distanceKey],
                totalRooms: form.totalRooms,
                roomTypes: [{
                    typeName: form.roomType,
                    maxOccupancy: form.maxOccupancy,
                    mealPlan: form.mealPlan,
                    rates: [{
                        label: 'Standard',
                        validFrom: form.validFrom || today,
                        validTo: form.validTo || farFuture,
                        rateSAR: Number(form.rateSAR) || 0
                    }]
                }]
            };
            const r = await api.post(isMakkah ? '/hotels-makkah' : '/hotels-madinah', body);
            toast.success('Hotel added');
            onCreated(r.data.data);
            setForm({ name: '', starRating: 4, [distanceKey]: '', roomType: 'Quad', maxOccupancy: 4, mealPlan: 'Breakfast', rateSAR: '', validFrom: '', validTo: '', totalRooms: 0 });
        } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
        finally { setSaving(false); }
    };
    return (
        <FormModal isOpen={isOpen} onClose={onClose} title={`Quick-Add ${isMakkah ? 'Makkah' : 'Madinah'} Hotel`} onSubmit={submit} loading={saving}>
            <p className="text-xs text-gray-500 -mt-2 mb-1">Creates the hotel with one room type and one rate period. Add more variants later under Hotels.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="label">Hotel Name *</label><input className="input" value={form.name} onChange={e => set('name', e.target.value)} /></div>
                <div><label className="label">Star Rating</label>
                    <select className="select" value={form.starRating} onChange={e => set('starRating', Number(e.target.value))}>
                        {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} Star</option>)}
                    </select></div>
                <div><label className="label">Distance from {isMakkah ? 'Haram' : 'Masjid Nabawi'}</label><input className="input" value={form[distanceKey]} onChange={e => set(distanceKey, e.target.value)} placeholder="e.g. 200m" /></div>
                <div><label className="label">Total Rooms (allotment)</label><input className="input" type="number" min="0" value={form.totalRooms} onChange={e => set('totalRooms', Number(e.target.value) || 0)} /></div>
            </div>
            <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                <p className="text-xs font-bold text-gray-600 uppercase mb-2">Room Type & Rate</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div><label className="label text-[10px]">Room Type</label><input className="input text-sm" value={form.roomType} onChange={e => set('roomType', e.target.value)} placeholder="Quad / Triple..." /></div>
                    <div><label className="label text-[10px]">Max Occupancy</label><input className="input text-sm" type="number" min="1" value={form.maxOccupancy} onChange={e => set('maxOccupancy', Number(e.target.value) || 1)} /></div>
                    <div><label className="label text-[10px]">Meal Plan</label>
                        <select className="select text-sm" value={form.mealPlan} onChange={e => set('mealPlan', e.target.value)}>
                            <option>Bed Only</option><option>Breakfast</option><option>Half Board</option><option>Full Board</option>
                        </select></div>
                    <div><label className="label text-[10px]">Rate (SAR/night) *</label><input className="input text-sm" type="number" min="0" value={form.rateSAR} onChange={e => set('rateSAR', e.target.value)} /></div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                    <div><label className="label text-[10px]">Valid From</label><input className="input text-sm" type="date" value={form.validFrom} onChange={e => set('validFrom', e.target.value)} /></div>
                    <div><label className="label text-[10px]">Valid To</label><input className="input text-sm" type="date" value={form.validTo} onChange={e => set('validTo', e.target.value)} /></div>
                </div>
                <p className="text-[10px] text-gray-500 mt-1">Leave dates blank to default to "always valid".</p>
            </div>
        </FormModal>
    );
}

function QuickAddClient({ isOpen, onClose, onCreated, clientType }) {
    const isB2C = clientType === 'B2C';
    const emptyB2C = { fullName: '', gender: 'Male', cnic: '', passportNumber: '', passportExpiry: '', phone: '', whatsapp: '', city: '', mahramDetails: { name: '', relation: '', cnic: '' } };
    const emptyB2B = { companyName: '', contactPerson: '', phone: '', whatsapp: '', email: '', city: '', commissionType: 'percentage', commissionValue: 0 };
    const [form, setForm] = useState(isB2C ? emptyB2C : emptyB2B);
    const [saving, setSaving] = useState(false);
    useEffect(() => { setForm(isB2C ? emptyB2C : emptyB2B); /* eslint-disable-next-line */ }, [clientType, isOpen]);
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const setMahram = (k, v) => setForm(f => ({ ...f, mahramDetails: { ...f.mahramDetails, [k]: v } }));
    const submit = async () => {
        if (isB2C && !form.fullName) { toast.error('Pilgrim name is required'); return; }
        if (!isB2C && !form.companyName) { toast.error('Company name is required'); return; }
        if (isB2C && form.gender === 'Female' && (!form.mahramDetails.name || !form.mahramDetails.relation)) {
            toast.error('Mahram name & relation required for female pilgrims'); return;
        }
        setSaving(true);
        try {
            const url = isB2C ? '/clients/b2c' : '/clients/b2b';
            const r = await api.post(url, form);
            toast.success(`${isB2C ? 'Pilgrim' : 'Agent'} created`);
            onCreated(r.data.data);
        } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
        finally { setSaving(false); }
    };
    return (
        <FormModal isOpen={isOpen} onClose={onClose} title={`Quick-Add ${isB2C ? 'B2C Pilgrim' : 'B2B Agent'}`} onSubmit={submit} loading={saving} submitLabel="Create & Select">
            <p className="text-xs text-gray-500 -mt-2 mb-1">Saves to the Clients list. Add full details (documents, more contacts) later from there.</p>
            {isB2C ? (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div><label className="label">Full Name *</label><input className="input" value={form.fullName} onChange={e => set('fullName', e.target.value)} /></div>
                        <div><label className="label">Gender *</label>
                            <select className="select" value={form.gender} onChange={e => set('gender', e.target.value)}>
                                <option>Male</option><option>Female</option>
                            </select></div>
                        <div><label className="label">Phone *</label><input className="input" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+92..." /></div>
                        <div><label className="label">CNIC</label><input className="input" value={form.cnic} onChange={e => set('cnic', e.target.value)} /></div>
                        <div><label className="label">Passport Number</label><input className="input" value={form.passportNumber} onChange={e => set('passportNumber', e.target.value)} /></div>
                        <div><label className="label">Passport Expiry</label><input className="input" type="date" value={form.passportExpiry} onChange={e => set('passportExpiry', e.target.value)} /></div>
                    </div>
                    {form.gender === 'Female' && (
                        <div className="mt-3 p-3 bg-pink-50 rounded-xl border border-pink-200">
                            <h4 className="text-sm font-bold text-pink-800 mb-2">Mahram (required)</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <input className="input text-sm" value={form.mahramDetails.name} onChange={e => setMahram('name', e.target.value)} placeholder="Name *" />
                                <input className="input text-sm" value={form.mahramDetails.relation} onChange={e => setMahram('relation', e.target.value)} placeholder="Relation *" />
                                <input className="input text-sm" value={form.mahramDetails.cnic} onChange={e => setMahram('cnic', e.target.value)} placeholder="CNIC" />
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2"><label className="label">Company Name *</label><input className="input" value={form.companyName} onChange={e => set('companyName', e.target.value)} /></div>
                    <div><label className="label">Contact Person</label><input className="input" value={form.contactPerson} onChange={e => set('contactPerson', e.target.value)} /></div>
                    <div><label className="label">Phone *</label><input className="input" value={form.phone} onChange={e => set('phone', e.target.value)} /></div>
                    <div><label className="label">WhatsApp</label><input className="input" value={form.whatsapp} onChange={e => set('whatsapp', e.target.value)} /></div>
                    <div><label className="label">Email</label><input className="input" value={form.email} onChange={e => set('email', e.target.value)} /></div>
                    <div><label className="label">City</label><input className="input" value={form.city} onChange={e => set('city', e.target.value)} /></div>
                    <div><label className="label">Commission Type</label>
                        <select className="select" value={form.commissionType} onChange={e => set('commissionType', e.target.value)}>
                            <option value="percentage">Percentage (%)</option><option value="fixed">Fixed (SAR)</option>
                        </select></div>
                    <div><label className="label">Commission Value</label><input className="input" type="number" min="0" value={form.commissionValue} onChange={e => set('commissionValue', Number(e.target.value) || 0)} /></div>
                </div>
            )}
        </FormModal>
    );
}
