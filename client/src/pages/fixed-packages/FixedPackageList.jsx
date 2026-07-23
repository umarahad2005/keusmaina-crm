import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import FormModal from '../../components/FormModal';
import { useCurrency } from '../../context/CurrencyContext';
import toast from 'react-hot-toast';
import { MdAdd, MdEdit, MdDelete, MdStorefront, MdSell, MdToggleOn, MdToggleOff } from 'react-icons/md';

const num = (v) => Number(v) || 0;

const emptyForm = () => ({
    name: '', supplier: '', status: 'active',
    basePricePKR: '', supplierDiscountPKR: '', markupPKR: '',
    duration: '', travelDates: { departure: '', returnDate: '' },
    components: {
        airline: '',
        makkahHotel: { hotel: '', roomType: '', nights: '' },
        madinahHotel: { hotel: '', roomType: '', nights: '' },
    },
    notes: '',
});

export default function FixedPackageList() {
    const nav = useNavigate();
    const { formatPKR } = useCurrency();

    const [items, setItems] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [airlines, setAirlines] = useState([]);
    const [makkahHotels, setMakkahHotels] = useState([]);
    const [madinahHotels, setMadinahHotels] = useState([]);
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);

    const [modal, setModal] = useState(false);
    const [editId, setEditId] = useState(null);
    const [form, setForm] = useState(emptyForm());
    const [saving, setSaving] = useState(false);

    const [sellItem, setSellItem] = useState(null);
    const [sellForm, setSellForm] = useState({ clientKey: '', numberOfPilgrims: 1 });

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [fp, sup, air, mkh, mdh, b2c, b2b] = await Promise.all([
                api.get('/fixed-packages'),
                api.get('/suppliers'),
                api.get('/airlines'),
                api.get('/hotels-makkah'),
                api.get('/hotels-madinah'),
                api.get('/clients/b2c?limit=200'),
                api.get('/clients/b2b?limit=200'),
            ]);
            setItems(fp.data.data || []);
            setSuppliers(sup.data.data || []);
            setAirlines(air.data.data || []);
            setMakkahHotels(mkh.data.data || []);
            setMadinahHotels(mdh.data.data || []);
            const b2cList = (b2c.data.data || []).map(c => ({ key: `B2C:${c._id}`, id: c._id, type: 'B2C', label: `${c.fullName} · B2C` }));
            const b2bList = (b2b.data.data || []).map(c => ({ key: `B2B:${c._id}`, id: c._id, type: 'B2B', label: `${c.companyName} · B2B` }));
            setClients([...b2cList, ...b2bList]);
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to load fixed packages');
        } finally { setLoading(false); }
    };

    useEffect(() => { fetchAll(); }, []);

    // live per-person math for the form
    const cost = num(form.basePricePKR) - num(form.supplierDiscountPKR);
    const sell = num(form.basePricePKR) + num(form.markupPKR);
    const profit = num(form.markupPKR) + num(form.supplierDiscountPKR);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const setDates = (k, v) => setForm(f => ({ ...f, travelDates: { ...f.travelDates, [k]: v } }));
    const setCompField = (k, v) => setForm(f => ({ ...f, components: { ...f.components, [k]: v } }));
    const setHotel = (comp, k, v) => setForm(f => ({ ...f, components: { ...f.components, [comp]: { ...f.components[comp], [k]: v } } }));

    const openCreate = () => { setEditId(null); setForm(emptyForm()); setModal(true); };
    const openEdit = (it) => {
        setEditId(it._id);
        setForm({
            name: it.name || '',
            supplier: it.supplier?._id || it.supplier || '',
            status: it.status || 'active',
            basePricePKR: it.basePricePKR ?? '',
            supplierDiscountPKR: it.supplierDiscountPKR ?? '',
            markupPKR: it.markupPKR ?? '',
            duration: it.duration || '',
            travelDates: {
                departure: it.travelDates?.departure ? String(it.travelDates.departure).slice(0, 10) : '',
                returnDate: it.travelDates?.returnDate ? String(it.travelDates.returnDate).slice(0, 10) : '',
            },
            components: {
                airline: it.components?.airline?._id || it.components?.airline || '',
                makkahHotel: {
                    hotel: it.components?.makkahHotel?.hotel?._id || it.components?.makkahHotel?.hotel || '',
                    roomType: it.components?.makkahHotel?.roomType || '', nights: it.components?.makkahHotel?.nights ?? '',
                },
                madinahHotel: {
                    hotel: it.components?.madinahHotel?.hotel?._id || it.components?.madinahHotel?.hotel || '',
                    roomType: it.components?.madinahHotel?.roomType || '', nights: it.components?.madinahHotel?.nights ?? '',
                },
            },
            notes: it.notes || '',
        });
        setModal(true);
    };

    const buildPayload = () => {
        const p = {
            name: form.name.trim(), supplier: form.supplier, status: form.status,
            basePricePKR: num(form.basePricePKR),
            supplierDiscountPKR: num(form.supplierDiscountPKR),
            markupPKR: num(form.markupPKR),
            duration: form.duration,
            travelDates: { departure: form.travelDates.departure || undefined, returnDate: form.travelDates.returnDate || undefined },
            components: {
                makkahHotel: { hotel: form.components.makkahHotel.hotel || undefined, roomType: form.components.makkahHotel.roomType, nights: num(form.components.makkahHotel.nights) },
                madinahHotel: { hotel: form.components.madinahHotel.hotel || undefined, roomType: form.components.madinahHotel.roomType, nights: num(form.components.madinahHotel.nights) },
            },
            notes: form.notes,
        };
        if (form.components.airline) p.components.airline = form.components.airline;
        return p;
    };

    const handleSubmit = async () => {
        if (!form.name.trim() || !form.supplier) { toast.error('Name and supplier are required'); return; }
        if (num(form.basePricePKR) <= 0) { toast.error('Base price is required'); return; }
        setSaving(true);
        try {
            if (editId) await api.put(`/fixed-packages/${editId}`, buildPayload());
            else await api.post('/fixed-packages', buildPayload());
            toast.success(editId ? 'Fixed package updated' : 'Fixed package added');
            setModal(false); fetchAll();
        } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
        finally { setSaving(false); }
    };

    const toggleStatus = async (it) => {
        try {
            await api.patch(`/fixed-packages/${it._id}/status`, { status: it.status === 'active' ? 'closed' : 'active' });
            fetchAll();
        } catch { toast.error('Failed to update status'); }
    };

    const handleDelete = async (it) => {
        if (!confirm(`Remove "${it.name}" from inventory?`)) return;
        try { await api.delete(`/fixed-packages/${it._id}`); fetchAll(); }
        catch { toast.error('Failed to delete'); }
    };

    // Sell
    const openSell = (it) => { setSellItem(it); setSellForm({ clientKey: '', numberOfPilgrims: 1 }); };
    const sSell = num(sellItem?.basePricePKR) + num(sellItem?.markupPKR);
    const sCost = num(sellItem?.basePricePKR) - num(sellItem?.supplierDiscountPKR);
    const sN = Math.max(1, parseInt(sellForm.numberOfPilgrims, 10) || 1);
    const handleSell = async () => {
        const c = clients.find(x => x.key === sellForm.clientKey);
        if (!c) { toast.error('Select a client'); return; }
        setSaving(true);
        try {
            const res = await api.post(`/fixed-packages/${sellItem._id}/sell`, { client: c.id, clientType: c.type, numberOfPilgrims: sN });
            toast.success('Sold — package created');
            setSellItem(null);
            nav(`/packages/view/${res.data.data.package._id}`);
        } catch (e) { toast.error(e.response?.data?.message || 'Sell failed'); }
        finally { setSaving(false); }
    };

    if (loading) return <div className="flex items-center justify-center py-20"><div className="w-10 h-10 border-4 border-navy-800 border-t-gold-500 rounded-full animate-spin" /></div>;

    return (
        <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h1 className="text-xl font-heading font-bold text-dark flex items-center gap-2"><MdStorefront /> Fixed Packages</h1>
                <button onClick={openCreate} className="btn-gold btn-sm flex items-center gap-1"><MdAdd size={16} /> Add Fixed Package</button>
            </div>

            <div className="card"><div className="card-body">
                {items.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                        <p className="text-lg mb-1">No fixed packages yet</p>
                        <p className="text-sm">Click "Add Fixed Package" to record one you bought from a supplier.</p>
                    </div>
                ) : (
                    <div className="table-container"><table className="data-table">
                        <thead><tr>
                            <th>Package</th><th>Supplier</th><th>Status</th>
                            <th className="text-right">Cost /pax</th><th className="text-right">Sell /pax</th><th className="text-right">Profit /pax</th>
                            <th className="text-right">Actions</th>
                        </tr></thead>
                        <tbody>
                            {items.map(it => {
                                const c = num(it.basePricePKR) - num(it.supplierDiscountPKR);
                                const s = num(it.basePricePKR) + num(it.markupPKR);
                                const p = num(it.markupPKR) + num(it.supplierDiscountPKR);
                                return (
                                    <tr key={it._id}>
                                        <td className="font-medium">{it.name}</td>
                                        <td className="text-sm">{it.supplier?.name || '—'}</td>
                                        <td>
                                            <button onClick={() => toggleStatus(it)} title="Toggle Active / Closed"
                                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${it.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                                                {it.status === 'active' ? <MdToggleOn size={16} /> : <MdToggleOff size={16} />}
                                                {it.status === 'active' ? 'Active' : 'Closed'}
                                            </button>
                                        </td>
                                        <td className="text-right">{formatPKR(c)}</td>
                                        <td className="text-right">{formatPKR(s)}</td>
                                        <td className="text-right font-semibold text-green-700">{formatPKR(p)}</td>
                                        <td className="text-right whitespace-nowrap">
                                            <button disabled={it.status !== 'active'} onClick={() => openSell(it)} title="Sell to a client"
                                                className="btn-sm btn-primary disabled:opacity-40 mr-1"><MdSell size={14} /></button>
                                            <button onClick={() => openEdit(it)} className="btn-ghost btn-sm mr-1"><MdEdit size={14} /></button>
                                            <button onClick={() => handleDelete(it)} className="btn-ghost btn-sm text-red-500"><MdDelete size={14} /></button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table></div>
                )}
            </div></div>

            {/* Create / Edit */}
            <FormModal isOpen={modal} onClose={() => setModal(false)} title={editId ? 'Edit Fixed Package' : 'Add Fixed Package'} onSubmit={handleSubmit} loading={saving}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2"><label className="label">Package Name *</label>
                        <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Ramadan Economy 14 Days" /></div>
                    <div><label className="label">Supplier *</label>
                        <select className="select" value={form.supplier} onChange={e => set('supplier', e.target.value)}>
                            <option value="">— Select —</option>
                            {suppliers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                        </select></div>
                    <div><label className="label">Status</label>
                        <select className="select" value={form.status} onChange={e => set('status', e.target.value)}>
                            <option value="active">Active (available to sell)</option>
                            <option value="closed">Closed (sold out)</option>
                        </select></div>

                    {/* Pricing (per person, PKR) */}
                    <div className="sm:col-span-2 p-3 bg-gold-50 rounded-lg border border-gold-200">
                        <div className="grid grid-cols-3 gap-2">
                            <div><label className="label text-xs">Base price / person *</label>
                                <input className="input" type="number" min="0" value={form.basePricePKR} onChange={e => set('basePricePKR', e.target.value)} /></div>
                            <div><label className="label text-xs">Supplier "minus" / person</label>
                                <input className="input" type="number" min="0" value={form.supplierDiscountPKR} onChange={e => set('supplierDiscountPKR', e.target.value)} /></div>
                            <div><label className="label text-xs">Your markup / person</label>
                                <input className="input" type="number" min="0" value={form.markupPKR} onChange={e => set('markupPKR', e.target.value)} /></div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center text-sm pt-2 mt-1 border-t border-gold-200">
                            <div className="text-gray-600">Cost: <b className="text-dark">{formatPKR(cost)}</b></div>
                            <div className="text-gray-600">Sell: <b className="text-navy-800">{formatPKR(sell)}</b></div>
                            <div className="text-gray-600">Profit: <b className="text-green-700">{formatPKR(profit)}</b></div>
                        </div>
                    </div>

                    <div><label className="label">Departure date</label>
                        <input className="input" type="date" value={form.travelDates.departure} onChange={e => setDates('departure', e.target.value)} /></div>
                    <div><label className="label">Return date</label>
                        <input className="input" type="date" value={form.travelDates.returnDate} onChange={e => setDates('returnDate', e.target.value)} /></div>
                    <div><label className="label">Duration</label>
                        <input className="input" value={form.duration} onChange={e => set('duration', e.target.value)} placeholder="e.g. 14 Days" /></div>
                    <div><label className="label">Airline</label>
                        <select className="select" value={form.components.airline} onChange={e => setCompField('airline', e.target.value)}>
                            <option value="">— None —</option>
                            {airlines.map(a => <option key={a._id} value={a._id}>{a.name}{a.flightNumber ? ` (${a.flightNumber})` : ''}</option>)}
                        </select></div>

                    <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="p-2 bg-gray-50 rounded-lg border">
                            <p className="text-xs font-semibold text-navy-800 mb-1">Makkah Hotel</p>
                            <select className="select text-sm mb-1" value={form.components.makkahHotel.hotel} onChange={e => setHotel('makkahHotel', 'hotel', e.target.value)}>
                                <option value="">— None —</option>
                                {makkahHotels.map(h => <option key={h._id} value={h._id}>{h.name}</option>)}
                            </select>
                            <div className="grid grid-cols-2 gap-1">
                                <input className="input text-sm" placeholder="Room type" value={form.components.makkahHotel.roomType} onChange={e => setHotel('makkahHotel', 'roomType', e.target.value)} />
                                <input className="input text-sm" type="number" min="0" placeholder="Nights" value={form.components.makkahHotel.nights} onChange={e => setHotel('makkahHotel', 'nights', e.target.value)} />
                            </div>
                        </div>
                        <div className="p-2 bg-gray-50 rounded-lg border">
                            <p className="text-xs font-semibold text-navy-800 mb-1">Madinah Hotel</p>
                            <select className="select text-sm mb-1" value={form.components.madinahHotel.hotel} onChange={e => setHotel('madinahHotel', 'hotel', e.target.value)}>
                                <option value="">— None —</option>
                                {madinahHotels.map(h => <option key={h._id} value={h._id}>{h.name}</option>)}
                            </select>
                            <div className="grid grid-cols-2 gap-1">
                                <input className="input text-sm" placeholder="Room type" value={form.components.madinahHotel.roomType} onChange={e => setHotel('madinahHotel', 'roomType', e.target.value)} />
                                <input className="input text-sm" type="number" min="0" placeholder="Nights" value={form.components.madinahHotel.nights} onChange={e => setHotel('madinahHotel', 'nights', e.target.value)} />
                            </div>
                        </div>
                    </div>

                    <div className="sm:col-span-2"><label className="label">Notes</label>
                        <textarea className="input" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
                </div>
            </FormModal>

            {/* Sell */}
            <FormModal isOpen={!!sellItem} onClose={() => setSellItem(null)} title={`Sell: ${sellItem?.name || ''}`} onSubmit={handleSell} loading={saving} submitLabel="Sell & Create Package">
                {sellItem && (
                    <div className="space-y-3">
                        <div className="p-3 bg-navy-50 rounded-lg text-sm grid grid-cols-3 text-center">
                            <div>Sell /pax<br /><b>{formatPKR(sSell)}</b></div>
                            <div>Cost /pax<br /><b>{formatPKR(sCost)}</b></div>
                            <div>Profit /pax<br /><b className="text-green-700">{formatPKR(sSell - sCost)}</b></div>
                        </div>
                        <div><label className="label">Client *</label>
                            <select className="select" value={sellForm.clientKey} onChange={e => setSellForm(f => ({ ...f, clientKey: e.target.value }))}>
                                <option value="">— Select client —</option>
                                {clients.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                            </select></div>
                        <div><label className="label">Number of pilgrims *</label>
                            <input className="input" type="number" min="1" value={sellForm.numberOfPilgrims} onChange={e => setSellForm(f => ({ ...f, numberOfPilgrims: e.target.value }))} /></div>
                        <div className="p-3 bg-green-50 rounded-lg border border-green-200 text-sm grid grid-cols-3 text-center">
                            <div>Client pays<br /><b>{formatPKR(sSell * sN)}</b></div>
                            <div>Supplier cost<br /><b>{formatPKR(sCost * sN)}</b></div>
                            <div>Your profit<br /><b className="text-green-700">{formatPKR((sSell - sCost) * sN)}</b></div>
                        </div>
                        <p className="text-[11px] text-gray-500">Creates a package for the client (roster, visa, manifest, invoice) and records the supplier cost as a payable.</p>
                    </div>
                )}
            </FormModal>
        </div>
    );
}
