import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../../utils/api';
import { useCurrency } from '../../context/CurrencyContext';
import toast from 'react-hot-toast';
import {
    MdArrowBack, MdTrendingUp, MdTrendingDown, MdAccountBalance,
    MdFilterList, MdClose, MdPersonOutline, MdStorefront, MdReceiptLong
} from 'react-icons/md';

const TYPE_LABEL = { cash: '💵 Cash', bank: '🏦 Bank', wallet: '📱 Wallet', card: '💳 Card', other: 'Other' };
const SOURCE_ICON = { client: MdPersonOutline, supplier: MdStorefront, expense: MdReceiptLong };
const SOURCE_LABEL = { client: 'Client', supplier: 'Supplier', expense: 'Expense' };

const fmtDate = (v) => v ? new Date(v).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function CashAccountDetail() {
    const { id } = useParams();
    const nav = useNavigate();
    const { formatPKR } = useCurrency();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', source: '', direction: '' });
    const [showFilters, setShowFilters] = useState(false);

    const queryString = useMemo(() => {
        const p = new URLSearchParams();
        if (filters.dateFrom) p.append('dateFrom', filters.dateFrom);
        if (filters.dateTo) p.append('dateTo', filters.dateTo);
        return p.toString();
    }, [filters.dateFrom, filters.dateTo]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const qs = queryString ? `?${queryString}` : '';
            const r = await api.get(`/cash-accounts/${id}${qs}`);
            setData(r.data.data);
        } catch (e) { toast.error(e.response?.data?.message || 'Failed to load account'); nav('/cash-accounts'); }
        finally { setLoading(false); }
    };
    useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [id, queryString]);

    if (loading || !data) return <div className="flex items-center justify-center py-20"><div className="w-10 h-10 border-4 border-navy-800 border-t-gold-500 rounded-full animate-spin" /></div>;

    const txns = data.transactions || [];
    const filteredTxns = txns.filter(t =>
        (!filters.source || t.source === filters.source) &&
        (!filters.direction || t.direction === filters.direction)
    );
    const hasFilters = Object.values(filters).some(v => !!v);

    const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v }));

    return (
        <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <button onClick={() => nav('/cash-accounts')} className="btn-ghost flex items-center gap-1"><MdArrowBack size={16} /> Accounts</button>
                <button onClick={() => setShowFilters(s => !s)} className={`btn-sm flex items-center gap-1 ${showFilters || hasFilters ? 'btn-primary' : 'btn-ghost'}`}>
                    <MdFilterList size={16} /> Filters{hasFilters ? ` (${Object.values(filters).filter(Boolean).length})` : ''}
                </button>
            </div>

            <div className="card mb-4">
                <div className="card-body">
                    <div className="flex items-start justify-between flex-wrap gap-3">
                        <div>
                            <h1 className="text-xl font-heading font-bold text-dark mb-1">{data.name}</h1>
                            <p className="text-sm text-gray-500">
                                <span className="badge-navy mr-2">{TYPE_LABEL[data.type]}</span>
                                {data.bankName && <>{data.bankName} · </>}
                                {data.accountNumber && <span className="font-mono">{data.accountNumber}</span>}
                                {data.branchOrIban && <> · {data.branchOrIban}</>}
                            </p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                        <div>
                            <p className="text-gray-500 text-xs">Opening Balance</p>
                            <p className="font-semibold">{formatPKR(data.openingBalancePKR || 0)}</p>
                        </div>
                        <div>
                            <p className="text-gray-500 text-xs">Total Received</p>
                            <p className="font-semibold text-green-700">{formatPKR(data.inflowPKR || 0)}</p>
                        </div>
                        <div>
                            <p className="text-gray-500 text-xs">Total Paid Out</p>
                            <p className="font-semibold text-red-600">{formatPKR(data.outflowPKR || 0)}</p>
                        </div>
                        <div className="flex items-center justify-between">
                            <div><p className="text-gray-500 text-xs">Current Balance</p>
                                <p className={`font-bold text-lg ${data.balancePKR > 0 ? 'text-green-700' : data.balancePKR < 0 ? 'text-red-600' : 'text-gray-600'}`}>{formatPKR(data.balancePKR || 0)}</p></div>
                            <div className="stat-icon bg-navy-800 text-white"><MdAccountBalance size={22} /></div>
                        </div>
                    </div>
                </div>
            </div>

            {showFilters && (
                <div className="card mb-4 border-navy-200">
                    <div className="card-body">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-bold text-sm text-navy-800">Filter transactions</h3>
                            {hasFilters && <button onClick={() => setFilters({ dateFrom: '', dateTo: '', source: '', direction: '' })} className="text-xs text-red-500 hover:underline flex items-center gap-1"><MdClose size={12} /> Clear all</button>}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                            <div><label className="label text-xs">From</label>
                                <input type="date" className="input text-xs" value={filters.dateFrom} onChange={e => setFilter('dateFrom', e.target.value)} /></div>
                            <div><label className="label text-xs">To</label>
                                <input type="date" className="input text-xs" value={filters.dateTo} onChange={e => setFilter('dateTo', e.target.value)} /></div>
                            <div><label className="label text-xs">Source</label>
                                <select className="select text-xs" value={filters.source} onChange={e => setFilter('source', e.target.value)}>
                                    <option value="">All</option>
                                    <option value="client">Client</option>
                                    <option value="supplier">Supplier</option>
                                    <option value="expense">Expense</option>
                                </select></div>
                            <div><label className="label text-xs">Direction</label>
                                <select className="select text-xs" value={filters.direction} onChange={e => setFilter('direction', e.target.value)}>
                                    <option value="">All</option>
                                    <option value="in">Money in</option>
                                    <option value="out">Money out</option>
                                </select></div>
                        </div>
                    </div>
                </div>
            )}

            <div className="card">
                <div className="card-body">
                    <h2 className="text-lg font-heading font-bold text-dark mb-3">Transactions
                        <span className="text-xs font-normal text-gray-500 ml-2">Newest first · running balance shown right</span></h2>
                    {filteredTxns.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                            <p className="text-lg mb-1">No transactions</p>
                            <p className="text-sm">Record a client payment, supplier payment, or expense linked to this account.</p>
                        </div>
                    ) : (
                        <div className="table-container">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Date</th><th>Source</th><th>Party</th><th>Description</th><th>Linked</th>
                                        <th className="text-right">In</th><th className="text-right">Out</th><th className="text-right">Balance</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredTxns.map(t => {
                                        const Icon = SOURCE_ICON[t.source];
                                        return (
                                            <tr key={`${t.source}-${t._id}`}>
                                                <td className="text-sm">{fmtDate(t.date)}</td>
                                                <td><span className="flex items-center gap-1 text-xs"><Icon size={14} /> {SOURCE_LABEL[t.source]}</span></td>
                                                <td className="text-sm font-semibold">{t.party}<div className="text-[10px] text-gray-500">{t.partyMeta}</div></td>
                                                <td className="text-xs">{t.description}{t.reference && <div className="text-[10px] text-gray-500">Ref: {t.reference}</div>}</td>
                                                <td className="text-xs font-mono">{t.linked || '—'}</td>
                                                <td className="text-right font-bold text-green-700">
                                                    {t.direction === 'in' ? `${t.currency} ${Number(t.amount).toLocaleString()}` : ''}
                                                </td>
                                                <td className="text-right font-bold text-red-600">
                                                    {t.direction === 'out' ? `${t.currency} ${Number(t.amount).toLocaleString()}` : ''}
                                                </td>
                                                <td className="text-right text-sm font-semibold text-gray-700">{formatPKR(t.runningBalancePKR)}</td>
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
