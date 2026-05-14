import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../../utils/api';
import { useCurrency } from '../../context/CurrencyContext';
import FormModal from '../../components/FormModal';
import DocumentManager from '../../components/DocumentManager';
import toast from 'react-hot-toast';

const VISA_DOC_CATEGORIES = [
    ['visa_scan', 'Visa scan'],
    ['mofa_approval', 'MOFA approval'],
    ['mutamir_card', 'Mutamir card'],
    ['other', 'Other']
];
import {
    MdArrowBack, MdEdit, MdContentCopy, MdPrint, MdPersonAdd, MdDelete,
    MdSave, MdClose, MdCheck, MdSearch, MdAssignmentInd, MdReceipt, MdMap, MdDescription
} from 'react-icons/md';

const statusColors = {
    draft: 'badge-navy', quoted: 'badge-navy',
    confirmed: 'badge-active', deposit_received: 'badge-active',
    fully_paid: 'badge-gold', completed: 'badge-gold',
    cancelled: 'badge-inactive'
};
const STATUS_LABELS_PKG = {
    draft: 'Draft', quoted: 'Quoted', confirmed: 'Confirmed',
    deposit_received: 'Deposit Received', fully_paid: 'Fully Paid',
    completed: 'Completed', cancelled: 'Cancelled'
};

