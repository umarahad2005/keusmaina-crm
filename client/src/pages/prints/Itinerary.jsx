import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../utils/api';
import PrintShell from './PrintShell';

const fmtDate = (v) => v ? new Date(v).toLocaleDateString('en-PK', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const addDays = (d, n) => new Date(new Date(d).getTime() + n * 86400000);

export default function Itinerary() {
    const { id } = useParams();
    const [pkg, setPkg] = useState(null);
    const [err, setErr] = useState('');

    useEffect(() => {
        (async () => {
            try { const r = await api.get(`/packages/${id}`); setPkg(r.data.data); }
            catch (e) { setErr(e.response?.data?.message || 'Failed to load'); }
        })();
    }, [id]);

    useEffect(() => { if (pkg) setTimeout(() => window.print(), 350); }, [pkg]);

    if (err) return <div style={{ padding: 24, color: 'red' }}>{err}</div>;
    if (!pkg) return <div style={{ padding: 24 }}>Loading…</div>;

    // Build a simple day-by-day plan from the package's components.
    const days = [];
    const dep = pkg.travelDates?.departure;
    const ret = pkg.travelDates?.returnDate;
    const makkahNights = Number(pkg.components?.makkahHotel?.nights) || 0;
    const madinahNights = Number(pkg.components?.madinahHotel?.nights) || 0;
    const ziyaratNames = (pkg.components?.ziyarats || []).map(z => z.name);

    if (dep) {
        let cursor = new Date(dep);
        days.push({ date: new Date(cursor), title: 'Departure & Arrival', body: `Travel from ${pkg.components?.airline?.departureCity || 'home'} to ${pkg.components?.airline?.arrivalCity || 'Saudi Arabia'} on ${pkg.components?.airline?.name || 'flight'} ${pkg.components?.airline?.flightNumber || ''}. Check-in to ${pkg.components?.makkahHotel?.hotel?.name || 'Makkah hotel'}.` });
        for (let i = 1; i < makkahNights; i++) {
            cursor = addDays(dep, i);
            const ziyaratLine = i === 1 && ziyaratNames.length ? ` Ziyarats may be scheduled this day: ${ziyaratNames.slice(0, 3).join(', ')}${ziyaratNames.length > 3 ? '…' : ''}.` : '';
            days.push({ date: new Date(cursor), title: 'Stay in Makkah', body: `Umrah / prayers at Masjid al-Haram.${ziyaratLine}` });
        }
        for (let i = 0; i < madinahNights; i++) {
            cursor = addDays(dep, makkahNights + i);
            days.push({ date: new Date(cursor), title: 'Stay in Madinah', body: `Prayers at Masjid an-Nabawi. Check-in to ${pkg.components?.madinahHotel?.hotel?.name || 'Madinah hotel'} on day 1.` });
        }
        if (ret) {
            days.push({ date: new Date(ret), title: 'Return Journey', body: `Return flight to ${pkg.components?.airline?.departureCity || 'home'}.` });
        }
    }

    return (
        <PrintShell title="ITINERARY" subtitle={`${pkg.voucherId} · ${pkg.packageName}`}>
            <table className="bordered">
                <tbody>
                    <tr><th style={{ width: '20%' }}>Pilgrim(s)</th><td>{pkg.client?.fullName || pkg.client?.companyName || '—'} · {pkg.numberOfPilgrims} pax</td></tr>
                    <tr><th>Travel Window</th><td>{fmtDate(dep)} → {fmtDate(ret)}</td></tr>
                    <tr><th>Flight</th><td>{pkg.components?.airline ? `${pkg.components.airline.name} ${pkg.components.airline.flightNumber || ''}` : '—'}</td></tr>
                    <tr><th>Hotels</th><td>Makkah: {pkg.components?.makkahHotel?.hotel?.name || '—'} ({makkahNights} nights) · Madinah: {pkg.components?.madinahHotel?.hotel?.name || '—'} ({madinahNights} nights)</td></tr>
                </tbody>
            </table>

            <h3 style={{ marginTop: 16, fontSize: 12, color: '#1a2c5b' }}>Day-by-Day</h3>
            {days.length === 0 ? (
                <p style={{ color: '#888' }}>Set departure date and hotel nights to generate the day-by-day plan.</p>
            ) : (
                <table className="bordered">
                    <thead><tr><th style={{ width: 60 }}>Day</th><th style={{ width: '24%' }}>Date</th><th>Plan</th></tr></thead>
                    <tbody>
                        {days.map((d, i) => (
                            <tr key={i}>
                                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{i + 1}</td>
                                <td>{fmtDate(d.date)}</td>
                                <td><strong>{d.title}.</strong> {d.body}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {ziyaratNames.length > 0 && (
                <>
                    <h3 style={{ marginTop: 16, fontSize: 12, color: '#1a2c5b' }}>Included Ziyarats</h3>
                    <ul style={{ marginTop: 6, paddingLeft: 18, fontSize: 12 }}>
                        {(pkg.components?.ziyarats || []).map(z => <li key={z._id}>{z.name} <span style={{ color: '#666' }}>({z.location || ''})</span></li>)}
                    </ul>
                </>
            )}

            <div className="footer-notes">
                <p><strong>Important:</strong> All timings are tentative and subject to local conditions, weather, and Saudi authority guidelines. Please follow your group leader's instructions on the ground.</p>
            </div>
        </PrintShell>
    );
}
