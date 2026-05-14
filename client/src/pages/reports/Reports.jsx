import { useState, useEffect } from 'react';
import api from '../../utils/api';
import { useCurrency } from '../../context/CurrencyContext';
import toast from 'react-hot-toast';
import {
    MdInventory, MdPeople, MdAccountBalance, MdFlight, MdHotel,
    MdTrendingUp, MdTrendingDown, MdReceiptLong, MdShowChart
} from 'react-icons/md';

const CAT_LABEL = {
    rent: 'Rent', salaries: 'Salaries', utilities: 'Utilities', marketing: 'Marketing',
    office_supplies: 'Office Supplies', communication: 'Communication', maintenance: 'Maintenance',
    legal_professional: 'Legal/Pro', travel_local: 'Local Travel', bank_charges: 'Bank Charges', other: 'Other'
};
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (k) => { const [y, m] = k.split('-'); return `${MONTH_NAMES[parseInt(m) - 1]} ${y.slice(2)}`; };

const ymd = (d) => d.toISOString().slice(0, 10);
const startOfYear = () => ymd(new Date(new Date().getFullYear(), 0, 1));
const today = () => ymd(new Date());

export default function Reports() {
    const [tab, setTab] = useState('pnl');
    const [overview, setOverview] = useState(null);
    const [pnl, setPnl] = useState(null);
    const [loading, setLoading] = useState(true);
    const [from, setFrom] = useState(startOfYear());
    const [to, setTo] = useState(today());
    const { formatPKR } = useCurrency();

    const fetchOverview = async () => {
        try { const r = await api.get('/reports/overview'); setOverview(r.data.data); }
        catch { toast.error('Failed to load overview'); }
    };
    const fetchPnl = async () => {
        try { const r = await api.get(`/reports/pnl?from=${from}&to=${to}`); setPnl(r.data.data); }
        catch { toast.error('Failed to load P&L'); }
    };

    useEffect(() => {
        (async () => {
            setLoading(true);
            await Promise.all([fetchOverview(), fetchPnl()]);
            setLoading(false);
        })();
        // eslint-disable-next-line
    }, []);

    const applyDates = async () => { setLoading(true); await fetchPnl(); setLoading(false); };

    if (loading && !pnl) return (
        <div className="flex items-center justify-center py-20">
            <div className="w-12 h-12 border-4 border-navy-800 border-t-gold-500 rounded-full animate-spin" />
        </div>
    );

    return (
        <div>
            {/* Tabs */}
            <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1 w-fit">
                <button onClick={() => setTab('pnl')} className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-1 ${tab === 'pnl' ? 'bg-white text-navy-800 shadow-sm' : 'text-gray-500'}`}>
                    <MdShowChart size={16} /> Profit & Loss
                </button>
                <button onClick={() => setTab('overview')} className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${tab === 'overview' ? 'bg-white text-navy-800 shadow-sm' : 'text-gray-500'}`}>
                    📊 Overview
                </button>
            </div>

            {tab === 'pnl' && pnl && <PnLView pnl={pnl} from={from} to={to} setFrom={setFrom} setTo={setTo} applyDates={applyDates} formatPKR={formatPKR} loading={loading} />}
            {tab === 'overview' && overview && <OverviewView overview={overview} formatPKR={formatPKR} />}
        </div>
    );
}

