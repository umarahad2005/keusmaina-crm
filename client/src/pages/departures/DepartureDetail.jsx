import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../../utils/api';
import { useCurrency } from '../../context/CurrencyContext';
import toast from 'react-hot-toast';
import { MdArrowBack, MdEdit, MdPrint, MdAdd, MdGroups } from 'react-icons/md';

const statusColors = {
    planning: 'badge-navy', open: 'badge-active', closed: 'badge-gold',
    completed: 'badge-gold', cancelled: 'badge-inactive',
    draft: 'badge-navy', quoted: 'badge-navy',
    confirmed: 'badge-active', deposit_received: 'badge-active',
    fully_paid: 'badge-gold'
};

const fmtDate = (v) => v ? new Date(v).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function DepartureDetail() {
    const { id } = useParams();
    const nav = useNavigate();
    const { formatSAR, formatPKR, convertToPKR } = useCurrency();
    const [dep, setDep] = useState(null);
    const [profit, setProfit] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const [r, p] = await Promise.all([
                    api.get(`/departures/${id}`),
                    api.get(`/departures/${id}/profit`).catch(() => null)
                ]);
                setDep(r.data.data);
                if (p) setProfit(p.data.data);
            } catch { toast.error('Failed to load departure'); nav('/departures'); }
            finally { setLoading(false); }
        })();
    }, [id, nav]);

    if (loading || !dep) return <div className="flex items-center justify-center py-20"><div className="w-10 h-10 border-4 border-navy-800 border-t-gold-500 rounded-full animate-spin" /></div>;

    const totalBooked = dep.packages.reduce((s, p) => s + (p.numberOfPilgrims || 0), 0);
    const totalNamed = dep.packages.reduce((s, p) => s + (p.pilgrims?.length || 0), 0);
    const totalRevenueSAR = dep.packages.reduce((s, p) => s + (p.pricingSummary?.finalPriceSAR || 0), 0);
    const cap = dep.capacity || 0;
    const capTone = cap === 0 ? 'text-gray-700' : totalBooked > cap ? 'text-red-600' : totalBooked === cap ? 'text-orange-600' : 'text-green-700';

    return (
        <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-4">
                <button onClick={() => nav('/departures')} className="btn-ghost flex items-center gap-1"><MdArrowBack size={16} /> Departures</button>
                <div className="flex gap-2">
                    <button onClick={() => nav(`/departures/edit/${id}`)} className="btn-outline btn-sm flex items-center gap-1"><MdEdit size={14} /> Edit</button>
                    <button onClick={() => window.open(`/departures/view/${id}/manifest`, '_blank')} className="btn-outline btn-sm flex items-center gap-1"><MdPrint size={14} /> Group Manifest</button>
                    <button onClick={() => nav(`/packages/new?departure=${id}`)} className="btn-gold btn-sm flex items-center gap-1"><MdAdd size={14} /> New Package in this Batch</button>
                </div>
            </div>

            {/* Summary */}
            <div className="card mb-4">
                <div className="card-body">
                    <div className="flex flex-wrap items-baseline gap-3 mb-3">
                        <span className="font-mono font-bold text-navy-800">{dep.code}</span>
                        <h1 className="text-xl font-heading font-bold text-dark">{dep.name}</h1>
                        <span className={statusColors[dep.status] || 'badge-navy'}>{dep.status}</span>
                        {dep.season && <span className="badge-gold">{dep.season}</span>}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-4">
                        <div><p className="text-gray-500 text-xs">Departure</p><p className="font-semibold">{fmtDate(dep.travelDates?.departure)}</p></div>
                        <div><p className="text-gray-500 text-xs">Return</p><p className="font-semibold">{fmtDate(dep.travelDates?.returnDate)}</p></div>
                        <div><p className="text-gray-500 text-xs">Packages</p><p className="font-semibold">{dep.packages.length}</p></div>
                        <div><p className="text-gray-500 text-xs">Booker Count</p><p className="font-semibold">{new Set(dep.packages.map(p => String(p.client?._id || p.client))).size}</p></div>
                    </div>

                    {/* Capacity meter */}
                    {(() => {
                        const pct = cap > 0 ? Math.min(100, (totalBooked / cap) * 100) : 0;
                        const isOverbooked = cap > 0 && totalBooked > cap;
                        const isFull = cap > 0 && totalBooked === cap;
                        const tone = isOverbooked ? 'from-red-500 to-red-700' : isFull ? 'from-orange-500 to-orange-700' : pct >= 80 ? 'from-amber-400 to-orange-500' : 'from-emerald-400 to-emerald-600';
                        const remaining = cap > 0 ? Math.max(0, cap - totalBooked) : null;
                        return (
                            <div className={`p-4 rounded-xl border ${isOverbooked ? 'bg-red-50 border-red-300' : isFull ? 'bg-orange-50 border-orange-300' : pct >= 80 ? 'bg-amber-50 border-amber-300' : 'bg-emerald-50 border-emerald-300'}`}>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <MdGroups size={20} className={isOverbooked ? 'text-red-700' : isFull ? 'text-orange-700' : 'text-emerald-700'} />
                                        <span className="font-bold text-sm">Group Capacity</span>
                                    </div>
                                    <div className="text-right">
                                        <span className={`font-bold text-lg ${capTone}`}>{totalBooked}</span>
                                        <span className="text-gray-500 text-sm"> / {cap || '∞'} seats</span>
                                        {remaining !== null && <span className="ml-2 text-xs text-gray-600">({remaining} left)</span>}
                                    </div>
                                </div>
                                {cap > 0 ? (
                                    <>
                                        <div className="h-3 bg-white/70 rounded-full overflow-hidden">
                                            <div className={`h-full bg-gradient-to-r ${tone} transition-all`} style={{ width: `${pct}%` }} />
                                        </div>
                                        <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                                            <span>Named: {totalNamed} pilgrim{totalNamed === 1 ? '' : 's'} on roster</span>
                                            <span className="font-semibold">
                                                {isOverbooked ? `⚠ Overbooked by ${totalBooked - cap}` : isFull ? '🟠 Group is full' : `${Math.round(pct)}% filled`}
                                            </span>
                                        </div>
                                    </>
                                ) : (
                                    <p className="text-xs text-gray-600 italic">No capacity set on this group. Edit the group to add one and track filling progress.</p>
                                )}
                            </div>
                        );
                    })()}
                </div>
            </div>

            {/* Batch profit */}
            {profit && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <div className="stat-card"><p className="stat-label">Batch Revenue</p><p className="stat-value text-navy-800 text-base">{formatPKR(profit.totalRevenuePKR)}</p></div>
                    <div className="stat-card">
                        <p className="stat-label">Total Cost</p>
                        <p className="stat-value text-red-600 text-base">{formatPKR(profit.totalCostPKR)}</p>
                        <p className="text-[10px] text-gray-500">Direct {formatPKR(profit.directCostPKR)} · Shared {formatPKR(profit.sharedCostPKR)}</p>
                    </div>
                    <div className="stat-card"><p className="stat-label">Batch Profit</p><p className={`stat-value text-base ${profit.profitPKR >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatPKR(profit.profitPKR)}</p></div>
                    <div className="stat-card">
                        <p className="stat-label">Margin</p>
                        <p className={`stat-value text-base ${profit.marginPct >= 0 ? 'text-green-700' : 'text-red-600'}`}>{profit.marginPct}%</p>
                        {profit.totalCostPKR === 0 && <p className="text-[10px] text-orange-600">⚠ no costs recorded yet</p>}
                    </div>
                </div>
            )}

            {/* Components */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <div className="stat-card">
                    <p className="stat-label">Flight</p>
                    <p className="font-semibold text-sm">{dep.components?.airline?.name || '—'} {dep.components?.airline?.flightNumber}</p>
                    <p className="text-xs text-gray-500">{dep.components?.airline?.departureCity} → {dep.components?.airline?.arrivalCity}</p>
                </div>
                <div className="stat-card">
                    <p className="stat-label">Makkah</p>
                    <p className="font-semibold text-sm">{dep.components?.makkahHotel?.hotel?.name || '—'}</p>
                    <p className="text-xs text-gray-500">{dep.components?.makkahHotel?.roomType || ''} · {dep.components?.makkahHotel?.nights || 0} nights</p>
                </div>
                <div className="stat-card">
                    <p className="stat-label">Madinah</p>
                    <p className="font-semibold text-sm">{dep.components?.madinahHotel?.hotel?.name || '—'}</p>
                    <p className="text-xs text-gray-500">{dep.components?.madinahHotel?.roomType || ''} · {dep.components?.madinahHotel?.nights || 0} nights</p>
                </div>
            </div>

            {/* Linked packages */}
            <div className="card">
                <div className="card-body">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <h2 className="text-lg font-heading font-bold text-dark">Linked Packages</h2>
                            <p className="text-xs text-gray-500">All packages booked under this departure batch</p>
                        </div>
                        <p className="text-sm text-navy-800 font-semibold">Total revenue: {formatSAR(totalRevenueSAR)}</p>
                    </div>

                    {dep.packages.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                            <p className="text-lg mb-1">No packages booked yet</p>
                            <p className="text-sm">Click "New Package in this Batch" to add the first booking.</p>
                        </div>
                    ) : (
                        <div className="table-container">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Voucher</th>
                                        <th>Package</th>
                                        <th>Status</th>
                                        <th>Booker</th>
                                        <th>Pilgrims</th>
                                        <th>Total</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {dep.packages.map(p => {
                                        const isCancelled = p.status === 'cancelled';
                                        const rosterActual = p.pilgrims?.length || 0;
                                        const rosterTone = rosterActual === p.numberOfPilgrims ? 'text-green-700' : rosterActual < p.numberOfPilgrims ? 'text-orange-600' : 'text-red-600';
                                        return (
                                            <tr key={p._id} className={isCancelled ? 'opacity-50' : ''}>
                                                <td><Link to={`/packages/view/${p._id}`} className="font-mono font-bold text-navy-800 hover:underline">{p.voucherId}</Link></td>
                                                <td>{p.packageName}</td>
                                                <td><span className={statusColors[p.status] || 'badge-navy'}>{p.status}</span></td>
                                                <td>
                                                    {p.client ? (
                                                        <Link to={`/clients/view/${p.clientType || 'B2C'}/${p.client._id}`} className="text-navy-800 hover:underline">
                                                            {p.client.fullName || p.client.companyName}
                                                        </Link>
                                                    ) : '—'}
                                                </td>
                                                <td className={`text-sm font-semibold ${rosterTone}`}>{rosterActual} / {p.numberOfPilgrims}</td>
                                                <td className="text-sm">
                                                    <div>{formatSAR(p.pricingSummary?.finalPriceSAR)}</div>
                                                    <div className="text-xs text-gray-500">{formatPKR(convertToPKR(p.pricingSummary?.finalPriceSAR || 0))}</div>
                                                </td>
                                                <td className="text-right">
                                                    <Link to={`/packages/view/${p._id}`} className="text-navy-800 hover:underline text-xs font-semibold">Open →</Link>
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
        </div>
    );
}
