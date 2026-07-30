import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { useCurrency } from '../../context/CurrencyContext';
import useAutoRefresh from '../../hooks/useAutoRefresh';
import toast from 'react-hot-toast';
import {
    MdContentCopy, MdVisibility, MdGroups, MdPrint, MdEdit, MdDelete, MdSearch,
    MdAdd, MdFilterList, MdClose, MdChevronLeft, MdChevronRight, MdCheckBox, MdCheckBoxOutlineBlank,
    MdSell
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

// What a row is. Sales needs one place to see everything sellable, so this
// list mixes two records that are NOT the same thing:
//   custom    — a package we built from our own inventory
//   sold      — a booking created by selling a fixed package to a client
//   inventory — a fixed package still sitting unsold on the shelf
// Only the first two are real bookings; inventory rows have no client, no
// roster and no voucher, so those cells stay blank and their only action is
// "go sell it".
const SOURCE_CONFIG = [
    { key: 'all', label: 'All' },
    { key: 'custom', label: 'Our packages' },
    { key: 'sold', label: 'Fixed — sold' },
    { key: 'inventory', label: 'Fixed — available' },
];

const sourceBadge = {
    custom: 'bg-navy-100 text-navy-800',
    sold: 'bg-purple-100 text-purple-700',
    inventory: 'bg-amber-100 text-amber-700',
};
const sourceLabel = { custom: 'Custom', sold: 'Fixed', inventory: 'Fixed · available' };

export default function PackageList() {
    const [data, setData] = useState([]);
    const [fixedStock, setFixedStock] = useState([]);
    const [departures, setDepartures] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sourceFilter, setSourceFilter] = useState('all');
    const { formatPKR, formatSAR, convertToPKR } = useCurrency();
    const nav = useNavigate();

    const [search, setSearch] = useState('');
    const [filters, setFilters] = useState(emptyFilters);
    const [showFilters, setShowFilters] = useState(false);
    const [page, setPage] = useState(1);

    // Bulk selection
    const [selected, setSelected] = useState(new Set());

    // `silent` is for the auto-refresh tick: no spinner, no error toast, so a
    // background poll never blanks the table or nags on a blip.
    const fetchData = async ({ silent = false } = {}) => {
        try {
            if (!silent) setLoading(true);
            const [pkgRes, depRes, fixedRes] = await Promise.all([
                api.get('/packages?limit=500'),
                api.get('/departures?limit=200'),
                api.get('/fixed-packages?limit=200')
            ]);
            setData(pkgRes.data.data || []);
            setDepartures(depRes.data.data || []);
            setFixedStock(fixedRes.data.data || []);
        } catch { if (!silent) toast.error('Failed to load packages'); }
        finally { if (!silent) setLoading(false); }
    };
    useEffect(() => { fetchData(); }, []);

    // Pause polling while a bulk selection is in play — refreshing under a
    // selection would silently change what the next bulk action applies to.
    useAutoRefresh(() => fetchData({ silent: true }), { enabled: selected.size === 0 });

    // ── One normalised row shape for both record types, so filtering, paging
    //    and the table body don't branch on every single field ──
    const rows = useMemo(() => {
        const fromPackage = (p) => ({
            kind: 'package',
            key: `p:${p._id}`,
            id: p._id,
            source: p.source === 'fixed' ? 'sold' : 'custom',
            voucher: p.voucherId || '',
            name: p.packageName || '',
            packageType: p.packageType || '',
            departureId: String(p.departure?._id || p.departure || ''),
            departureCode: p.departure?.code || '',
            clientName: p.client?.fullName || p.client?.companyName || '',
            clientCode: p.client?.agentCode || '',
            clientType: p.clientType || '',
            travelDate: p.travelDates?.departure || null,
            roster: p.pilgrims?.length || 0,
            pax: p.numberOfPilgrims || 0,
            // A fixed-source booking is priced in PKR only — its SAR total is
            // always 0, so converting it would show the sale as free.
            priceSAR: p.source === 'fixed' ? null : (p.pricingSummary?.finalPriceSAR || 0),
            pricePKR: p.source === 'fixed'
                ? (p.pricingSummary?.finalPricePKR || 0)
                : convertToPKR(p.pricingSummary?.finalPriceSAR || 0),
            status: p.status,
        });
        const fromFixed = (f) => ({
            kind: 'fixed',
            key: `f:${f._id}`,
            id: f._id,
            source: 'inventory',
            voucher: '',
            name: f.name || '',
            packageType: '',
            departureId: '',
            departureCode: '',
            clientName: '',
            clientCode: '',
            clientType: '',
            travelDate: f.travelDates?.departure || null,
            roster: null,
            pax: null,
            priceSAR: null,
            pricePKR: (f.basePricePKR || 0) + (f.markupPKR || 0), // sell price per pax
            status: f.status,
            supplierName: f.supplier?.name || '',
        });
        // Closed stock is not sellable, so it has no place on a sales screen.
        const available = fixedStock.filter(f => f.status === 'active');
        return [...data.map(fromPackage), ...available.map(fromFixed)];
    }, [data, fixedStock, convertToPKR]);

    // ── Filtering (client-side; data set is small enough) ──
    const filtered = useMemo(() => {
        const s = search.trim().toLowerCase();
        return rows.filter(r => {
            if (sourceFilter !== 'all' && r.source !== sourceFilter) return false;
            // Booking statuses don't apply to shelf stock — picking any status
            // pill therefore hides inventory rows rather than mislabelling them.
            if (filters.status !== 'all' && (r.kind !== 'package' || r.status !== filters.status)) return false;
            if (filters.departure && r.departureId !== filters.departure) return false;
            if (filters.client) {
                const cs = filters.client.trim().toLowerCase();
                if (!r.clientName.toLowerCase().includes(cs) && !r.clientCode.toLowerCase().includes(cs)) return false;
            }
            if (filters.dateFrom) {
                if (!r.travelDate || new Date(r.travelDate) < new Date(filters.dateFrom)) return false;
            }
            if (filters.dateTo) {
                if (!r.travelDate || new Date(r.travelDate) > new Date(filters.dateTo + 'T23:59:59')) return false;
            }
            if (s) {
                const blob = `${r.voucher} ${r.name} ${r.clientName} ${r.clientCode} ${r.supplierName || ''}`.toLowerCase();
                if (!blob.includes(s)) return false;
            }
            return true;
        });
    }, [rows, search, filters, sourceFilter]);

    const hasFilters = filters.status !== 'all' || !!filters.departure || !!filters.client || !!filters.dateFrom || !!filters.dateTo || sourceFilter !== 'all';
    const setFilter = (k, v) => { setFilters(f => ({ ...f, [k]: v })); setPage(1); };
    const clearFilters = () => { setFilters(emptyFilters); setSourceFilter('all'); setPage(1); };

    // Counts run across the *unfiltered* set so pills always show real totals
    const statusCounts = useMemo(() => {
        const out = { all: rows.length };
        for (const s of STATUS_CONFIG) if (s.key !== 'all') out[s.key] = 0;
        for (const r of rows) if (r.kind === 'package') out[r.status] = (out[r.status] || 0) + 1;
        return out;
    }, [rows]);

    const sourceCounts = useMemo(() => {
        const out = { all: rows.length, custom: 0, sold: 0, inventory: 0 };
        for (const r of rows) out[r.source] = (out[r.source] || 0) + 1;
        return out;
    }, [rows]);

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
    // Only real bookings can be bulk-actioned; inventory rows aren't packages yet.
    const selectableOnPage = pageData.filter(r => r.kind === 'package');
    const toggleAllOnPage = () => {
        const allPicked = selectableOnPage.length > 0 && selectableOnPage.every(r => selected.has(r.id));
        setSelected(s => {
            const next = new Set(s);
            if (allPicked) selectableOnPage.forEach(r => next.delete(r.id));
            else selectableOnPage.forEach(r => next.add(r.id));
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
        if (!confirm(`Cancel package "${row.voucher}"?`)) return;
        try { await api.delete(`/packages/${row.id}`); toast.success('Package cancelled'); fetchData(); }
        catch { toast.error('Failed'); }
    };

    return (
        <div>
            {/* Page header */}
            <div className="page-header">
                <div>
                    <h2 className="page-title">Package Maker — Sales</h2>
                    <p className="page-subtitle">
                        {filtered.length} of {rows.length} — {sourceCounts.custom} ours · {sourceCounts.sold} fixed sold · {sourceCounts.inventory} fixed available
                    </p>
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

            {/* Source pills — our packages vs supplier fixed packages */}
            <div className="flex flex-wrap gap-1.5 mb-2">
                {SOURCE_CONFIG.map(s => {
                    const active = sourceFilter === s.key;
                    return (
                        <button key={s.key} onClick={() => { setSourceFilter(s.key); setPage(1); }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${active ? 'bg-gold-500 text-white border-gold-500' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                            {s.label} <span className="ml-1 text-[10px] font-bold opacity-70">{sourceCounts[s.key] || 0}</span>
                        </button>
                    );
                })}
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
                                    <button onClick={toggleAllOnPage} className="text-white" title="Select all bookings on this page">
                                        {selectableOnPage.length > 0 && selectableOnPage.every(r => selected.has(r.id)) ? <MdCheckBox size={18} /> : <MdCheckBoxOutlineBlank size={18} />}
                                    </button>
                                </th>
                                <th>Voucher</th>
                                <th>Package</th>
                                <th>Source</th>
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
                            {pageData.map(r => {
                                const isStock = r.kind === 'fixed';
                                const picked = !isStock && selected.has(r.id);
                                const rosterTone = r.roster === r.pax ? 'text-green-700' : r.roster < r.pax ? 'text-orange-600' : 'text-red-600';
                                return (
                                    <tr key={r.key} className={picked ? 'bg-gold-50/60' : isStock ? 'bg-amber-50/40' : ''}>
                                        <td>
                                            {isStock ? <span className="text-gray-300">—</span> : (
                                                <button onClick={() => togglePick(r.id)} className="text-navy-800" title="Select">
                                                    {picked ? <MdCheckBox size={18} /> : <MdCheckBoxOutlineBlank size={18} />}
                                                </button>
                                            )}
                                        </td>
                                        <td>{isStock
                                            ? <span className="text-xs text-gray-400">not sold yet</span>
                                            : <span className="font-mono font-bold text-navy-800">{r.voucher}</span>}</td>
                                        <td>{r.name}</td>
                                        <td><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${sourceBadge[r.source]}`}>{sourceLabel[r.source]}</span></td>
                                        <td>{r.packageType ? <span className="badge-navy text-xs">{r.packageType}</span> : <span className="text-gray-300">—</span>}</td>
                                        <td className="text-xs">
                                            {isStock
                                                ? <span className="text-gray-500">{r.supplierName || '—'}</span>
                                                : r.departureCode
                                                    ? <span className="font-mono text-navy-800">{r.departureCode}</span>
                                                    : <span className="text-gray-400">Standalone</span>}
                                        </td>
                                        <td>
                                            <div className="text-sm">{r.clientName || '—'}</div>
                                            {r.clientType && <div className="text-[10px] text-gray-500">{r.clientType}</div>}
                                        </td>
                                        <td className="text-xs">{fmtDate(r.travelDate)}</td>
                                        <td className="text-xs">
                                            {isStock ? <span className="text-gray-300">—</span> : (
                                                <span className={`font-semibold flex items-center gap-1 ${rosterTone}`}>
                                                    <MdGroups size={12} /> {r.roster}/{r.pax}
                                                </span>
                                            )}
                                        </td>
                                        <td className="text-right">
                                            {r.priceSAR !== null && <div className="font-semibold text-navy-800 text-sm">{formatSAR(r.priceSAR)}</div>}
                                            <div className={r.priceSAR !== null ? 'text-[10px] text-gray-500' : 'font-semibold text-navy-800 text-sm'}>
                                                {formatPKR(r.pricePKR)}{isStock && <span className="text-[10px] text-gray-500"> /pax</span>}
                                            </div>
                                        </td>
                                        <td>{isStock
                                            ? <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700">Available</span>
                                            : <span className={statusColors[r.status] || 'badge-navy'}>{statusLabels[r.status] || r.status}</span>}</td>
                                        <td className="text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                {isStock ? (
                                                    <button onClick={() => nav('/fixed-packages')} className="btn-sm btn-primary text-xs flex items-center gap-1" title="Sell this fixed package">
                                                        <MdSell size={14} /> Sell
                                                    </button>
                                                ) : (
                                                    <>
                                                        <button onClick={() => nav(`/packages/view/${r.id}`)} className="btn-icon text-navy-700 hover:bg-navy-50" title="View detail & roster"><MdVisibility size={16} /></button>
                                                        <button onClick={() => nav(`/packages/edit/${r.id}`)} className="btn-icon text-navy-800 hover:bg-navy-50" title="Edit"><MdEdit size={16} /></button>
                                                        <button onClick={() => nav(`/packages/duplicate/${r.id}`)} className="btn-icon text-gold-600 hover:bg-gold-50" title="Duplicate as new draft"><MdContentCopy size={16} /></button>
                                                        <button onClick={() => window.open(`/packages/view/${r.id}/manifest`, '_blank')} className="btn-icon text-gold-600 hover:bg-gold-50" title="Manifest (PDF)"><MdPrint size={16} /></button>
                                                        <button onClick={() => handleDelete(r)} className="btn-icon text-red-500 hover:bg-red-50" title="Cancel"><MdDelete size={16} /></button>
                                                    </>
                                                )}
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
