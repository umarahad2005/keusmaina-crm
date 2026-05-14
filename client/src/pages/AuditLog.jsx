import { useState, useEffect } from 'react';
import api from '../utils/api';
import DataTable from '../components/DataTable';
import toast from 'react-hot-toast';
import { MdHistory } from 'react-icons/md';

const actionColors = { create: 'badge-active', update: 'badge-navy', delete: 'badge-inactive' };

export default function AuditLog() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ action: '', entity: '', dateFrom: '', dateTo: '' });

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filters.action) params.append('action', filters.action);
            if (filters.entity) params.append('entity', filters.entity);
            if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
            if (filters.dateTo) params.append('dateTo', filters.dateTo);
            const res = await api.get(`/audit-logs?${params.toString()}`);
            setLogs(res.data.data);
        } catch { toast.error('Failed to load audit logs'); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchLogs(); }, []);

    const columns = [
        { key: 'createdAt', label: 'Time', render: v => new Date(v).toLocaleString('en-PK', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) },
        { key: 'performedBy', label: 'User', render: v => v ? <span className="font-medium">{v.name} <span className="text-gray-400 text-xs">({v.role})</span></span> : '—' },
        { key: 'action', label: 'Action', render: v => <span className={actionColors[v] || 'badge-navy'}>{v?.toUpperCase()}</span> },
        { key: 'entity', label: 'Entity', render: v => <span className="font-mono text-sm">{v}</span> },
        { key: 'entityId', label: 'Entity ID', render: v => <span className="font-mono text-xs text-gray-500">{v?.slice(-8)}</span> },
    ];

    const entities = ['Airline', 'HotelMakkah', 'HotelMadinah', 'Ziyarat', 'Transport', 'SpecialService', 'CurrencySettings', 'Package', 'ClientB2C', 'ClientB2B', 'LedgerEntry'];

    return (
        <div>
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
                <MdHistory size={28} className="text-navy-800" />
                <h2 className="text-xl font-heading font-bold text-dark">Audit Log</h2>
            </div>

            {/* Filters */}
            <div className="card mb-4">
                <div className="card-body grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                        <label className="label text-xs">Action</label>
                        <select className="select text-sm" value={filters.action} onChange={e => setFilters(f => ({ ...f, action: e.target.value }))}>
                            <option value="">All</option>
                            <option value="create">Create</option>
                            <option value="update">Update</option>
                            <option value="delete">Delete</option>
                        </select>
                    </div>
                    <div>
                        <label className="label text-xs">Entity</label>
                        <select className="select text-sm" value={filters.entity} onChange={e => setFilters(f => ({ ...f, entity: e.target.value }))}>
                            <option value="">All</option>
                            {entities.map(e => <option key={e} value={e}>{e}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="label text-xs">From</label>
                        <input className="input text-sm" type="date" value={filters.dateFrom} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} />
                    </div>
                    <div>
                        <label className="label text-xs">To</label>
                        <input className="input text-sm" type="date" value={filters.dateTo} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} />
                    </div>
                </div>
                <div className="px-6 pb-4">
                    <button onClick={fetchLogs} className="btn-primary text-sm">Apply Filters</button>
                </div>
            </div>

            <DataTable columns={columns} data={logs} loading={loading} title="" searchable={true} />
        </div>
    );
}
