import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../utils/api';
import { useCurrency } from '../../context/CurrencyContext';
import PrintShell from './PrintShell';

const fmtDate = (v) => v ? new Date(v).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function Voucher() {
    const { id } = useParams();
    const { formatSAR, formatPKR, convertToPKR } = useCurrency();
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

    const c = pkg.client || {};
    const clientName = c.fullName || c.companyName || '—';
    const ziyarats = (pkg.components?.ziyarats || []).map(z => z.name).join(', ') || '—';
    const transports = (pkg.components?.transportation || []).map(t => t.typeName).join(', ') || '—';
    const services = (pkg.components?.specialServices || []).map(s => s.name).join(', ') || '—';

    return (
        <PrintShell title="VOUCHER" subtitle={`${pkg.voucherId} · ${pkg.packageType}`}>
            <div className="grid-2">
                <div className="box">
                    <h3>Booked For</h3>
                    <div className="v">{clientName}</div>
                    {c.passportNumber && <div style={{ fontSize: 11, color: '#444' }}>Passport: {c.passportNumber}</div>}
                    {c.phone && <div style={{ fontSize: 11, color: '#444' }}>Phone: {c.phone}</div>}
                    {c.cnic && <div style={{ fontSize: 11, color: '#444' }}>CNIC: {c.cnic}</div>}
                </div>
                <div className="box">
                    <h3>Trip</h3>
                    <div className="v">{pkg.packageName}</div>
                    <div style={{ fontSize: 11, color: '#444' }}>{pkg.travelSeason || ''} · {pkg.duration || ''}</div>
                    <div style={{ fontSize: 11, color: '#444' }}>Pilgrims: {pkg.numberOfPilgrims}</div>
                </div>
            </div>

            <table className="bordered">
                <tbody>
                    <tr><th style={{ width: '22%' }}>Departure</th><td>{fmtDate(pkg.travelDates?.departure)}</td>
                        <th style={{ width: '15%' }}>Return</th><td>{fmtDate(pkg.travelDates?.returnDate)}</td></tr>
                    <tr><th>Flight</th>
                        <td colSpan="3">{pkg.components?.airline ? `${pkg.components.airline.name} ${pkg.components.airline.flightNumber || ''} · ${pkg.components.airline.departureCity} → ${pkg.components.airline.arrivalCity} · ${pkg.components.airline.seatClass || ''}` : '—'}</td></tr>
                    <tr><th>Makkah Hotel</th>
                        <td>{pkg.components?.makkahHotel?.hotel?.name || '—'}</td>
                        <th>Stay</th>
                        <td>{pkg.components?.makkahHotel?.roomType || '—'} · {pkg.components?.makkahHotel?.nights || 0} nights</td></tr>
                    <tr><th>Madinah Hotel</th>
                        <td>{pkg.components?.madinahHotel?.hotel?.name || '—'}</td>
                        <th>Stay</th>
                        <td>{pkg.components?.madinahHotel?.roomType || '—'} · {pkg.components?.madinahHotel?.nights || 0} nights</td></tr>
                    <tr><th>Ziyarats</th><td colSpan="3">{ziyarats}</td></tr>
                    <tr><th>Transport</th><td colSpan="3">{transports}</td></tr>
                    <tr><th>Special Services</th><td colSpan="3">{services}</td></tr>
                </tbody>
            </table>

            <h3 style={{ marginTop: 18, fontSize: 12, color: '#1a2c5b' }}>Pricing</h3>
            <table className="totals">
                <tbody>
                    <tr><td>Subtotal</td><td>{formatSAR(pkg.pricingSummary?.subtotalSAR || 0)}</td></tr>
                    <tr><td>Markup</td><td>{formatSAR(pkg.pricingSummary?.markupAmountSAR || 0)}</td></tr>
                    <tr className="grand"><td>Total Price</td><td>{formatSAR(pkg.pricingSummary?.finalPriceSAR || 0)}</td></tr>
                    <tr><td style={{ color: '#666' }}>In PKR (today's rate)</td><td style={{ color: '#666' }}>{formatPKR(convertToPKR(pkg.pricingSummary?.finalPriceSAR || 0))}</td></tr>
                    <tr><td style={{ color: '#666' }}>Per Pilgrim (SAR)</td><td style={{ color: '#666' }}>{formatSAR(pkg.pricingSummary?.costPerPersonSAR || 0)}</td></tr>
                </tbody>
            </table>

            {pkg.notes && (
                <div className="box" style={{ marginTop: 16 }}>
                    <h3>Notes</h3>
                    <div style={{ fontSize: 12 }}>{pkg.notes}</div>
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 22 }}>
                <div className={`stamp ${pkg.status !== 'confirmed' ? 'pending' : ''}`}>
                    {pkg.status === 'confirmed' ? 'CONFIRMED' : pkg.status === 'completed' ? 'COMPLETED' : pkg.status === 'cancelled' ? 'CANCELLED' : 'DRAFT'}
                </div>
                <div style={{ textAlign: 'right', fontSize: 11 }}>
                    <div style={{ marginTop: 38, borderTop: '1px solid #888', paddingTop: 4, width: 200, display: 'inline-block' }}>Authorized Signature</div>
                </div>
            </div>
        </PrintShell>
    );
}
