import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { useCurrency } from '../../context/CurrencyContext';
import toast from 'react-hot-toast';
import {
    MdContentCopy, MdVisibility, MdGroups, MdPrint, MdEdit, MdDelete, MdSearch,
    MdAdd, MdFilterList, MdClose, MdChevronLeft, MdChevronRight, MdCheckBox, MdCheckBoxOutlineBlank
} from 'react-icons/md';

const STATUS_CONFIG = [
    { key: 'all', label: 'All', tone: 'bg-gray-100 text-gray-700' },
    { key: 'draft', label: 'Draft', tone: 'bg-gray-200 text-gray-700' },
    { key: 'quoted', label: 'Quoted', tone: 'bg-blue-100 text-blue-700' },
    { key: 'confirmed', label: 'Confirmed', tone: 'bg-emerald-100 text-emerald-700' },
    { key: 'deposit_received', label: 'Deposit In', tone: 'bg-indigo-100 text-indigo-700' },
    { key: 'fully_paid', label: 'Fully Paid', tone: 'bg-gold-100 text-gold-700' },
    { key: 'completed', label: 'Completed', tone: 'bg-purple-100 text-purple-700' },
    { key: 'cancelled', label: 'Cancelled', tone: 'bg-red-100 text-red-700' }
];

const statusColors = {
    draft: 'badge-navy', quoted: 'badge-navy', confirmed: 'badge-active',
    deposit_received: 'badge-active', fully_paid: 'badge-gold',
    completed: 'badge-gold', cancelled: 'badge-inactive'
};
const statusLabels = {
    draft: 'Draft', quoted: 'Quoted', confirmed: 'Confirmed',
    deposit_received: 'Deposit In', fully_paid: 'Fully Paid',
    completed: 'Completed', cancelled: 'Cancelled'
};

const PER_PAGE = 12;
const fmtDate = (v) => v ? new Date(v).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const emptyFilters = { status: 'all', departure: '', client: '', dateFrom: '', dateTo: '' };

