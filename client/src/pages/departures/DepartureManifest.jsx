import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../utils/api';

const fmtDate = (v) => v ? new Date(v).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function DepartureManifest() {
    const { id } = useParams();
    const [m, setM] = useState(null);
    const [err, setErr] = useState('');

    useEffect(() => {
        (async () => {
            try { const r = await api.get(`/departures/${id}/manifest`); setM(r.data.data); }
            catch (e) { setErr(e.response?.data?.message || 'Failed to load manifest'); }
        })();
    }, [id]);

    useEffect(() => { if (m) setTimeout(() => window.print(), 250); }, [m]);

    if (err) return <div className="p-8 text-red-600">{err}</div>;
    if (!m) return <div className="p-8">Loading manifest…</div>;

    return (
        <div className="p-6 max-w-6xl mx-auto bg-white text-black">
            <style>{`
                @media print { @page { size: A4 landscape; margin: 12mm; } body { font-size: 10px; } .no-print { display: none !important; } }
                table { width: 100%; border-collapse: collapse; }
                th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; vertical-align: top; }
                th { background: #f0f0f0; font-weight: bold; }
            `}</style>

            <div className="no-print mb-4 flex justify-end">
                <button onClick={() => window.print()} className="btn-gold">Print</button>
            </div>

            <h1 style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 4 }}>Group Manifest — {m.code}</h1>
            <p style={{ fontSize: 13, marginBottom: 12 }}><strong>{m.name}</strong></p>

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
                        <th>Packages</th><td>{m.packageCount}</td>
                        <th>Pilgrims</th><td>{m.actualTotal} listed of {m.expectedTotal} booked</td>
                    </tr>
                </tbody>
            </table>

            <h2 style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 6 }}>Roster (across all bookings)</h2>
            <table>
                <thead>
                    <tr>
                        <th>#</th><th>Name</th><th>Gender</th><th>CNIC</th><th>Passport</th><th>Expiry</th>
                        <th>Mahram</th><th>Phone</th><th>Voucher</th><th>Booker</th>
                        <th>Makkah Rm</th><th>Madinah Rm</th><th>Ticket #</th><th>Visa #</th><th>Visa Status</th>
                    </tr>
                </thead>
                <tbody>
                    {m.manifest.length === 0 ? (
                        <tr><td colSpan="15" style={{ textAlign: 'center', padding: 20 }}>No pilgrims listed yet.</td></tr>
                    ) : m.manifest.map(r => (
                        <tr key={r.index}>
                            <td>{r.index}</td><td>{r.fullName}</td><td>{r.gender}</td><td>{r.cnic}</td>
                            <td>{r.passportNumber}</td><td>{fmtDate(r.passportExpiry)}</td>
                            <td>{r.mahram}</td><td>{r.phone}</td>
                            <td style={{ fontFamily: 'monospace', fontSize: 9 }}>{r.voucherId}</td><td>{r.booker}</td>
                            <td>{r.makkahRoom}</td><td>{r.madinahRoom}</td>
                            <td>{r.ticketNumber}</td><td>{r.visaNumber}</td><td>{r.visaStatus}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <p className="no-print" style={{ marginTop: 24, fontSize: 11, color: '#666' }}>Karwan-e-Usmania CRM · {new Date().toLocaleString('en-PK')}</p>
        </div>
    );
}
