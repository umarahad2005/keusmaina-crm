import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import DataTable from '../../components/DataTable';
import toast from 'react-hot-toast';
import { MdVisibility, MdGroups, MdPrint } from 'react-icons/md';

const statusColors = {
    planning: 'badge-navy', open: 'badge-active', closed: 'badge-gold',
    completed: 'badge-gold', cancelled: 'badge-inactive'
};

const fmtDate = (v) => v ? new Date(v).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function DepartureList() {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const nav = useNavigate();

    const fetchData = async () => {
        try { setLoading(true); const res = await api.get('/departures'); setData(res.data.data); }
        catch { toast.error('Failed to load departures'); } finally { setLoading(false); }
    };
    useEffect(() => { fetchData(); }, []);

    const columns = [
        { key: 'code', label: 'Code', render: v => <span className="font-mono font-bold text-navy-800">{v}</span> },
        { key: 'name', label: 'Name' },
        { key: 'travelDates', label: 'Departure', render: v => fmtDate(v?.departure) },
        { key: 'travelDates', label: 'Return', render: v => fmtDate(v?.returnDate) },
        { key: 'components', label: 'Flight', render: v => v?.airline ? `${v.airline.name || ''} ${v.airline.flightNumber || ''}`.trim() : '—' },
        { key: 'components', label: 'Hotels', render: v => `${v?.makkahHotel?.hotel?.name || '—'} / ${v?.madinahHotel?.hotel?.name || '—'}` },
        {
            key: 'rollup', label: 'Bookings',
            render: (v, row) => {
                const cap = row.capacity || 0;
                const tone = cap === 0 ? 'text-gray-700' : v?.booked > cap ? 'text-red-600' : v?.booked === cap ? 'text-orange-600' : 'text-green-700';
                return <span className={`flex items-center gap-1 text-xs font-semibold ${tone}`}><MdGroups size={14} /> {v?.packages || 0} pkg · {v?.booked || 0}{cap ? `/${cap}` : ''} pax</span>;
            }
        },
        { key: 'status', label: 'Status', render: v => <span className={statusColors[v] || 'badge-navy'}>{v}</span> },
    ];

    const handleDelete = async (row) => {
        if (!confirm(`Cancel departure "${row.code}"?`)) return;
        try { await api.delete(`/departures/${row._id}`); toast.success('Departure cancelled'); fetchData(); }
        catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    };

    return (
        <DataTable columns={columns} data={data} loading={loading}
            onEdit={(row) => nav(`/departures/edit/${row._id}`)}
            onDelete={handleDelete}
            extraActions={[
                { icon: MdVisibility, title: 'View detail', className: 'text-navy-700 hover:bg-navy-50', onClick: (row) => nav(`/departures/view/${row._id}`) },
                { icon: MdPrint, title: 'Group manifest (PDF)', className: 'text-gold-600 hover:bg-gold-50', onClick: (row) => window.open(`/departures/view/${row._id}/manifest`, '_blank') }
            ]}
            title="Groups (Departure Batches)"
            onAdd={() => nav('/departures/new')}
            addLabel="New Group" />
    );
}
