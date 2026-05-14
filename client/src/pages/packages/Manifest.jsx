import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../utils/api';

const fmtDate = (v) => v ? new Date(v).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function Manifest() {
    const { id } = useParams();
    const [m, setM] = useState(null);
    const [err, setErr] = useState('');

    useEffect(() => {
        (async () => {
            try { const res = await api.get(`/packages/${id}/manifest`); setM(res.data.data); }
            catch (e) { setErr(e.response?.data?.message || 'Failed to load manifest'); }
        })();
    }, [id]);

    useEffect(() => {
        if (m) setTimeout(() => window.print(), 250);
    }, [m]);

    if (err) return <div className="p-8 text-red-600">{err}</div>;
    if (!m) return <div className="p-8">Loading manifest…</div>;

    return (
        <div className="p-6 max-w-5xl mx-auto bg-white text-black">
            <style>{`
                @media print {
                    @page { size: A4 landscape; margin: 12mm; }
                    body { font-size: 11px; }
                    .no-print { display: none !important; }
                }
                table { width: 100%; border-collapse: collapse; }
                th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; vertical-align: top; }
                th { background: #f0f0f0; font-weight: bold; }
            `}</style>

            <div className="no-print mb-4 flex justify-end">
                <button onClick={() => window.print()} className="btn-gold">Print</button>
            </div>

            <h1 style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 4 }}>Pilgrim Manifest — {m.voucherId}</h1>
            <p style={{ fontSize: 13, marginBottom: 12 }}><strong>{m.packageName}</strong></p>

            <table style={{ marginBottom: 16 }}>
                <tbody>
                    <tr>
                        <th style={{ width: '15%' }}>Travel</th>
                        <td>{fmtDate(m.travelDates?.departure)} → {fmtDate(m.travelDates?.returnDate)}</td>
                        <th style={{ width: '15%' }}>Flight</th>
                        <td>{m.airline ? `${m.airline.name} ${m.airline.flightNumber || ''}` : '—'}</td>
                    </tr>
                    <tr>
                        <th>Makkah Hotel</th><td>{m.makkahHotel || '—'}</td>
                        <th>Madinah Hotel</th><td>{m.madinahHotel || '—'}</td>
                    </tr>
                    <tr>
                        <th>Booker</th><td>{m.client || '—'}</td>
                        <th>Pilgrims</th><td>{m.actualCount} listed of {m.expectedCount} booked</td>
                    </tr>
                </tbody>
            </table>

            <h2 style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 6 }}>Roster</h2>
            <table>
                <thead>
                    <tr>
                        <th>#</th><th>Name</th><th>Gender</th><th>CNIC</th><th>Passport</th><th>Expiry</th>
                        <th>Mahram</th><th>Phone</th><th>Makkah Rm</th><th>Madinah Rm</th><th>Ticket #</th><th>Visa #</th><th>Mutamir</th>
                    </tr>
                </thead>
                <tbody>
                    {m.manifest.length === 0 ? (
                        <tr><td colSpan="13" style={{ textAlign: 'center', padding: 20 }}>No pilgrims on the roster yet.</td></tr>
                    ) : m.manifest.map(r => (
                        <tr key={r.index}>
                            <td>{r.index}</td>
                            <td>{r.fullName}</td>
                            <td>{r.gender}</td>
                            <td>{r.cnic}</td>
                            <td>{r.passportNumber}</td>
                            <td>{fmtDate(r.passportExpiry)}</td>
                            <td>{r.mahram}</td>
                            <td>{r.phone}</td>
                            <td>{r.makkahRoom}</td>
                            <td>{r.madinahRoom}</td>
                            <td>{r.ticketNumber}</td>
                            <td>{r.visaNumber}</td>
                            <td>{r.mutamirNumber}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <p className="no-print" style={{ marginTop: 24, fontSize: 11, color: '#666' }}>
                Printed from Karwan-e-Usmania CRM · {new Date().toLocaleString('en-PK')}
            </p>
        </div>
    );
}