function PnLView({ pnl, from, to, setFrom, setTo, applyDates, formatPKR, loading }) {
    const series = pnl.series || [];
    const maxBar = Math.max(1, ...series.flatMap(s => [s.revenuePKR, s.cogsPKR, s.opexPKR]));

    return (
        <div>
            {/* Date filter */}
            <div className="card mb-4">
                <div className="card-body grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <div><label className="label text-xs">From</label>
                        <input type="date" className="input" value={from} onChange={e => setFrom(e.target.value)} /></div>
                    <div><label className="label text-xs">To</label>
                        <input type="date" className="input" value={to} onChange={e => setTo(e.target.value)} /></div>
                    <div className="sm:col-span-2 flex items-end gap-2">
                        <button onClick={applyDates} disabled={loading} className="btn-gold">Apply</button>
                        <button onClick={() => { setFrom(startOfYear()); setTo(today()); setTimeout(applyDates, 0); }} className="btn-outline btn-sm">YTD</button>
                        <button onClick={() => { const d = new Date(); d.setMonth(d.getMonth() - 1); setFrom(ymd(d)); setTo(today()); setTimeout(applyDates, 0); }} className="btn-outline btn-sm">Last 30 days</button>
                    </div>
                </div>
            </div>

            {/* Top P&L cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="stat-card">
                    <div className="flex items-center justify-between">
                        <div><p className="stat-label">Revenue (Booked)</p><p className="stat-value text-green-700 text-base">{formatPKR(pnl.revenue.bookedPKR)}</p>
                            <p className="text-[10px] text-gray-500">{pnl.revenue.bookedCount} package(s) · cash {formatPKR(pnl.revenue.cashReceivedPKR)}</p></div>
                        <div className="stat-icon bg-green-600 text-white"><MdTrendingUp size={20} /></div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="flex items-center justify-between">
                        <div><p className="stat-label">Cost of Goods (Supplier)</p><p className="stat-value text-red-600 text-base">{formatPKR(pnl.cogs.invoicedPKR)}</p>
                            <p className="text-[10px] text-gray-500">paid {formatPKR(pnl.cogs.paidPKR)}</p></div>
                        <div className="stat-icon bg-red-500 text-white"><MdTrendingDown size={20} /></div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="flex items-center justify-between">
                        <div><p className="stat-label">Operating Expenses</p><p className="stat-value text-amber-700 text-base">{formatPKR(pnl.opex.totalPKR)}</p>
                            <p className="text-[10px] text-gray-500">{pnl.opex.count} entr{pnl.opex.count === 1 ? 'y' : 'ies'}</p></div>
                        <div className="stat-icon bg-amber-500 text-white"><MdReceiptLong size={20} /></div>
                    </div>
                </div>
                <div className="stat-card">
                    <p className="stat-label">Net Profit</p>
                    <p className={`stat-value text-base ${pnl.netProfitPKR >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatPKR(pnl.netProfitPKR)}</p>
                    <p className="text-[10px] text-gray-500">Net margin {pnl.netMarginPct}% · Gross {pnl.grossMarginPct}%</p>
                </div>
            </div>

            {/* P&L formula card */}
            <div className="card mb-4 bg-navy-50/30">
                <div className="card-body py-3">
                    <p className="text-xs text-center text-gray-700">
                        <span className="text-green-700 font-semibold">{formatPKR(pnl.revenue.bookedPKR)}</span> Revenue
                        <span className="mx-2 text-gray-400">−</span>
                        <span className="text-red-600 font-semibold">{formatPKR(pnl.cogs.invoicedPKR)}</span> COGS
                        <span className="mx-2 text-gray-400">=</span>
                        <span className="font-semibold">{formatPKR(pnl.grossProfitPKR)}</span> Gross
                        <span className="mx-2 text-gray-400">−</span>
                        <span className="text-amber-700 font-semibold">{formatPKR(pnl.opex.totalPKR)}</span> Opex
                        <span className="mx-2 text-gray-400">=</span>
                        <span className={`font-bold text-base ${pnl.netProfitPKR >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatPKR(pnl.netProfitPKR)}</span> Net
                    </p>
                </div>
            </div>

            {/* 12-month chart */}
            <div className="card mb-4">
                <div className="card-header"><h3 className="font-heading font-bold text-dark">12-Month Trend</h3></div>
                <div className="card-body overflow-x-auto">
                    <div className="flex items-end gap-2 min-h-[180px]" style={{ minWidth: 600 }}>
                        {series.map((s, i) => {
                            const h = (val) => Math.max(2, Math.round((val / maxBar) * 150));
                            return (
                                <div key={i} className="flex-1 flex flex-col items-center min-w-[40px]">
                                    <div className="w-full flex items-end justify-center gap-0.5 h-[160px]">
                                        <div className="w-2.5 bg-green-500" style={{ height: h(s.revenuePKR) }} title={`Revenue ${formatPKR(s.revenuePKR)}`} />
                                        <div className="w-2.5 bg-red-400" style={{ height: h(s.cogsPKR) }} title={`COGS ${formatPKR(s.cogsPKR)}`} />
                                        <div className="w-2.5 bg-amber-400" style={{ height: h(s.opexPKR) }} title={`Opex ${formatPKR(s.opexPKR)}`} />
                                    </div>
                                    <div className="text-[10px] text-gray-500 mt-1">{monthLabel(s.month)}</div>
                                    <div className={`text-[10px] font-semibold ${s.netPKR >= 0 ? 'text-green-700' : 'text-red-600'}`}>{s.netPKR >= 0 ? '+' : ''}{(s.netPKR / 1000).toFixed(0)}k</div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="flex gap-4 justify-center mt-3 text-xs">
                        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-500" /> Revenue</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-400" /> COGS</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-amber-400" /> Opex</span>
                    </div>
                </div>
            </div>

            {/* Opex breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                <div className="card">
                    <div className="card-header"><h3 className="font-heading font-bold text-dark">Operating Expenses by Category</h3></div>
                    <div className="card-body">
                        {pnl.opex.byCategory.length === 0 ? <p className="text-sm text-gray-400">No expenses in this period</p> : (
                            <div className="space-y-2">
                                {pnl.opex.byCategory.map(c => {
                                    const pct = pnl.opex.totalPKR > 0 ? (c.total / pnl.opex.totalPKR) * 100 : 0;
                                    return (
                                        <div key={c.category}>
                                            <div className="flex justify-between text-sm">
                                                <span>{CAT_LABEL[c.category] || c.category}</span>
                                                <span className="font-semibold">{formatPKR(c.total)} <span className="text-gray-400 text-xs">({Math.round(pct)}%)</span></span>
                                            </div>
                                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden mt-1">
                                                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${pct}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                <div className="card">
                    <div className="card-header"><h3 className="font-heading font-bold text-dark">Cash Flow View</h3></div>
                    <div className="card-body space-y-2 text-sm">
                        <div className="flex justify-between"><span>Cash received from clients</span><span className="font-semibold text-green-700">{formatPKR(pnl.revenue.cashReceivedPKR)}</span></div>
                        <div className="flex justify-between"><span>Cash paid to suppliers</span><span className="font-semibold text-red-600">−{formatPKR(pnl.cogs.paidPKR)}</span></div>
                        <div className="flex justify-between"><span>Operating expenses</span><span className="font-semibold text-amber-700">−{formatPKR(pnl.opex.totalPKR)}</span></div>
                        <div className="flex justify-between border-t pt-2 mt-2 text-base">
                            <span className="font-bold">Net Cash Flow</span>
                            <span className={`font-bold ${pnl.netCashFlowPKR >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatPKR(pnl.netCashFlowPKR)}</span>
                        </div>
                        <p className="text-[10px] text-gray-500 pt-2">Cash basis (actual money movements). Above the chart is accrual basis (booked revenue & received invoices).</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

function OverviewView({ overview, formatPKR }) {
    const { counts, financial, packageByType, packageByStatus, monthlyRevenue } = overview;
    const statCards = [
        { label: 'Total Packages', value: counts.packages, icon: MdInventory, color: 'bg-navy-800', text: 'text-navy-800' },
        { label: 'B2C Pilgrims', value: counts.b2cClients, icon: MdPeople, color: 'bg-green-700', text: 'text-green-700' },
        { label: 'B2B Agents', value: counts.b2bClients, icon: MdAccountBalance, color: 'bg-indigo-600', text: 'text-indigo-600' },
        { label: 'Airlines', value: counts.airlines, icon: MdFlight, color: 'bg-blue-600', text: 'text-blue-600' },
        { label: 'Hotels (Makkah)', value: counts.hotelsMakkah, icon: MdHotel, color: 'bg-gold-500', text: 'text-gold-600' },
        { label: 'Hotels (Madinah)', value: counts.hotelsMadinah, icon: MdHotel, color: 'bg-teal-600', text: 'text-teal-600' },
    ];
    return (
        <div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <div className="card bg-gradient-to-r from-green-700 to-green-600 text-white">
                    <div className="p-6 flex items-center justify-between">
                        <div><p className="text-green-100 text-sm">Total Revenue Collected</p><p className="text-3xl font-heading font-bold mt-1">{formatPKR(financial.revenue)}</p></div>
                        <MdTrendingUp size={40} className="text-green-200" />
                    </div>
                </div>
                <div className="card bg-gradient-to-r from-red-600 to-red-500 text-white">
                    <div className="p-6 flex items-center justify-between">
                        <div><p className="text-red-100 text-sm">Outstanding Balance</p><p className="text-3xl font-heading font-bold mt-1">{formatPKR(financial.outstanding)}</p></div>
                        <MdTrendingDown size={40} className="text-red-200" />
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                {statCards.map((stat, i) => {
                    const Icon = stat.icon;
                    return (
                        <div key={i} className="stat-card text-center">
                            <div className={`w-10 h-10 rounded-xl ${stat.color} text-white flex items-center justify-center mx-auto mb-2`}><Icon size={20} /></div>
                            <p className={`text-2xl font-bold ${stat.text}`}>{stat.value}</p>
                            <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
                        </div>
                    );
                })}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="card">
                    <div className="card-header"><h3 className="font-heading font-bold text-dark">Packages by Type</h3></div>
                    <div className="card-body">
                        {packageByType.length === 0 ? <p className="text-gray-400 text-sm">No packages yet</p> : (
                            <div className="space-y-3">
                                {packageByType.map((item, i) => (
                                    <div key={i} className="flex items-center justify-between">
                                        <span className="badge-navy">{item._id || 'Unknown'}</span>
                                        <div className="flex items-center gap-3">
                                            <div className="w-32 h-3 bg-gray-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-gradient-to-r from-navy-800 to-gold-500 rounded-full" style={{ width: `${(item.count / counts.packages) * 100}%` }} />
                                            </div>
                                            <span className="font-bold text-navy-800 w-8 text-right">{item.count}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                <div className="card">
                    <div className="card-header"><h3 className="font-heading font-bold text-dark">Packages by Status</h3></div>
                    <div className="card-body">
                        {packageByStatus.length === 0 ? <p className="text-gray-400 text-sm">No packages yet</p> : (
                            <div className="space-y-3">
                                {packageByStatus.map((item, i) => {
                                    const colors = { draft: 'bg-gray-400', confirmed: 'bg-green-500', completed: 'bg-gold-500', cancelled: 'bg-red-400' };
                                    return (
                                        <div key={i} className="flex items-center justify-between">
                                            <span className="capitalize font-medium text-sm">{item._id}</span>
                                            <div className="flex items-center gap-3">
                                                <div className="w-32 h-3 bg-gray-100 rounded-full overflow-hidden">
                                                    <div className={`h-full rounded-full ${colors[item._id] || 'bg-navy-800'}`} style={{ width: `${(item.count / counts.packages) * 100}%` }} />
                                                </div>
                                                <span className="font-bold text-navy-800 w-8 text-right">{item.count}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
