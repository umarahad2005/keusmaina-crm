import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import { MdSearch, MdWarning, MdEvent, MdAssignment } from 'react-icons/md';

const STATUS_LABELS = {
    not_started: { label: 'Not Started', cls: 'bg-gray-100 text-gray-700 border-gray-200' },
    passport_collected: { label: 'Passport In', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    mofa_submitted: { label: 'MOFA Submitted', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    mofa_approved: { label: 'MOFA Approved', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    visa_issued: { label: 'Visa Issued ✓', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    cancelled: { label: 'Cancelled', cls: 'bg-red-50 text-red-700 border-red-200' }
};

const PASSPORT_FLAG_LABELS = {
    missing: { label: 'No Passport', cls: 'bg-red-100 text-red-700 border-red-300', icon: MdWarning },
    expired: { label: 'Expired', cls: 'bg-red-100 text-red-700 border-red-300', icon: MdWarning },
    expiring_soon: { label: 'Expiring < 6mo', cls: 'bg-orange-100 text-orange-700 border-orange-300', icon: MdEvent }
};

const fmtDate = (v) => v ? new Date(v).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function VisaTracker() {
    const [rows, setRows] = useState([]);
    const [counts, setCounts] = useState({});
    const [flagCounts, setFlagCounts] = useState({});
    const [loading, setLoading] = useState(true);

    const [statusFilter, setStatusFilter] = useState('');
    const [packageStatus, setPackageStatus] = useState('active');
    const [search, setSearch] = useState('');
    const [departureFrom, setDepartureFrom] = useState('');
    const [departureTo, setDepartureTo] = useState('');

    const fetchData = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (statusFilter) params.set('status', statusFilter);
            params.set('packageStatus', packageStatus);
            if (search) params.set('search', search);
            if (departureFrom) params.set('departureFrom', departureFrom);
            if (departureTo) params.set('departureTo', departureTo);
            const res = await api.get(`/visas?${params.toString()}`);
            setRows(res.data.data);
            setCounts(res.data.statusCounts || {});
            setFlagCounts(res.data.passportFlagCounts || {});
        } catch { toast.error('Failed to load visa tracker'); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [statusFilter, packageStatus]);

    const onSearch = (e) => { e.preventDefault(); fetchData(); };

    const totalActionable = (counts.not_started || 0) + (counts.passport_collected || 0) + (counts.mofa_submitted || 0) + (counts.mofa_approved || 0);
    const issued = counts.visa_issued || 0;
    const flagsTotal = Object.values(flagCounts).reduce((a, b) => a + b, 0);

    return (
        <div>
            {/* Header */}
            <div className="page-header">
                <div>
                    <h2 className="page-title">Visa Tracker</h2>
                    <p className="page-subtitle">Cross-package view of every pilgrim's visa status</p>
                </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="stat-card">
                    <div className="flex items-center justify-between">
                        <div><p className="stat-label">Pending Action</p><p className="stat-value text-amber-600">{totalActionable}</p></div>
                        <div className="stat-icon bg-amber-500 text-white"><MdAssignment size={22} /></div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="flex items-center justify-between">
                        <div><p className="stat-label">Visas Issued</p><p className="stat-value text-green-700">{issued}</p></div>
                        <div className="stat-icon bg-green-600 text-white">✓</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="flex items-center justify-between">
                        <div><p className="stat-label">Passport Issues</p><p className="stat-value text-red-600">{flagsTotal}</p></div>
                        <div className="stat-icon bg-red-500 text-white"><MdWarning size={22} /></div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="flex items-center justify-between">
                        <div><p className="stat-label">Total Pilgrims</p><p className="stat-value text-navy-800">{rows.length}</p></div>
                        <div className="stat-icon bg-navy-800 text-white">👥</div>
                    </div>
                </div>
            </div>

            {/* Status pill filters */}
            <div className="flex flex-wrap gap-2 mb-3">
                <button onClick={() => setStatusFilter('')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${!statusFilter ? 'bg-navy-800 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    All ({rows.length})
                </button>
                {Object.entries(STATUS_LABELS).map(([k, meta]) => (
                    <button key={k} onClick={() => setStatusFilter(k)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${statusFilter === k ? 'ring-2 ring-navy-800 ' + meta.cls : meta.cls}`}>
                        {meta.label} ({counts[k] || 0})
                    </button>
                ))}
            </div>

            {/* Filters bar */}
            <form onSubmit={onSearch} className="grid grid-cols-1 sm:grid-cols-5 gap-2 mb-4 p-3 bg-white rounded-xl border border-gray-200">
                <div className="sm:col-span-2 relative">
                    <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, passport, voucher..." className="search-input w-full" />
                </div>
                <div>
                    <select value={packageStatus} onChange={e => setPackageStatus(e.target.value)} className="select text-sm">
                        <option value="active">Active packages</option>
                        <option value="all">All statuses</option>
                        <option value="confirmed">Confirmed only</option>
                        <option value="completed">Completed only</option>
                    </select>
                </div>
                <div>
                    <input type="date" value={departureFrom} onChange={e => setDepartureFrom(e.target.value)} placeholder="Dep from" className="input text-sm" />
                </div>
                <div className="flex gap-1">
                    <input type="date" value={departureTo} onChange={e => setDepartureTo(e.target.value)} placeholder="Dep to" className="input text-sm flex-1" />
                    <button type="submit" className="btn-gold btn-sm">Apply</button>
                </div>
            </form>

            {/* Table */}
            <div className="table-container">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-10 h-10 border-4 border-navy-800 border-t-gold-500 rounded-full animate-spin" />
                    </div>
                ) : rows.length === 0 ? (
                    <div className="text-center py-16">
                        <p className="text-gray-400 text-lg mb-1">No pilgrims match these filters</p>
                        <p className="text-gray-300 text-sm">Try widening the date range or clearing the search.</p>
                    </div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Pilgrim</th>
                                <th>Package</th>
                                <th>Departure</th>
                                <th>Passport</th>
                                <th>Visa Status</th>
                                <th>Visa #</th>
                                <th>MOFA Date</th>
                                <th>Issued</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(r => {
                                const statusMeta = STATUS_LABELS[r.visaStatus] || STATUS_LABELS.not_started;
                                const flagMeta = r.passportFlag ? PASSPORT_FLAG_LABELS[r.passportFlag] : null;
                                const Flag = flagMeta?.icon;
                                return (
                                    <tr key={r.entryId}>
                                        <td>
                                            <div className="font-semibold">{r.fullName}</div>
                                            <div className="text-xs text-gray-500">{r.gender} · {r.phone || '—'}</div>
                                        </td>
                                        <td>
                                            <Link to={`/packages/view/${r.packageId}`} className="text-navy-800 hover:underline font-mono text-sm">{r.voucherId}</Link>
                                            <div className="text-xs text-gray-500 truncate max-w-[200px]">{r.packageName}</div>
                                        </td>
                                        <td className="text-sm">{fmtDate(r.departure)}</td>
                                        <td>
                                            <div className="text-sm font-mono">{r.passportNumber || '—'}</div>
                                            <div className="text-xs text-gray-500">exp {fmtDate(r.passportExpiry)}</div>
                                            {flagMeta && (
                                                <div className={`inline-flex items-center gap-1 text-[10px] font-semibold border rounded px-1.5 py-0.5 mt-1 ${flagMeta.cls}`}>
                                                    {Flag && <Flag size={10} />} {flagMeta.label}
                                                </div>
                                            )}
                                        </td>
                                        <td>
                                            <span className={`inline-block text-[11px] font-semibold border rounded-full px-2 py-0.5 ${statusMeta.cls}`}>{statusMeta.label}</span>
                                        </td>
                                        <td className="text-xs font-mono">{r.visaNumber || '—'}</td>
                                        <td className="text-xs">{fmtDate(r.mofaApplicationDate)}</td>
                                        <td className="text-xs">{fmtDate(r.visaIssuedDate)}</td>
                                        <td className="text-right">
                                            <Link to={`/packages/view/${r.packageId}`} className="text-navy-800 hover:underline text-xs font-semibold">Open →</Link>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
