import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../../utils/api';
import { useCurrency } from '../../context/CurrencyContext';
import toast from 'react-hot-toast';
import {
    MdArrowBack, MdEdit, MdInventory, MdAccountBalance, MdTrendingUp, MdTrendingDown,
    MdAttachFile, MdLocalPhone, MdLocationCity, MdBadge, MdGroups, MdAdd, MdHistory, MdAssignmentInd
} from 'react-icons/md';

const statusColors = {
    draft: 'badge-navy', quoted: 'badge-navy',
    confirmed: 'badge-active', deposit_received: 'badge-active',
    fully_paid: 'badge-gold', completed: 'badge-gold',
    cancelled: 'badge-inactive'
};
const statusLabels = {
    draft: 'Draft', quoted: 'Quoted', confirmed: 'Confirmed',
    deposit_received: 'Deposit In', fully_paid: 'Fully Paid',
    completed: 'Completed', cancelled: 'Cancelled'
};

const fmtDate = (v) => v ? new Date(v).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// Combined profile for a single client (B2C or B2B) — packages, ledger summary,
// recent activity, documents. Reached from Clients list "View profile" action
// and from the receivables ledger drill-in.
export default function ClientProfile() {
    const { clientType, id } = useParams();
    const nav = useNavigate();
    const { formatPKR, formatSAR, convertToPKR } = useCurrency();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                setLoading(true);
                const r = await api.get(`/clients/profile/${clientType}/${id}`);
                setData(r.data.data);
            } catch (e) {
                toast.error(e.response?.data?.message || 'Failed to load profile');
                nav('/clients');
            } finally { setLoading(false); }
        })();
    }, [id, clientType, nav]);

    if (loading || !data) return <div className="flex items-center justify-center py-20"><div className="w-10 h-10 border-4 border-navy-800 border-t-gold-500 rounded-full animate-spin" /></div>;

    const c = data.client;
    const isB2C = clientType === 'B2C';
    const name = isB2C ? c.fullName : c.companyName;
    const balance = data.balance || {};
    const outstanding = balance.balancePKR ?? balance.balance ?? 0;

    // Roll-up: how many seats this client has booked across all packages
    const totalSeats = data.packages.reduce((s, p) => s + (p.numberOfPilgrims || 0), 0);
    const totalRevenueSAR = data.packages.reduce((s, p) => s + (p.pricingSummary?.finalPriceSAR || 0), 0);

    return (
        <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <button onClick={() => nav('/clients')} className="btn-ghost flex items-center gap-1"><MdArrowBack size={16} /> Clients</button>
                <div className="flex gap-2 flex-wrap">
                    <button onClick={() => nav(`/ledger/view/${clientType}/${id}`)} className="btn-outline btn-sm flex items-center gap-1"><MdAccountBalance size={14} /> Open Ledger</button>
                    <button onClick={() => nav(`/packages/new`)} className="btn-gold btn-sm flex items-center gap-1"><MdAdd size={14} /> New Package</button>
                </div>
            </div>

            {/* Identity card */}
            <div className="card mb-4">
                <div className="card-body">
                    <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <h1 className="text-xl font-heading font-bold text-dark">{name}</h1>
                                <span className={`badge ${isB2C ? 'badge-navy' : 'badge-gold'}`}>{clientType}</span>
                                {!c.isActive && <span className="badge-inactive">Inactive</span>}
                            </div>
                            <p className="text-xs text-gray-500">
                                {isB2C
                                    ? <>{c.gender || '—'} · DOB {fmtDate(c.dob)}</>
                                    : <><span className="font-mono font-bold text-navy-800">{c.agentCode}</span> · {c.contactPerson || '—'}</>
                                }
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                        <div><p className="text-gray-500 text-xs flex items-center gap-1"><MdLocalPhone size={12} /> Phone</p><p className="font-semibold">{c.phone || '—'}</p></div>
                        <div><p className="text-gray-500 text-xs">WhatsApp</p><p className="font-semibold">{c.whatsapp || '—'}</p></div>
                        <div><p className="text-gray-500 text-xs flex items-center gap-1"><MdLocationCity size={12} /> City</p><p className="font-semibold">{c.city || '—'}</p></div>
                        {isB2C ? (
                            <>
                                <div><p className="text-gray-500 text-xs flex items-center gap-1"><MdBadge size={12} /> CNIC</p><p className="font-semibold">{c.cnic || '—'}</p></div>
                                <div className="sm:col-span-2"><p className="text-gray-500 text-xs">Passport</p><p className="font-semibold">{c.passportNumber || '—'} <span className="text-xs text-gray-500">(exp {fmtDate(c.passportExpiry)})</span></p></div>
                                {c.gender === 'Female' && (
                                    <div className="sm:col-span-2"><p className="text-gray-500 text-xs">Mahram</p><p className="font-semibold">{c.mahramDetails?.name || '—'} <span className="text-xs text-gray-500">({c.mahramDetails?.relation || '—'})</span></p></div>
                                )}
                            </>
                        ) : (
                            <>
                                <div><p className="text-gray-500 text-xs">Email</p><p className="font-semibold">{c.email || '—'}</p></div>
                                <div className="sm:col-span-2"><p className="text-gray-500 text-xs">Commission</p><p className="font-semibold">{c.commissionType === 'percentage' ? `${c.commissionValue}%` : `SAR ${c.commissionValue}`}</p></div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="stat-card">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="stat-label">Packages</p>
                            <p className="stat-value text-navy-800">{data.packages.length}</p>
                            <p className="text-[10px] text-gray-500">{totalSeats} total pilgrim seats</p>
                        </div>
                        <div className="stat-icon bg-navy-800 text-white"><MdInventory size={22} /></div>
                    </div>
                </div>
                <div className="stat-card">
                    <p className="stat-label">Total Billed</p>
                    <p className="stat-value text-red-600">{formatPKR(balance.totalDebitPKR ?? balance.totalDebit ?? 0)}</p>
                    <p className="text-[10px] text-gray-500">All-time across {balance.count || 0} ledger entries</p>
                </div>
                <div className="stat-card">
                    <p className="stat-label">Total Received</p>
                    <p className="stat-value text-green-700">{formatPKR(balance.totalCreditPKR ?? balance.totalCredit ?? 0)}</p>
                </div>
                <div className={`stat-card ${outstanding > 0 ? 'border-l-4 border-red-500' : ''}`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="stat-label">Outstanding</p>
                            <p className={`stat-value ${outstanding > 0 ? 'text-red-600' : 'text-green-700'}`}>{formatPKR(outstanding)}</p>
                        </div>
                        <div className="stat-icon bg-navy-800 text-white"><MdAccountBalance size={22} /></div>
                    </div>
                </div>
            </div>

            {/* Packages section */}
            <div className="card mb-4">
                <div className="card-body">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <h2 className="text-lg font-heading font-bold text-dark flex items-center gap-2"><MdInventory size={18} className="text-gold-500" /> Packages</h2>
                            <p className="text-xs text-gray-500">{data.packages.length} booking{data.packages.length === 1 ? '' : 's'} · {formatSAR(totalRevenueSAR)} lifetime revenue</p>
                        </div>
                    </div>
                    {data.packages.length === 0 ? (
                        <div className="text-center py-10 text-gray-400">
                            <p className="text-sm">No packages booked yet.</p>
                            <button onClick={() => nav('/packages/new')} className="btn-gold btn-sm inline-flex items-center gap-1 mt-2"><MdAdd size={14} /> Create First Package</button>
                        </div>
                    ) : (
                        <div className="table-container">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Voucher</th><th>Package</th><th>Type</th><th>Group</th>
                                        <th>Travel</th><th>Roster</th><th className="text-right">Total</th><th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.packages.map(p => {
                                        const rosterActual = p.pilgrims?.length || 0;
                                        const rosterTone = rosterActual === p.numberOfPilgrims ? 'text-green-700' : rosterActual < p.numberOfPilgrims ? 'text-orange-600' : 'text-red-600';
                                        return (
                                            <tr key={p._id} onClick={() => nav(`/packages/view/${p._id}`)} className="cursor-pointer hover:bg-gray-50">
                                                <td><span className="font-mono font-bold text-navy-800">{p.voucherId}</span></td>
                                                <td>{p.packageName}</td>
                                                <td><span className="badge-navy text-xs">{p.packageType}</span></td>
                                                <td className="text-xs">{p.departure ? <span className="font-mono text-navy-800">{p.departure.code}</span> : <span className="text-gray-400">Standalone</span>}</td>
                                                <td className="text-xs">{fmtDate(p.travelDates?.departure)}</td>
                                                <td className={`text-xs font-semibold flex items-center gap-1 ${rosterTone}`}>
                                                    <MdGroups size={12} /> {rosterActual}/{p.numberOfPilgrims}
                                                </td>
                                                <td className="text-right">
                                                    <div className="font-semibold text-navy-800 text-sm">{formatSAR(p.pricingSummary?.finalPriceSAR)}</div>
                                                    <div className="text-[10px] text-gray-500">{formatPKR(convertToPKR(p.pricingSummary?.finalPriceSAR || 0))}</div>
                                                </td>
                                                <td><span className={statusColors[p.status] || 'badge-navy'}>{statusLabels[p.status] || p.status}</span></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Recent ledger activity */}
            <div className="card mb-4">
                <div className="card-body">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-lg font-heading font-bold text-dark flex items-center gap-2"><MdHistory size={18} className="text-gold-500" /> Recent Ledger Activity</h2>
                        <Link to={`/ledger/view/${clientType}/${id}`} className="text-xs text-navy-800 hover:underline">Full ledger →</Link>
                    </div>
                    {data.recentLedger.length === 0 ? (
                        <p className="text-center py-6 text-sm text-gray-400">No ledger entries yet.</p>
                    ) : (
                        <table className="data-table">
                            <thead><tr><th>Date</th><th>Description</th><th>Linked</th><th>Method</th><th className="text-right">Amount</th></tr></thead>
                            <tbody>
                                {data.recentLedger.map(e => (
                                    <tr key={e._id}>
                                        <td className="text-sm">{fmtDate(e.date)}</td>
                                        <td className="text-sm">{e.description}{e.referenceNumber && <div className="text-[10px] text-gray-500">Ref: {e.referenceNumber}</div>}</td>
                                        <td className="text-xs">{e.package?.voucherId ? <span className="font-mono">{e.package.voucherId}</span> : '—'}</td>
                                        <td className="text-xs capitalize">{e.paymentMethod?.replace('_', ' ')}</td>
                                        <td className={`text-right font-bold text-sm ${e.type === 'debit' ? 'text-red-600' : 'text-green-700'}`}>
                                            {e.type === 'debit' ? <MdTrendingUp className="inline" size={12} /> : <MdTrendingDown className="inline" size={12} />}
                                            {' '}{e.currency} {Number(e.amount).toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Documents */}
            {isB2C && c.documents?.length > 0 && (
                <div className="card mb-4">
                    <div className="card-body">
                        <h2 className="text-lg font-heading font-bold text-dark mb-3 flex items-center gap-2"><MdAttachFile size={18} className="text-gold-500" /> Documents</h2>
                        <ul className="space-y-1">
                            {c.documents.map(d => (
                                <li key={d._id} className="flex justify-between items-center px-3 py-2 rounded-lg bg-gray-50">
                                    <a href={d.url} target="_blank" rel="noreferrer" className="text-sm text-navy-800 hover:underline">{d.originalName || d.filename}</a>
                                    <span className="text-[10px] text-gray-500 capitalize">{d.category?.replace('_', ' ')}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}

            {/* B2B sub-pilgrims */}
            {!isB2C && c.subPilgrims?.length > 0 && (
                <div className="card mb-4">
                    <div className="card-body">
                        <h2 className="text-lg font-heading font-bold text-dark mb-3 flex items-center gap-2"><MdAssignmentInd size={18} className="text-gold-500" /> Sub-pilgrims registered under this agent</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {c.subPilgrims.map(sp => (
                                <div key={sp._id} className="p-2 rounded-lg bg-gray-50 border border-gray-100">
                                    <p className="text-sm font-semibold">{sp.fullName}</p>
                                    <p className="text-[10px] text-gray-500">{sp.gender || ''} · {sp.passportNumber || 'no passport'} · {sp.phone || ''}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
