import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { useCurrency } from '../../context/CurrencyContext';
import toast from 'react-hot-toast';
import {
    MdTrendingUp, MdTrendingDown, MdAccountBalance, MdAccountBalanceWallet,
    MdSavings, MdReceiptLong, MdPersonOutline, MdStorefront,
    MdArrowForward, MdAddBox, MdInsights, MdSwapHoriz
} from 'react-icons/md';

const fmtDate = (v) => v ? new Date(v).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' }) : '—';
const SOURCE_ICON = { client: MdPersonOutline, supplier: MdStorefront, expense: MdReceiptLong };

export default function AccountsDashboard() {
    const nav = useNavigate();
    const { formatPKR } = useCurrency();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                setLoading(true);
                const r = await api.get('/reports/accounts-dashboard');
                setData(r.data.data);
            } catch (e) {
                toast.error(e.response?.data?.message || 'Failed to load dashboard');
            } finally { setLoading(false); }
        })();
    }, []);

    if (loading || !data) return <div className="flex items-center justify-center py-20"><div className="w-12 h-12 border-4 border-navy-800 border-t-gold-500 rounded-full animate-spin" /></div>;

    const k = data.kpis;
    const m = data.month;

    return (
        <div>
            {/* Top KPI cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                <Link to="/ledger" className="stat-card hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="stat-label">Receivable</p>
                            <p className="stat-value text-red-600">{formatPKR(k.totalReceivablePKR)}</p>
                            <p className="text-[10px] text-gray-500">{k.receivableClientCount} clients</p>
                        </div>
                        <div className="stat-icon bg-red-500 text-white"><MdTrendingUp size={22} /></div>
                    </div>
                </Link>
                <Link to="/suppliers" className="stat-card hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="stat-label">Payable</p>
                            <p className="stat-value text-amber-600">{formatPKR(k.totalPayablePKR)}</p>
                            <p className="text-[10px] text-gray-500">{k.payableSupplierCount} suppliers</p>
                        </div>
                        <div className="stat-icon bg-amber-500 text-white"><MdTrendingDown size={22} /></div>
                    </div>
                </Link>
                <Link to="/cash-accounts" className="stat-card hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="stat-label">Cash & Bank</p>
                            <p className="stat-value text-green-700">{formatPKR(k.totalCashOnHand)}</p>
                            <p className="text-[10px] text-gray-500">{k.activeAccountCount} accounts</p>
                        </div>
                        <div className="stat-icon bg-green-600 text-white"><MdSavings size={22} /></div>
                    </div>
                </Link>
                <div className="stat-card border-2 border-navy-800">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="stat-label">Net Position</p>
                            <p className={`stat-value ${k.netPositionPKR >= 0 ? 'text-navy-800' : 'text-red-600'}`}>{formatPKR(k.netPositionPKR)}</p>
                            <p className="text-[10px] text-gray-500">AR + Cash − AP</p>
                        </div>
                        <div className="stat-icon bg-navy-800 text-white"><MdAccountBalance size={22} /></div>
                    </div>
                </div>
            </div>

            {/* This month + quick actions */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
                <div className="card lg:col-span-2">
                    <div className="card-body">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-heading font-bold text-dark flex items-center gap-2"><MdInsights size={18} className="text-gold-500" /> This Month — P&L Snapshot</h3>
                            <Link to="/reports" className="text-xs text-navy-800 hover:underline flex items-center gap-1">Full report <MdArrowForward size={12} /></Link>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div>
                                <p className="text-[11px] text-gray-500">Cash In (clients)</p>
                                <p className="font-bold text-green-700">{formatPKR(m.cashInPKR)}</p>
                            </div>
                            <div>
                                <p className="text-[11px] text-gray-500">Paid Suppliers</p>
                                <p className="font-bold text-red-600">{formatPKR(m.supplierPaidPKR)}</p>
                            </div>
                            <div>
                                <p className="text-[11px] text-gray-500">Operating Exp.</p>
                                <p className="font-bold text-red-600">{formatPKR(m.expensesPKR)}</p>
                            </div>
                            <div>
                                <p className="text-[11px] text-gray-500">Net Cash Flow</p>
                                <p className={`font-bold ${m.netPKR >= 0 ? 'text-navy-800' : 'text-red-600'}`}>{formatPKR(m.netPKR)}</p>
                            </div>
                        </div>

                        {/* Stacked-bar visual */}
                        <div className="mt-4">
                            {(() => {
                                const max = Math.max(m.cashInPKR, m.supplierPaidPKR + m.expensesPKR, 1);
                                const inPct = (m.cashInPKR / max) * 100;
                                const supPct = (m.supplierPaidPKR / max) * 100;
                                const expPct = (m.expensesPKR / max) * 100;
                                return (
                                    <div className="space-y-2">
                                        <div>
                                            <div className="flex justify-between text-[10px] text-gray-500 mb-1"><span>Money In</span><span>{formatPKR(m.cashInPKR)}</span></div>
                                            <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-green-500" style={{ width: `${inPct}%` }} />
                                            </div>
                                        </div>
                                        <div>
                                            <div className="flex justify-between text-[10px] text-gray-500 mb-1"><span>Money Out</span><span>{formatPKR(m.supplierPaidPKR + m.expensesPKR)}</span></div>
                                            <div className="h-4 bg-gray-100 rounded-full overflow-hidden flex">
                                                <div className="h-full bg-red-500" style={{ width: `${supPct}%` }} title={`Suppliers: ${formatPKR(m.supplierPaidPKR)}`} />
                                                <div className="h-full bg-amber-500" style={{ width: `${expPct}%` }} title={`Expenses: ${formatPKR(m.expensesPKR)}`} />
                                            </div>
                                            <div className="flex gap-3 text-[10px] text-gray-500 mt-1">
                                                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-500 inline-block rounded-sm" /> Suppliers</span>
                                                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-500 inline-block rounded-sm" /> Expenses</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>

                <div className="card">
                    <div className="card-body">
                        <h3 className="font-heading font-bold text-dark mb-3 flex items-center gap-2"><MdAccountBalanceWallet size={18} className="text-gold-500" /> Cash by Account</h3>
                        {data.cashByAccount.length === 0 ? (
                            <div className="text-center py-6 text-gray-400 text-sm">
                                <p>No cash accounts set up yet.</p>
                                <Link to="/cash-accounts" className="btn-gold btn-sm inline-flex items-center gap-1 mt-2"><MdAddBox size={14} /> Add Account</Link>
                            </div>
                        ) : (
                            <ul className="space-y-2">
                                {data.cashByAccount.map(a => (
                                    <li key={a._id}>
                                        <Link to={`/cash-accounts/view/${a._id}`} className="flex justify-between items-center px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors">
                                            <span className="text-sm font-semibold text-dark">{a.name}</span>
                                            <span className={`font-bold text-sm ${a.balancePKR > 0 ? 'text-green-700' : a.balancePKR < 0 ? 'text-red-600' : 'text-gray-500'}`}>{formatPKR(a.balancePKR)}</span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            </div>

            {/* Top receivables + payables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
                <div className="card">
                    <div className="card-body">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-heading font-bold text-dark">Top Unpaid Clients</h3>
                            <Link to="/ledger" className="text-xs text-navy-800 hover:underline flex items-center gap-1">All <MdArrowForward size={12} /></Link>
                        </div>
                        {data.topReceivables.length === 0 ? (
                            <p className="text-center py-6 text-sm text-gray-400">No outstanding receivables 🎉</p>
                        ) : (
                            <ul className="divide-y">
                                {data.topReceivables.map(r => (
                                    <li key={`${r.clientType}-${r.clientId}`}>
                                        <Link to={`/ledger/view/${r.clientType}/${r.clientId}`} className="flex justify-between items-center py-2 px-1 hover:bg-gray-50 transition-colors">
                                            <div>
                                                <p className="text-sm font-semibold text-dark">{r.name}</p>
                                                <p className="text-[10px] text-gray-500"><span className={`badge ${r.clientType === 'B2C' ? 'badge-navy' : 'badge-gold'} mr-1`}>{r.clientType}</span>{r.meta || ''}</p>
                                            </div>
                                            <span className="font-bold text-red-600">{formatPKR(r.balancePKR)}</span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                <div className="card">
                    <div className="card-body">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-heading font-bold text-dark">Top Owed Suppliers</h3>
                            <Link to="/suppliers" className="text-xs text-navy-800 hover:underline flex items-center gap-1">All <MdArrowForward size={12} /></Link>
                        </div>
                        {data.topPayables.length === 0 ? (
                            <p className="text-center py-6 text-sm text-gray-400">No outstanding payables 🎉</p>
                        ) : (
                            <ul className="divide-y">
                                {data.topPayables.map(p => (
                                    <li key={p.supplierId}>
                                        <Link to={`/suppliers/view/${p.supplierId}`} className="flex justify-between items-center py-2 px-1 hover:bg-gray-50 transition-colors">
                                            <div>
                                                <p className="text-sm font-semibold text-dark">{p.name}</p>
                                                <p className="text-[10px] text-gray-500 capitalize">{p.type}</p>
                                            </div>
                                            <span className="font-bold text-amber-600">{formatPKR(p.balancePKR)}</span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            </div>

            {/* Recent transactions */}
            <div className="card mb-5">
                <div className="card-body">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-heading font-bold text-dark flex items-center gap-2"><MdSwapHoriz size={18} className="text-gold-500" /> Recent Transactions</h3>
                    </div>
                    {data.recentTransactions.length === 0 ? (
                        <p className="text-center py-6 text-sm text-gray-400">No transactions recorded yet.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table">
                                <thead>
                                    <tr><th>Date</th><th>Source</th><th>Party</th><th>Description</th><th>Account</th><th className="text-right">Amount</th></tr>
                                </thead>
                                <tbody>
                                    {data.recentTransactions.map(t => {
                                        const Icon = SOURCE_ICON[t.source];
                                        const isOut = t.direction === 'out';
                                        const isIn = t.direction === 'in';
                                        return (
                                            <tr key={`${t.source}-${t._id}`}>
                                                <td className="text-sm">{fmtDate(t.date)}</td>
                                                <td><span className="flex items-center gap-1 text-xs capitalize"><Icon size={14} /> {t.source}</span></td>
                                                <td className="text-sm font-semibold">{t.party}</td>
                                                <td className="text-xs text-gray-600">{t.description}</td>
                                                <td className="text-xs">{t.account || <span className="text-gray-400">—</span>}</td>
                                                <td className={`text-right font-bold ${isIn ? 'text-green-700' : isOut ? 'text-red-600' : 'text-amber-600'}`}>
                                                    {isIn ? '+' : isOut ? '−' : ''} {formatPKR(t.amountPKR)}
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

            {/* Quick links footer */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                <Link to="/ledger" className="btn-ghost text-center py-3">💰 Receivables</Link>
                <Link to="/suppliers" className="btn-ghost text-center py-3">📉 Payables</Link>
                <Link to="/expenses" className="btn-ghost text-center py-3">🧾 Expenses</Link>
                <Link to="/cash-accounts" className="btn-ghost text-center py-3">🏦 Cash & Bank</Link>
                <Link to="/reports" className="btn-ghost text-center py-3">📈 Reports</Link>
            </div>
        </div>
    );
}