export default function PackageList() {
    const [data, setData] = useState([]);
    const [departures, setDepartures] = useState([]);
    const [loading, setLoading] = useState(true);
    const { formatPKR, formatSAR, convertToPKR } = useCurrency();
    const nav = useNavigate();

    const [search, setSearch] = useState('');
    const [filters, setFilters] = useState(emptyFilters);
    const [showFilters, setShowFilters] = useState(false);
    const [page, setPage] = useState(1);

    // Bulk selection
    const [selected, setSelected] = useState(new Set());

    const fetchData = async () => {
        try {
            setLoading(true);
            const [pkgRes, depRes] = await Promise.all([
                api.get('/packages?limit=500'),
                api.get('/departures?limit=200')
            ]);
            setData(pkgRes.data.data || []);
            setDepartures(depRes.data.data || []);
        } catch { toast.error('Failed to load packages'); }
        finally { setLoading(false); }
    };
    useEffect(() => { fetchData(); }, []);

    // ── Filtering (client-side; data set is small enough) ──
    const filtered = useMemo(() => {
        const s = search.trim().toLowerCase();
        return data.filter(p => {
            if (filters.status !== 'all' && p.status !== filters.status) return false;
            if (filters.departure && String(p.departure?._id || p.departure || '') !== filters.departure) return false;
            if (filters.client) {
                const cs = filters.client.trim().toLowerCase();
                const name = (p.client?.fullName || p.client?.companyName || '').toLowerCase();
                const code = (p.client?.agentCode || '').toLowerCase();
                if (!name.includes(cs) && !code.includes(cs)) return false;
            }
            if (filters.dateFrom) {
                if (!p.travelDates?.departure || new Date(p.travelDates.departure) < new Date(filters.dateFrom)) return false;
            }
            if (filters.dateTo) {
                if (!p.travelDates?.departure || new Date(p.travelDates.departure) > new Date(filters.dateTo + 'T23:59:59')) return false;
            }
            if (s) {
                const blob = `${p.voucherId || ''} ${p.packageName || ''} ${p.client?.fullName || ''} ${p.client?.companyName || ''} ${p.client?.agentCode || ''}`.toLowerCase();
                if (!blob.includes(s)) return false;
            }
            return true;
        });
    }, [data, search, filters]);

    const hasFilters = filters.status !== 'all' || !!filters.departure || !!filters.client || !!filters.dateFrom || !!filters.dateTo;
    const setFilter = (k, v) => { setFilters(f => ({ ...f, [k]: v })); setPage(1); };
    const clearFilters = () => { setFilters(emptyFilters); setPage(1); };

    // Status counts (across the *unfiltered* set so pills always show real totals)
    const statusCounts = useMemo(() => {
        const out = { all: data.length };
        for (const s of STATUS_CONFIG) if (s.key !== 'all') out[s.key] = 0;
        for (const p of data) out[p.status] = (out[p.status] || 0) + 1;
        return out;
    }, [data]);

    // Pagination
    const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
    const pageData = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

    // Bulk select helpers
    const togglePick = (id) => {
        setSelected(s => {
            const next = new Set(s);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };
    const toggleAllOnPage = () => {
        const allPicked = pageData.every(p => selected.has(p._id));
        setSelected(s => {
            const next = new Set(s);
            if (allPicked) pageData.forEach(p => next.delete(p._id));
            else pageData.forEach(p => next.add(p._id));
            return next;
        });
    };
    const clearSelection = () => setSelected(new Set());

    // Bulk actions
    const bulkChangeStatus = async (status) => {
        if (selected.size === 0) return;
        if (!confirm(`Change status of ${selected.size} package${selected.size === 1 ? '' : 's'} to "${statusLabels[status]}"?`)) return;
        try {
            const r = await api.patch('/packages/bulk-status', { ids: Array.from(selected), status });
            toast.success(`${r.data.updated} package${r.data.updated === 1 ? '' : 's'} updated`);
            clearSelection();
            fetchData();
        } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    };
    const bulkOpenVouchers = () => {
        if (selected.size === 0) return;
        for (const id of selected) window.open(`/packages/view/${id}/voucher`, '_blank');
    };

    const handleDelete = async (row) => {
        if (!confirm(`Cancel package "${row.voucherId}"?`)) return;
        try { await api.delete(`/packages/${row._id}`); toast.success('Package cancelled'); fetchData(); }
        catch { toast.error('Failed'); }
    };

    return (
        <div>
            {/* Page header */}
            <div className="page-header">
                <div>
                    <h2 className="page-title">Package Maker — Bookings</h2>
                    <p className="page-subtitle">{filtered.length} of {data.length} packages</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative">
                        <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                            placeholder="Voucher, name, client..." className="search-input w-56" />
                    </div>
                    <button onClick={() => setShowFilters(s => !s)} className={`btn-sm flex items-center gap-1 ${showFilters || hasFilters ? 'btn-primary' : 'btn-ghost'}`}>
                        <MdFilterList size={16} /> Filters{hasFilters ? ` (${[filters.departure, filters.client, filters.dateFrom, filters.dateTo].filter(Boolean).length + (filters.status !== 'all' ? 1 : 0)})` : ''}
                    </button>
                    <button onClick={() => nav('/packages/new')} className="btn-gold flex items-center gap-2">
                        <MdAdd size={18} /> Create Package
                    </button>
                </div>
            </div>

            {/* Status pills */}
            <div className="flex flex-wrap gap-1.5 mb-3">
                {STATUS_CONFIG.map(s => {
                    const active = filters.status === s.key;
                    return (
                        <button key={s.key} onClick={() => setFilter('status', s.key)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${active ? 'bg-navy-800 text-white border-navy-800' : `${s.tone} border-transparent hover:border-gray-300`}`}>
                            {s.label} <span className={`ml-1 text-[10px] font-bold ${active ? 'opacity-80' : 'opacity-60'}`}>{statusCounts[s.key] || 0}</span>
                        </button>
                    );
                })}
            </div>

            {/* Detailed filters */}
            {showFilters && (
                <div className="card mb-3 border-navy-200">
                    <div className="card-body">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-bold text-sm text-navy-800">Refine</h3>
                            {hasFilters && (
                                <button onClick={clearFilters} className="text-xs text-red-500 hover:underline flex items-center gap-1">
                                    <MdClose size={12} /> Clear all
                                </button>
                            )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                            <div><label className="label text-xs">Group / Departure</label>
                                <select className="select text-xs" value={filters.departure} onChange={e => setFilter('departure', e.target.value)}>
                                    <option value="">All groups</option>
                                    {departures.map(d => <option key={d._id} value={d._id}>{d.code} — {d.name}</option>)}
                                </select></div>
                            <div><label className="label text-xs">Client name / agent code</label>
                                <input type="text" className="input text-xs" value={filters.client} onChange={e => setFilter('client', e.target.value)} placeholder="contains..." /></div>
                            <div><label className="label text-xs">Travel from</label>
                                <input type="date" className="input text-xs" value={filters.dateFrom} onChange={e => setFilter('dateFrom', e.target.value)} /></div>
                            <div><label className="label text-xs">Travel to</label>
                                <input type="date" className="input text-xs" value={filters.dateTo} onChange={e => setFilter('dateTo', e.target.value)} /></div>
                        </div>
                    </div>
                </div>
            )}

            {/* Bulk action bar */}
            {selected.size > 0 && (
                <div className="sticky top-16 z-20 mb-3 p-3 bg-navy-800 text-white rounded-lg shadow-lg flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                        <span className="font-bold">{selected.size} selected</span>
                        <button onClick={clearSelection} className="text-xs underline opacity-80 hover:opacity-100">Clear</button>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs opacity-70">Set status:</span>
                        {['quoted', 'confirmed', 'deposit_received', 'fully_paid', 'completed', 'cancelled'].map(s => (
                            <button key={s} onClick={() => bulkChangeStatus(s)} className="btn-sm bg-white/15 hover:bg-white/25 text-white text-xs">{statusLabels[s]}</button>
                        ))}
                        <button onClick={bulkOpenVouchers} className="btn-sm bg-gold-500 hover:bg-gold-600 text-white text-xs flex items-center gap-1">
                            <MdPrint size={12} /> Open Vouchers
                        </button>
                    </div>
                </div>
            )}

            {/* Table */}
            <div className="table-container">
                {loading ? (
                    <div className="flex items-center justify-center py-20"><div className="w-10 h-10 border-4 border-navy-800 border-t-gold-500 rounded-full animate-spin" /></div>
                ) : pageData.length === 0 ? (
                    <div className="text-center py-16">
                        <p className="text-gray-400 text-lg mb-1">No packages match</p>
                        <p className="text-gray-300 text-sm">{hasFilters || search ? 'Try clearing filters' : 'Click "Create Package" to start'}</p>
                    </div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th style={{ width: 36 }}>
                                    <button onClick={toggleAllOnPage} className="text-white" title="Select all on this page">
                                        {pageData.every(p => selected.has(p._id)) ? <MdCheckBox size={18} /> : <MdCheckBoxOutlineBlank size={18} />}
                                    </button>
                                </th>
                                <th>Voucher</th>
                                <th>Package</th>
                                <th>Type</th>
                                <th>Group</th>
                                <th>Client</th>
                                <th>Travel</th>
                                <th>Roster</th>
                                <th>Total</th>
                                <th>Status</th>
                                <th className="text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pageData.map(p => {
                                const picked = selected.has(p._id);
                                const rosterActual = p.pilgrims?.length || 0;
                                const rosterTone = rosterActual === p.numberOfPilgrims ? 'text-green-700' : rosterActual < p.numberOfPilgrims ? 'text-orange-600' : 'text-red-600';
                                return (
                                    <tr key={p._id} className={picked ? 'bg-gold-50/60' : ''}>
                                        <td>
                                            <button onClick={() => togglePick(p._id)} className="text-navy-800" title="Select">
                                                {picked ? <MdCheckBox size={18} /> : <MdCheckBoxOutlineBlank size={18} />}
                                            </button>
                                        </td>
                                        <td><span className="font-mono font-bold text-navy-800">{p.voucherId}</span></td>
                                        <td>{p.packageName}</td>
                                        <td><span className="badge-navy text-xs">{p.packageType}</span></td>
                                        <td className="text-xs">
                                            {p.departure ? (
                                                <span className="font-mono text-navy-800">{p.departure.code || '—'}</span>
                                            ) : <span className="text-gray-400">Standalone</span>}
                                        </td>
                                        <td>
                                            <div className="text-sm">{p.client?.fullName || p.client?.companyName || '—'}</div>
                                            {p.clientType && <div className="text-[10px] text-gray-500">{p.clientType}</div>}
                                        </td>
                                        <td className="text-xs">{fmtDate(p.travelDates?.departure)}</td>
                                        <td className={`text-xs font-semibold flex items-center gap-1 ${rosterTone}`}>
                                            <MdGroups size={12} /> {rosterActual}/{p.numberOfPilgrims}
                                        </td>
                                        <td className="text-right">
                                            <div className="font-semibold text-navy-800 text-sm">{formatSAR(p.pricingSummary?.finalPriceSAR)}</div>
                                            <div className="text-[10px] text-gray-500">{formatPKR(convertToPKR(p.pricingSummary?.finalPriceSAR || 0))}</div>
                                        </td>
                                        <td><span className={statusColors[p.status] || 'badge-navy'}>{statusLabels[p.status] || p.status}</span></td>
                                        <td className="text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <button onClick={() => nav(`/packages/view/${p._id}`)} className="btn-icon text-navy-700 hover:bg-navy-50" title="View detail & roster"><MdVisibility size={16} /></button>
                                                <button onClick={() => nav(`/packages/edit/${p._id}`)} className="btn-icon text-navy-800 hover:bg-navy-50" title="Edit"><MdEdit size={16} /></button>
                                                <button onClick={() => nav(`/packages/duplicate/${p._id}`)} className="btn-icon text-gold-600 hover:bg-gold-50" title="Duplicate as new draft"><MdContentCopy size={16} /></button>
                                                <button onClick={() => window.open(`/packages/view/${p._id}/manifest`, '_blank')} className="btn-icon text-gold-600 hover:bg-gold-50" title="Manifest (PDF)"><MdPrint size={16} /></button>
                                                <button onClick={() => handleDelete(p)} className="btn-icon text-red-500 hover:bg-red-50" title="Cancel"><MdDelete size={16} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 px-2">
                    <p className="text-sm text-gray-500">
                        Showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filtered.length)} of {filtered.length}
                    </p>
                    <div className="flex items-center gap-1">
                        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-ghost btn-sm">
                            <MdChevronLeft size={18} />
                        </button>
                        <span className="text-sm font-semibold px-3">Page {page} of {totalPages}</span>
                        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn-ghost btn-sm">
                            <MdChevronRight size={18} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