const VISA_STATUS_META = {
    not_started: { label: 'Not Started', cls: 'bg-gray-100 text-gray-700 border-gray-200' },
    passport_collected: { label: 'Passport In', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    mofa_submitted: { label: 'MOFA Submitted', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    mofa_approved: { label: 'MOFA Approved', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    visa_issued: { label: 'Visa Issued ✓', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    cancelled: { label: 'Cancelled', cls: 'bg-red-50 text-red-700 border-red-200' }
};
const VISA_STAGES_ORDER = ['not_started', 'passport_collected', 'mofa_submitted', 'mofa_approved', 'visa_issued', 'cancelled'];

const emptyB2C = () => ({
    fullName: '', gender: 'Male', cnic: '', passportNumber: '', passportExpiry: '', dob: '', phone: '', whatsapp: '', address: '', city: '',
    mahramDetails: { name: '', relation: '', cnic: '' },
    emergencyContact: { name: '', phone: '', relation: '' },
    notes: ''
});

export default function PackageDetail() {
    const { id } = useParams();
    const nav = useNavigate();
    const { formatSAR, formatPKR, convertToPKR } = useCurrency();
    const [pkg, setPkg] = useState(null);
    const [loading, setLoading] = useState(true);
    const [allB2C, setAllB2C] = useState([]);

    // Add-pilgrim modal
    const [addOpen, setAddOpen] = useState(false);
    const [addSearch, setAddSearch] = useState('');
    const [addingId, setAddingId] = useState('');

    // Quick-create-new-pilgrim modal
    const [createOpen, setCreateOpen] = useState(false);
    const [newPilgrim, setNewPilgrim] = useState(emptyB2C());
    const [creating, setCreating] = useState(false);

    // Per-row edit
    const [editingRow, setEditingRow] = useState(null); // entryId
    const [rowDraft, setRowDraft] = useState({});

    // Status step change
    const [changingStatus, setChangingStatus] = useState(false);

    // Visa status modal
    const [visaModal, setVisaModal] = useState(null); // entry being changed
    const [visaDraft, setVisaDraft] = useState({ status: '', notes: '', visaNumber: '', mutamirNumber: '', mofaApplicationDate: '', visaIssuedDate: '', visaExpiryDate: '' });
    const [savingVisa, setSavingVisa] = useState(false);

    // Profit summary
    const [profit, setProfit] = useState(null);

    const fetchPkg = async () => {
        try {
            setLoading(true);
            const res = await api.get(`/packages/${id}`);
            setPkg(res.data.data);
        } catch { toast.error('Failed to load package'); nav('/packages'); }
        finally { setLoading(false); }
    };

    const fetchClients = async () => {
        try {
            const res = await api.get('/clients/b2c');
            setAllB2C(res.data.data || []);
        } catch { /* non-fatal */ }
    };

    const fetchProfit = async () => {
        try { const r = await api.get(`/packages/${id}/profit`); setProfit(r.data.data); }
        catch { /* non-fatal */ }
    };
    useEffect(() => { fetchPkg(); fetchClients(); fetchProfit(); /* eslint-disable-next-line */ }, [id]);

    const onRoster = useMemo(() => new Set((pkg?.pilgrims || []).map(p => String(p.pilgrim?._id || p.pilgrim))), [pkg]);

    const filteredB2C = useMemo(() => {
        const s = addSearch.trim().toLowerCase();
        return allB2C
            .filter(c => c.isActive && !onRoster.has(String(c._id)))
            .filter(c => !s || `${c.fullName} ${c.phone || ''} ${c.cnic || ''} ${c.passportNumber || ''}`.toLowerCase().includes(s));
    }, [allB2C, addSearch, onRoster]);

    const handleAddPilgrim = async () => {
        if (!addingId) { toast.error('Pick a pilgrim'); return; }
        try {
            const res = await api.post(`/packages/${id}/pilgrims`, { pilgrim: addingId });
            setPkg(res.data.data);
            toast.success('Added to roster');
            setAddOpen(false); setAddingId(''); setAddSearch('');
        } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    };

    const handleCreateAndAdd = async () => {
        if (!newPilgrim.fullName || !newPilgrim.phone) { toast.error('Name & phone required'); return; }
        if (newPilgrim.gender === 'Female' && (!newPilgrim.mahramDetails.name || !newPilgrim.mahramDetails.relation)) {
            toast.error('Mahram details required for female pilgrims'); return;
        }
        setCreating(true);
        try {
            const cRes = await api.post('/clients/b2c', newPilgrim);
            const created = cRes.data.data;
            const pRes = await api.post(`/packages/${id}/pilgrims`, { pilgrim: created._id });
            setPkg(pRes.data.data);
            await fetchClients();
            toast.success('Pilgrim created and added');
            setCreateOpen(false); setNewPilgrim(emptyB2C());
        } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
        finally { setCreating(false); }
    };

    const startEditRow = (entry) => {
        setEditingRow(entry._id);
        setRowDraft({
            makkahRoom: entry.makkahRoom || '',
            madinahRoom: entry.madinahRoom || '',
            ticketNumber: entry.ticketNumber || '',
            visaNumber: entry.visaNumber || '',
            mutamirNumber: entry.mutamirNumber || '',
            notes: entry.notes || ''
        });
    };

    const saveRow = async (entryId) => {
        try {
            const res = await api.put(`/packages/${id}/pilgrims/${entryId}`, rowDraft);
            setPkg(res.data.data);
            setEditingRow(null);
            toast.success('Saved');
        } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    };

    const removeFromRoster = async (entry) => {
        if (!confirm(`Remove ${entry.pilgrim?.fullName || 'pilgrim'} from this package?`)) return;
        try {
            const res = await api.delete(`/packages/${id}/pilgrims/${entry._id}`);
            setPkg(res.data.data);
            toast.success('Removed');
        } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    };

    const printManifest = () => window.open(`/packages/view/${id}/manifest`, '_blank');

    const advanceStatus = async (newStatus) => {
        if (!pkg || pkg.status === newStatus) return;
        if (newStatus === 'cancelled' && !confirm('Cancel this package? Seats and rooms will be released.')) return;
        setChangingStatus(true);
        try {
            const res = await api.put(`/packages/${id}`, { status: newStatus });
            setPkg(prev => ({ ...prev, status: res.data.data.status }));
            toast.success(`Status set to ${STATUS_LABELS_PKG[newStatus] || newStatus}`);
        } catch (e) { toast.error(e.response?.data?.message || 'Failed to update status'); }
        finally { setChangingStatus(false); }
    };

    const isoDate = (v) => v ? String(v).slice(0, 10) : '';
    const openVisaModal = (entry) => {
        setVisaModal(entry);
        setVisaDraft({
            status: entry.visaStatus || 'not_started',
            notes: '',
            visaNumber: entry.visaNumber || '',
            mutamirNumber: entry.mutamirNumber || '',
            mofaApplicationDate: isoDate(entry.mofaApplicationDate),
            visaIssuedDate: isoDate(entry.visaIssuedDate),
            visaExpiryDate: isoDate(entry.visaExpiryDate)
        });
    };
    const saveVisaStatus = async () => {
        if (!visaModal) return;
        setSavingVisa(true);
        try {
            const res = await api.patch(`/packages/${id}/pilgrims/${visaModal._id}/visa-status`, visaDraft);
            setPkg(res.data.data);
            setVisaModal(null);
            toast.success('Visa status updated');
        } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
        finally { setSavingVisa(false); }
    };
    const setVD = (k, v) => setVisaDraft(d => ({ ...d, [k]: v }));

    if (loading || !pkg) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="w-10 h-10 border-4 border-navy-800 border-t-gold-500 rounded-full animate-spin" />
            </div>
        );
    }

    const expected = pkg.numberOfPilgrims || 0;
    const actual = pkg.pilgrims?.length || 0;
    const rosterStatus = actual === expected
        ? { tone: 'text-green-700 bg-green-50 border-green-200', text: `Roster complete: ${actual}/${expected}` }
        : actual < expected
            ? { tone: 'text-orange-700 bg-orange-50 border-orange-200', text: `${expected - actual} pilgrim(s) still to be named (${actual}/${expected})` }
            : { tone: 'text-red-700 bg-red-50 border-red-200', text: `Roster has ${actual - expected} more pilgrim(s) than booked (${actual}/${expected})` };

    const fmtDate = (v) => v ? new Date(v).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    const setNew = (k, v) => setNewPilgrim(f => ({ ...f, [k]: v }));
    const setMahram = (k, v) => setNewPilgrim(f => ({ ...f, mahramDetails: { ...f.mahramDetails, [k]: v } }));
    const setRD = (k, v) => setRowDraft(d => ({ ...d, [k]: v }));

    return (
        <div className="max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <button onClick={() => nav('/packages')} className="btn-ghost flex items-center gap-1"><MdArrowBack size={16} /> All Packages</button>
                <div className="flex flex-wrap gap-2">
                    <button onClick={() => nav(`/packages/edit/${id}`)} className="btn-outline btn-sm flex items-center gap-1"><MdEdit size={14} /> Edit</button>
                    <button onClick={() => nav(`/packages/duplicate/${id}`)} className="btn-outline btn-sm flex items-center gap-1"><MdContentCopy size={14} /> Duplicate</button>
                    <button onClick={() => window.open(`/packages/view/${id}/voucher`, '_blank')} className="btn-outline btn-sm flex items-center gap-1"><MdDescription size={14} /> Voucher</button>
                    <button onClick={() => window.open(`/packages/view/${id}/invoice`, '_blank')} className="btn-outline btn-sm flex items-center gap-1"><MdReceipt size={14} /> Invoice</button>
                    <button onClick={() => window.open(`/packages/view/${id}/itinerary`, '_blank')} className="btn-outline btn-sm flex items-center gap-1"><MdMap size={14} /> Itinerary</button>
                    <button onClick={printManifest} className="btn-outline btn-sm flex items-center gap-1"><MdPrint size={14} /> Manifest</button>
                </div>
            </div>

            {/* Status stepper — Draft → Quoted → Confirmed → Deposit → Fully Paid → Completed */}
            {(() => {
                const STEP_FLOW = ['draft', 'quoted', 'confirmed', 'deposit_received', 'fully_paid', 'completed'];
                const STEP_ICONS = { draft: '✎', quoted: '💬', confirmed: '✅', deposit_received: '💵', fully_paid: '💰', completed: '🏁' };
                const isCancelled = pkg.status === 'cancelled';
                const currentIdx = STEP_FLOW.indexOf(pkg.status);
                return (
                    <div className="card mb-4">
                        <div className="card-body py-4">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-heading font-bold text-dark text-sm">Booking Lifecycle</h3>
                                {!isCancelled && (
                                    <button onClick={() => advanceStatus('cancelled')} disabled={changingStatus} className="text-xs text-red-500 hover:underline">Cancel package</button>
                                )}
                                {isCancelled && (
                                    <button onClick={() => advanceStatus('confirmed')} disabled={changingStatus} className="text-xs text-green-600 hover:underline">Reinstate as Confirmed</button>
                                )}
                            </div>
                            {isCancelled ? (
                                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-semibold">⛔ This package is cancelled — seats and rooms have been released.</div>
                            ) : (
                                <div className="relative">
                                    {/* Connector line */}
                                    <div className="absolute top-4 left-0 right-0 h-0.5 bg-gray-200" />
                                    <div className="absolute top-4 left-0 h-0.5 bg-gradient-to-r from-navy-800 to-gold-500 transition-all" style={{ width: currentIdx >= 0 ? `${(currentIdx / (STEP_FLOW.length - 1)) * 100}%` : '0%' }} />
                                    <div className="relative flex justify-between">
                                        {STEP_FLOW.map((s, i) => {
                                            const done = i < currentIdx;
                                            const active = i === currentIdx;
                                            const tone = active ? 'bg-gold-500 text-white border-gold-500 scale-110 shadow-md' : done ? 'bg-navy-800 text-white border-navy-800' : 'bg-white text-gray-400 border-gray-200';
                                            return (
                                                <button key={s} onClick={() => advanceStatus(s)} disabled={changingStatus}
                                                    className={`relative flex flex-col items-center group ${changingStatus ? 'cursor-wait' : 'cursor-pointer'}`}
                                                    title={i <= currentIdx ? `Back to ${STATUS_LABELS_PKG[s]}` : `Advance to ${STATUS_LABELS_PKG[s]}`}>
                                                    <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-all ${tone}`}>
                                                        {done ? '✓' : STEP_ICONS[s]}
                                                    </div>
                                                    <span className={`text-[10px] mt-1 font-semibold ${active ? 'text-gold-700' : done ? 'text-navy-800' : 'text-gray-400'} group-hover:text-navy-800`}>
                                                        {STATUS_LABELS_PKG[s]}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })()}

            {/* Summary card */}
            <div className="card mb-4">
                <div className="card-body">
                    <div className="flex flex-wrap items-baseline gap-3 mb-3">
                        <span className="font-mono font-bold text-navy-800">{pkg.voucherId}</span>
                        <h1 className="text-xl font-heading font-bold text-dark">{pkg.packageName}</h1>
                        <span className={statusColors[pkg.status] || 'badge-navy'}>{STATUS_LABELS_PKG[pkg.status] || pkg.status}</span>
                        <span className="badge-navy">{pkg.packageType}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                        <div><p className="text-gray-500 text-xs">Travel Season</p><p className="font-semibold">{pkg.travelSeason || '—'}</p></div>
                        <div><p className="text-gray-500 text-xs">Duration</p><p className="font-semibold">{pkg.duration || '—'}</p></div>
                        <div><p className="text-gray-500 text-xs">Departure</p><p className="font-semibold">{fmtDate(pkg.travelDates?.departure)}</p></div>
                        <div><p className="text-gray-500 text-xs">Return</p><p className="font-semibold">{fmtDate(pkg.travelDates?.returnDate)}</p></div>
                        <div><p className="text-gray-500 text-xs">Booked Pilgrims</p><p className="font-semibold">{pkg.numberOfPilgrims}</p></div>
                        <div><p className="text-gray-500 text-xs">Client</p><p className="font-semibold">{pkg.client?.fullName || pkg.client?.companyName || '—'}</p></div>
                        <div><p className="text-gray-500 text-xs">Total (SAR)</p><p className="font-semibold text-navy-800">{formatSAR(pkg.pricingSummary?.finalPriceSAR)}</p></div>
                        <div><p className="text-gray-500 text-xs">Total (PKR @ today's rate)</p><p className="font-semibold text-gold-700">{formatPKR(convertToPKR(pkg.pricingSummary?.finalPriceSAR || 0))}</p></div>
                    </div>
                </div>
            </div>

            {/* Profit summary */}
            {profit && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <div className="stat-card"><p className="stat-label">Sell Price</p><p className="stat-value text-navy-800 text-base">{formatPKR(profit.sellPKR)}</p></div>
                    <div className="stat-card">
                        <p className="stat-label">Supplier Cost</p>
                        <p className="stat-value text-red-600 text-base">{formatPKR(profit.totalCostPKR)}</p>
                        {profit.allocatedCostPKR > 0
                            ? <p className="text-[10px] text-gray-500">Direct {formatPKR(profit.directCostPKR)} + Batch share {formatPKR(profit.allocatedCostPKR)} ({profit.allocation?.sharePct || 0}%)</p>
                            : <p className="text-[10px] text-gray-500">{profit.entries.length} direct invoice{profit.entries.length === 1 ? '' : 's'}</p>}
                    </div>
                    <div className="stat-card"><p className="stat-label">Profit</p><p className={`stat-value text-base ${profit.profitPKR >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatPKR(profit.profitPKR)}</p></div>
                    <div className="stat-card"><p className="stat-label">Margin</p><p className={`stat-value text-base ${profit.marginPct >= 0 ? 'text-green-700' : 'text-red-600'}`}>{profit.marginPct}%</p>
                        {profit.totalCostPKR === 0 && <p className="text-[10px] text-orange-600">⚠ no costs recorded yet</p>}</div>
                </div>
            )}

            {/* Components mini-summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <div className="stat-card">
                    <p className="stat-label">Flight</p>
                    <p className="font-semibold text-sm">{pkg.components?.airline?.name || '—'} {pkg.components?.airline?.flightNumber}</p>
                    <p className="text-xs text-gray-500">{pkg.components?.airline?.departureCity} → {pkg.components?.airline?.arrivalCity}</p>
                </div>
                <div className="stat-card">
                    <p className="stat-label">Makkah</p>
                    <p className="font-semibold text-sm">{pkg.components?.makkahHotel?.hotel?.name || '—'}</p>
                    <p className="text-xs text-gray-500">{pkg.components?.makkahHotel?.roomType || ''} · {pkg.components?.makkahHotel?.nights || 0} nights</p>
                </div>
                <div className="stat-card">
                    <p className="stat-label">Madinah</p>
                    <p className="font-semibold text-sm">{pkg.components?.madinahHotel?.hotel?.name || '—'}</p>
                    <p className="text-xs text-gray-500">{pkg.components?.madinahHotel?.roomType || ''} · {pkg.components?.madinahHotel?.nights || 0} nights</p>
                </div>
            </div>

            {/* Roster section */}
            <div className="card">
                <div className="card-body">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <h2 className="text-lg font-heading font-bold text-dark">Pilgrim Roster</h2>
                            <p className="text-xs text-gray-500">Actual travelling pilgrims for this package</p>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setAddOpen(true)} className="btn-outline btn-sm flex items-center gap-1"><MdPersonAdd size={14} /> Add Existing</button>
                            <button onClick={() => setCreateOpen(true)} className="btn-gold btn-sm flex items-center gap-1"><MdPersonAdd size={14} /> Quick-Create New</button>
                        </div>
                    </div>

                    <div className={`mb-3 p-3 rounded-lg border text-sm font-semibold ${rosterStatus.tone}`}>
                        {rosterStatus.text}
                    </div>

                    {actual === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                            <p className="text-lg mb-1">No pilgrims on the roster yet</p>
                            <p className="text-sm">Add existing B2C clients or quick-create new ones above.</p>
                        </div>
                    ) : (
                        <div className="table-container">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>Name</th>
                                        <th>Passport</th>
                                        <th>Visa Status</th>
                                        <th>Makkah Rm</th>
                                        <th>Madinah Rm</th>
                                        <th>Ticket #</th>
                                        <th>Visa #</th>
                                        <th>Mutamir #</th>
                                        <th className="text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pkg.pilgrims.map((entry, idx) => {
                                        const editing = editingRow === entry._id;
                                        const c = entry.pilgrim || {};
                                        return (
                                            <tr key={entry._id}>
                                                <td>{idx + 1}</td>
                                                <td>
                                                    <div className="font-semibold">{c.fullName || '—'}</div>
                                                    <div className="text-xs text-gray-500">{c.gender} · {c.phone || ''}</div>
                                                </td>
                                                <td className="text-sm">{c.passportNumber || '—'}<div className="text-xs text-gray-500">exp {fmtDate(c.passportExpiry)}</div></td>
                                                <td>
                                                    {(() => {
                                                        const meta = VISA_STATUS_META[entry.visaStatus] || VISA_STATUS_META.not_started;
                                                        return (
                                                            <button onClick={() => openVisaModal(entry)} className={`inline-block text-[11px] font-semibold border rounded-full px-2 py-0.5 hover:opacity-80 ${meta.cls}`} title="Click to advance">
                                                                {meta.label}
                                                            </button>
                                                        );
                                                    })()}
                                                </td>
                                                {editing ? (
                                                    <>
                                                        <td><input className="input text-xs py-1" value={rowDraft.makkahRoom} onChange={e => setRD('makkahRoom', e.target.value)} /></td>
                                                        <td><input className="input text-xs py-1" value={rowDraft.madinahRoom} onChange={e => setRD('madinahRoom', e.target.value)} /></td>
                                                        <td><input className="input text-xs py-1" value={rowDraft.ticketNumber} onChange={e => setRD('ticketNumber', e.target.value)} /></td>
                                                        <td><input className="input text-xs py-1" value={rowDraft.visaNumber} onChange={e => setRD('visaNumber', e.target.value)} /></td>
                                                        <td><input className="input text-xs py-1" value={rowDraft.mutamirNumber} onChange={e => setRD('mutamirNumber', e.target.value)} /></td>
                                                    </>
                                                ) : (
                                                    <>
                                                        <td className="text-sm">{entry.makkahRoom || '—'}</td>
                                                        <td className="text-sm">{entry.madinahRoom || '—'}</td>
                                                        <td className="text-sm font-mono">{entry.ticketNumber || '—'}</td>
                                                        <td className="text-sm font-mono">{entry.visaNumber || '—'}</td>
                                                        <td className="text-sm font-mono">{entry.mutamirNumber || '—'}</td>
                                                    </>
                                                )}
                                                <td className="text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        {editing ? (
                                                            <>
                                                                <button onClick={() => saveRow(entry._id)} className="btn-icon text-green-600 hover:bg-green-50" title="Save"><MdCheck size={16} /></button>
                                                                <button onClick={() => setEditingRow(null)} className="btn-icon text-gray-500 hover:bg-gray-100" title="Cancel"><MdClose size={16} /></button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <button onClick={() => startEditRow(entry)} className="btn-icon text-navy-800 hover:bg-navy-50" title="Edit room/ticket/visa"><MdEdit size={16} /></button>
                                                                <button onClick={() => removeFromRoster(entry)} className="btn-icon text-red-500 hover:bg-red-50" title="Remove from roster"><MdDelete size={16} /></button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Add existing pilgrim modal */}
            <FormModal isOpen={addOpen} onClose={() => { setAddOpen(false); setAddingId(''); setAddSearch(''); }}
                title="Add Pilgrim from Clients" onSubmit={handleAddPilgrim} submitLabel="Add to Roster">
                <div className="relative mb-2">
                    <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input value={addSearch} onChange={e => setAddSearch(e.target.value)} className="search-input w-full" placeholder="Search by name, phone, CNIC, passport..." />
                </div>
                {filteredB2C.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">No matching clients. Use Quick-Create New instead.</p>
                ) : (
                    <div className="max-h-72 overflow-y-auto space-y-1">
                        {filteredB2C.map(c => (
                            <label key={c._id} className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer text-sm ${addingId === c._id ? 'border-gold-500 bg-gold-50' : 'border-gray-200 hover:border-gray-300'}`}>
                                <input type="radio" name="addPilgrim" checked={addingId === c._id} onChange={() => setAddingId(c._id)} className="w-4 h-4 text-gold-500" />
                                <div className="flex-1">
                                    <p className="font-semibold">{c.fullName} <span className={`badge text-xs ml-1 ${c.gender === 'Male' ? 'badge-navy' : 'badge-gold'}`}>{c.gender}</span></p>
                                    <p className="text-xs text-gray-500">{c.phone} · CNIC {c.cnic || '—'} · Passport {c.passportNumber || '—'}</p>
                                </div>
                            </label>
                        ))}
                    </div>
                )}
                <p className="text-xs text-gray-500 mt-2">Don't see them? <button type="button" onClick={() => { setAddOpen(false); setCreateOpen(true); }} className="text-gold-600 underline">Quick-create a new pilgrim</button>.</p>
            </FormModal>

            {/* Visa status update modal */}
            <FormModal isOpen={!!visaModal} onClose={() => setVisaModal(null)}
                title={`Visa Status — ${visaModal?.pilgrim?.fullName || ''}`}
                onSubmit={saveVisaStatus} loading={savingVisa} submitLabel="Update Status">
                <div className="space-y-3">
                    <div>
                        <label className="label flex items-center gap-2"><MdAssignmentInd /> Visa Status</label>
                        <div className="flex flex-wrap gap-1.5">
                            {VISA_STAGES_ORDER.map(s => {
                                const meta = VISA_STATUS_META[s];
                                const active = visaDraft.status === s;
                                return (
                                    <button key={s} type="button" onClick={() => setVD('status', s)}
                                        className={`text-xs font-semibold border rounded-full px-3 py-1 ${active ? 'ring-2 ring-navy-800 ' + meta.cls : meta.cls}`}>
                                        {meta.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="label">Visa Number</label>
                            <input className="input text-sm" value={visaDraft.visaNumber} onChange={e => setVD('visaNumber', e.target.value)} placeholder="e.g. UMR-2026-12345" />
                        </div>
                        <div>
                            <label className="label">Mutamir Number</label>
                            <input className="input text-sm" value={visaDraft.mutamirNumber} onChange={e => setVD('mutamirNumber', e.target.value)} />
                        </div>
                        <div>
                            <label className="label">MOFA Application Date</label>
                            <input className="input text-sm" type="date" value={visaDraft.mofaApplicationDate} onChange={e => setVD('mofaApplicationDate', e.target.value)} />
                        </div>
                        <div>
                            <label className="label">Visa Issued Date</label>
                            <input className="input text-sm" type="date" value={visaDraft.visaIssuedDate} onChange={e => setVD('visaIssuedDate', e.target.value)} />
                        </div>
                        <div className="sm:col-span-2">
                            <label className="label">Visa Expiry Date</label>
                            <input className="input text-sm" type="date" value={visaDraft.visaExpiryDate} onChange={e => setVD('visaExpiryDate', e.target.value)} />
                        </div>
                    </div>

                    <div>
                        <label className="label">Notes (logged in timeline)</label>
                        <textarea className="input text-sm" rows={2} value={visaDraft.notes} onChange={e => setVD('notes', e.target.value)} placeholder="Optional — appears in the visa history" />
                    </div>

                    {visaModal?.visaTimeline?.length > 0 && (
                        <div className="bg-gray-50 p-3 rounded-lg">
                            <p className="text-xs font-bold text-gray-600 uppercase mb-2">History</p>
                            <ul className="space-y-1 text-xs max-h-32 overflow-y-auto">
                                {[...visaModal.visaTimeline].reverse().map(e => (
                                    <li key={e._id}>
                                        <span className="font-semibold">{VISA_STATUS_META[e.status]?.label || e.status}</span>
                                        <span className="text-gray-500"> · {new Date(e.at).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                        {e.notes && <span className="text-gray-600"> — {e.notes}</span>}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {visaModal && (
                        <div className="bg-navy-50/50 p-3 rounded-lg border border-navy-100">
                            <p className="text-xs font-bold text-navy-800 uppercase mb-2">📎 Visa Documents</p>
                            <DocumentManager
                                documents={visaModal.documents || []}
                                uploadUrl={`/packages/${id}/pilgrims/${visaModal._id}/documents`}
                                onChange={(updatedPkg) => {
                                    setPkg(updatedPkg);
                                    const refreshed = updatedPkg.pilgrims?.find(p => String(p._id) === String(visaModal._id));
                                    if (refreshed) setVisaModal(refreshed);
                                }}
                                categories={VISA_DOC_CATEGORIES}
                            />
                        </div>
                    )}
                </div>
            </FormModal>

            {/* Quick-create new pilgrim modal */}
            <FormModal isOpen={createOpen} onClose={() => setCreateOpen(false)}
                title="Quick-Create New Pilgrim & Add to Roster" onSubmit={handleCreateAndAdd} loading={creating} submitLabel="Create & Add">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><label className="label">Full Name *</label>
                        <input className="input" value={newPilgrim.fullName} onChange={e => setNew('fullName', e.target.value)} /></div>
                    <div><label className="label">Gender *</label>
                        <select className="select" value={newPilgrim.gender} onChange={e => setNew('gender', e.target.value)}>
                            <option>Male</option><option>Female</option>
                        </select></div>
                    <div><label className="label">Phone *</label>
                        <input className="input" value={newPilgrim.phone} onChange={e => setNew('phone', e.target.value)} placeholder="+92..." /></div>
                    <div><label className="label">CNIC</label>
                        <input className="input" value={newPilgrim.cnic} onChange={e => setNew('cnic', e.target.value)} /></div>
                    <div><label className="label">Passport Number</label>
                        <input className="input" value={newPilgrim.passportNumber} onChange={e => setNew('passportNumber', e.target.value)} /></div>
                    <div><label className="label">Passport Expiry</label>
                        <input className="input" type="date" value={newPilgrim.passportExpiry} onChange={e => setNew('passportExpiry', e.target.value)} /></div>
                </div>
                {newPilgrim.gender === 'Female' && (
                    <div className="mt-3 p-3 bg-pink-50 rounded-xl border border-pink-200">
                        <h4 className="text-sm font-bold text-pink-800 mb-2">Mahram Details (required)</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <input className="input text-sm" value={newPilgrim.mahramDetails.name} onChange={e => setMahram('name', e.target.value)} placeholder="Name *" />
                            <input className="input text-sm" value={newPilgrim.mahramDetails.relation} onChange={e => setMahram('relation', e.target.value)} placeholder="Relation *" />
                            <input className="input text-sm" value={newPilgrim.mahramDetails.cnic} onChange={e => setMahram('cnic', e.target.value)} placeholder="CNIC" />
                        </div>
                    </div>
                )}
            </FormModal>
        </div>
    );
}
