import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../utils/api';
import { useCurrency } from '../../context/CurrencyContext';
import PrintShell from './PrintShell';

const fmtDate = (v) => v ? new Date(v).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function Invoice() {
    const { id } = useParams();
    const { formatSAR, formatPKR, convertToPKR } = useCurrency();
    const [data, setData] = useState(null);
    const [err, setErr] = useState('');

    useEffect(() => {
        (async () => {
            try { const r = await api.get(`/packages/${id}/invoice-data`); setData(r.data.data); }
            catch (e) { setErr(e.response?.data?.message || 'Failed to load'); }
        })();
    }, [id]);

    useEffect(() => { if (data) setTimeout(() => window.print(), 350); }, [data]);

    if (err) return <div style={{ padding: 24, color: 'red' }}>{err}</div>;
    if (!data) return <div style={{ padding: 24 }}>Loading…</div>;

    const { package: pkg, payments, totals } = data;
    const c = pkg.client || {};
    const clientName = c.fullName || c.companyName || '—';
    const isPaid = totals.balancePKR <= 0;

    const lines = [
        { label: 'Airline', amount: pkg.pricingSummary?.airlineCostSAR || 0 },
        { label: `Makkah Hotel${pkg.pricingSummary?.makkahRateLabel ? ` (${pkg.pricingSummary.makkahRateLabel})` : ''}`, amount: pkg.pricingSummary?.makkahHotelCostSAR || 0 },
        { label: `Madinah Hotel${pkg.pricingSummary?.madinahRateLabel ? ` (${pkg.pricingSummary.madinahRateLabel})` : ''}`, amount: pkg.pricingSummary?.madinahHotelCostSAR || 0 },
        { label: 'Ziyarats', amount: pkg.pricingSummary?.ziyaratsCostSAR || 0 },
        { label: 'Transport', amount: pkg.pricingSummary?.transportCostSAR || 0 },
        { label: 'Special Services', amount: pkg.pricingSummary?.servicesCostSAR || 0 }
    ].filter(l => l.amount > 0);

    return (
        <PrintShell title="INVOICE" subtitle={`Voucher ${pkg.voucherId} · Issued ${fmtDate(new Date())}`}>
            <div className="grid-2">
                <div className="box">
                    <h3>Bill To</h3>
                    <div className="v">{clientName}</div>
                    {c.phone && <div style={{ fontSize: 11, color: '#444' }}>{c.phone}</div>}
                    {c.address && <div style={{ fontSize: 11, color: '#444' }}>{c.address}{c.city ? `, ${c.city}` : ''}</div>}
                    {c.cnic && <div style={{ fontSize: 11, color: '#444' }}>CNIC: {c.cnic}</div>}
                </div>
                <div className="box">
                    <h3>Trip</h3>
                    <div className="v">{pkg.packageName}</div>
                    <div style={{ fontSize: 11, color: '#444' }}>{fmtDate(pkg.travelDates?.departure)} → {fmtDate(pkg.travelDates?.returnDate)}</div>
                    <div style={{ fontSize: 11, color: '#444' }}>Pilgrims: {pkg.numberOfPilgrims}</div>
                </div>
            </div>

            <table className="bordered">
                <thead>
                    <tr><th>Description</th><th style={{ width: 110, textAlign: 'right' }}>Amount (SAR)</th></tr>
                </thead>
                <tbody>
                    {lines.map((l, i) => (
                        <tr key={i}><td>{l.label}</td><td style={{ textAlign: 'right' }}>{formatSAR(l.amount)}</td></tr>
                    ))}
                    <tr><td><strong>Subtotal</strong></td><td style={{ textAlign: 'right' }}><strong>{formatSAR(pkg.pricingSummary?.subtotalSAR || 0)}</strong></td></tr>
                    {pkg.pricingSummary?.markupAmountSAR > 0 && (
                        <tr><td>Markup ({pkg.pricingSummary?.markupType}, {pkg.pricingSummary?.markupValue})</td><td style={{ textAlign: 'right' }}>{formatSAR(pkg.pricingSummary?.markupAmountSAR)}</td></tr>
                    )}
                </tbody>
            </table>

            <table className="totals">
                <tbody>
                    <tr className="grand"><td>Total Due (SAR)</td><td>{formatSAR(totals.finalSAR)}</td></tr>
                    <tr><td style={{ color: '#666' }}>In PKR (today's rate)</td><td style={{ color: '#666' }}>{formatPKR(convertToPKR(totals.finalSAR))}</td></tr>
                    <tr><td>Paid (PKR)</td><td style={{ color: '#2e7d32' }}>{formatPKR(totals.totalPaidPKR + convertToPKR(totals.totalPaidSAR))}</td></tr>
                    {totals.totalPaidSAR > 0 && <tr><td>(of which SAR)</td><td style={{ color: '#2e7d32' }}>{formatSAR(totals.totalPaidSAR)}</td></tr>}
                    <tr className="balance"><td>Balance Due (PKR)</td><td>{formatPKR(Math.max(0, convertToPKR(totals.finalSAR) - totals.totalPaidPKR - convertToPKR(totals.totalPaidSAR)))}</td></tr>
                </tbody>
            </table>

            {payments.length > 0 && (
                <>
                    <h3 style={{ marginTop: 18, fontSize: 12, color: '#1a2c5b' }}>Payment History</h3>
                    <table className="bordered">
                        <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                        <tbody>
                            {payments.map(p => (
                                <tr key={p._id}>
                                    <td>{fmtDate(p.date)}</td>
                                    <td style={{ textTransform: 'capitalize' }}>{p.paymentMethod?.replace('_', ' ')}</td>
                                    <td>{p.referenceNumber || '—'}</td>
                                    <td style={{ textAlign: 'right' }}>{p.currency} {Number(p.amount).toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}

            <div style={{ marginTop: 18 }}>
                <div className={`stamp ${isPaid ? '' : 'pending'}`}>{isPaid ? 'PAID' : 'PAYMENT DUE'}</div>
            </div>
        </PrintShell>
    );
}
