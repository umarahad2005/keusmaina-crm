import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { useCurrency } from '../../context/CurrencyContext';
import DataTable from '../../components/DataTable';
import toast from 'react-hot-toast';
import { MdAccountBalance, MdTrendingUp, MdTrendingDown, MdVisibility, MdSearch } from 'react-icons/md';

// Main ledger landing page: list of all clients (B2B + B2C tabs) with their
// outstanding balance. Click a row to drill into that client's full ledger.
// Replaces the old flat "all entries" table — that view didn't scale once a
// client had many transactions across many bookings.
export default function Ledger() {
    const nav = useNavigate();
    const { formatPKR } = useCurrency();
    const [tab, setTab] = useState('B2C');
    const [data, setData] = useState({ B2C: [], B2B: [] });
    const [summary, setSummary] = useState({ B2C: { totalDebit: 0, totalCredit: 0, balance: 0, count: 0 }, B2B: { totalDebit: 0, totalCredit: 0, balance: 0, count: 0 } });
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await api.get('/ledger/clients/list');
            setData(res.data.data.clients);
            setSummary(res.data.data.summary);
        } catch { toast.error('Failed to load client ledgers'); }
        finally { setLoading(false); }
    };
    useEffect(() => { fetchData(); }, []);

    const b2cColumns = [
        { key: 'fullName', label: 'Pilgrim Name' },
        { key: 'cnic', label: 'CNIC' },
        { key: 'phone', label: 'Phone' },
        { key: 'city', label: 'City' },
        { key: 'entryCount', label: 'Entries', render: v => <span className="badge-navy">{v || 0}</span> },
        { key: 'totalDebitPKR', label: 'Charged', render: v => <span className="text-red-600 font-semibold text-xs">{formatPKR(v || 0)}</span> },
        { key: 'totalCreditPKR', label: 'Received', render: v => <span className="text-green-700 font-semibold text-xs">{formatPKR(v || 0)}</span> },
        { key: 'balancePKR', label: 'Outstanding', render: v => <span className={`font-bold text-xs ${v > 0 ? 'text-red-600' : v < 0 ? 'text-green-700' : 'text-gray-500'}`}>{formatPKR(v || 0)}</span> },
    ];

    const b2bColumns = [
        { key: 'agentCode', label: 'Agent', render: v => <span className="font-mono font-bold text-navy-800">{v}</span> },
        { key: 'companyName', label: 'Company' },
        { key: 'contactPerson', label: 'Contact' },
        { key: 'phone', label: 'Phone' },
        { key: 'entryCount', label: 'Entries', render: v => <span className="badge-navy">{v || 0}</span> },
        { key: 'totalDebitPKR', label: 'Charged', render: v => <span className="text-red-600 font-semibold text-xs">{formatPKR(v || 0)}</span> },
        { key: 'totalCreditPKR', label: 'Received', render: v => <span className="text-green-700 font-semibold text-xs">{formatPKR(v || 0)}</span> },
        { key: 'balancePKR', label: 'Outstanding', render: v => <span className={`font-bold text-xs ${v > 0 ? 'text-red-600' : v < 0 ? 'text-green-700' : 'text-gray-500'}`}>{formatPKR(v || 0)}</span> },
    ];

    const openLedger = (row) => nav(`/ledger/view/${tab}/${row._id}`);
    const totals = summary[tab];

    return (
        <div>
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
                <div className="stat-card">
                    <p className="stat-label">{tab} Clients</p>
                    <p className="stat-value text-navy-800">{totals.count}</p>
                </div>
                <div className="stat-card flex items-center justify-between">
                    <div><p className="stat-label">Total Charged</p><p className="stat-value text-red-600">{formatPKR(totals.totalDebit)}</p></div>
                    <div className="stat-icon bg-red-500 text-white"><MdTrendingUp size={22} /></div>
                </div>
                <div className="stat-card flex items-center justify-between">
                    <div><p className="stat-label">Total Received</p><p className="stat-value text-green-700">{formatPKR(totals.totalCredit)}</p></div>
                    <div className="stat-icon bg-green-600 text-white"><MdTrendingDown size={22} /></div>
                </div>
                <div className="stat-card flex items-center justify-between">
                    <div><p className="stat-label">Outstanding Receivable</p><p className={`stat-value ${totals.balance > 0 ? 'text-red-600' : 'text-green-700'}`}>{formatPKR(totals.balance)}</p></div>
                    <div className="stat-icon bg-navy-800 text-white"><MdAccountBalance size={22} /></div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1 w-fit">
                <button onClick={() => setTab('B2C')} className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${tab === 'B2C' ? 'bg-white text-navy-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    👤 B2C Pilgrims
                </button>
                <button onClick={() => setTab('B2B')} className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${tab === 'B2B' ? 'bg-white text-navy-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    🏢 B2B Agents
                </button>
            </div>

            {tab === 'B2C' ? (
                <DataTable
                    columns={b2cColumns}
                    data={data.B2C}
                    loading={loading}
                    title="B2C Pilgrim Ledgers"
                    extraActions={[
                        { icon: MdVisibility, title: 'Open ledger', className: 'text-navy-700 hover:bg-navy-50', onClick: openLedger }
                    ]}
                />
            ) : (
                <DataTable
                    columns={b2bColumns}
                    data={data.B2B}
                    loading={loading}
                    title="B2B Agent Ledgers"
                    extraActions={[
                        { icon: MdVisibility, title: 'Open ledger', className: 'text-navy-700 hover:bg-navy-50', onClick: openLedger }
                    ]}
                />
            )}

            <p className="text-xs text-gray-500 mt-3 px-2">
                Click <MdSearch className="inline" size={14}/> on a row to open that client's ledger. There you can record charges (debit), payments (credit), filter by date / type / method, and export as PDF, DOCX or Excel.
            </p>
        </div>
    );
}
