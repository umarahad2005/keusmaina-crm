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
    const isB2B = pkg.clientType === 'B2B' || !!c.companyName;
    const clientName = isB2B ? (c.companyName || c.fullName) : (c.fullName || c.companyName) || '—';
    const isPaid = totals.balancePKR <= 0;

    // A fixed-source package is bought whole at a contracted PKR price — it has
    // no SAR component breakdown, so the per-component table would render as
    // empty with a SAR 0 total. Bill it as the single line it actually is.
    const isFixed = pkg.source === 'fixed';

    const lines = isFixed ? [] : [
        { label: 'Airline', amount: pkg.pricingSummary?.airlineCostSAR || 0 },
        { label: `Makkah Hotel${pkg.pricingSummary?.makkahRateLabel ? ` (${pkg.pricingSummary.makkahRateLabel})` : ''}`, amount: pkg.pricingSummary?.makkahHotelCostSAR || 0 },
        { label: `Madinah Hotel${pkg.pricingSummary?.madinahRateLabel ? ` (${pkg.pricingSummary.madinahRateLabel})` : ''}`, amount: pkg.pricingSummary?.madinahHotelCostSAR || 0 },
        { label: 'Ziyarats', amount: pkg.pricingSummary?.ziyaratsCostSAR || 0 },
        { label: 'Transport', amount: pkg.pricingSummary?.transportCostSAR || 0 },
        { label: 'Special Services', amount: pkg.pricingSummary?.servicesCostSAR || 0 }
    ].filter(l => l.amount > 0);

    // Always bill the server's finalPKR. Re-deriving it here as
    // convertToPKR(finalSAR) billed every fixed-package sale as PKR 0, since a
    // fixed package carries no SAR price at all.
    const totalDuePKR = totals.finalPKR || 0;
    const paidTotalPKR = (totals.totalPaidPKR || 0) + convertToPKR(totals.totalPaidSAR || 0);
    const perPaxPKR = pkg.numberOfPilgrims > 0 ? Math.round(totalDuePKR / pkg.numberOfPilgrims) : totalDuePKR;

    return (
        <PrintShell title="INVOICE" subtitle={`Voucher ${pkg.voucherId} · Issued ${fmtDate(new Date())}`}>
            <div className="grid-2">
                <div className="box">
                    <h3>Bill To</h3>
                    <div className="v">{clientName}</div>
                    {/* B2B and B2C carry different identifying fields — an agent
                        needs their code and contact person, a pilgrim their CNIC. */}
                    {isB2B ? (
                        <>
                            {c.agentCode && <div style={{ fontSize: 11, color: '#444' }}>Agent Code: <strong>{c.agentCode}</strong></div>}
                            {c.contactPerson && <div style={{ fontSize: 11, color: '#444' }}>Attn: {c.contactPerson}</div>}
                            {c.phone && <div style={{ fontSize: 11, color: '#444' }}>{c.phone}{c.whatsapp && c.whatsapp !== c.phone ? ` · WhatsApp ${c.whatsapp}` : ''}</div>}
                            {c.email && <div style={{ fontSize: 11, color: '#444' }}>{c.email}</div>}
                            {c.address && <div style={{ fontSize: 11, color: '#444' }}>{c.address}{c.city ? `, ${c.city}` : ''}</div>}
                        </>
                    ) : (
                        <>
                            {c.phone && <div style={{ fontSize: 11, color: '#444' }}>{c.phone}</div>}
                            {c.address && <div style={{ fontSize: 11, color: '#444' }}>{c.address}{c.city ? `, ${c.city}` : ''}</div>}
                            {c.cnic && <div style={{ fontSize: 11, color: '#444' }}>CNIC: {c.cnic}</div>}
                            {c.passportNumber && <div style={{ fontSize: 11, color: '#444' }}>Passport: {c.passportNumber}</div>}
                        </>
                    )}
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
                    <tr><th>Description</th><th style={{ width: 130, textAlign: 'right' }}>Amount ({isFixed ? 'PKR' : 'SAR'})</th></tr>
                </thead>
                <tbody>
                    {isFixed ? (
                        <>
                            <tr>
                                <td>{pkg.packageName} — fixed package, {pkg.numberOfPilgrims} pilgrim{pkg.numberOfPilgrims === 1 ? '' : 's'} × {formatPKR(perPaxPKR)}</td>
                                <td style={{ textAlign: 'right' }}>{formatPKR(totalDuePKR)}</td>
                            </tr>
                            <tr><td><strong>Subtotal</strong></td><td style={{ textAlign: 'right' }}><strong>{formatPKR(totalDuePKR)}</strong></td></tr>
                        </>
                    ) : (
                        <>
                            {lines.map((l, i) => (
                                <tr key={i}><td>{l.label}</td><td style={{ textAlign: 'right' }}>{formatSAR(l.amount)}</td></tr>
                            ))}
                            <tr><td><strong>Subtotal</strong></td><td style={{ textAlign: 'right' }}><strong>{formatSAR(pkg.pricingSummary?.subtotalSAR || 0)}</strong></td></tr>
                            {pkg.pricingSummary?.markupAmountSAR > 0 && (
                                <tr><td>Markup ({pkg.pricingSummary?.markupType}, {pkg.pricingSummary?.markupValue})</td><td style={{ textAlign: 'right' }}>{formatSAR(pkg.pricingSummary?.markupAmountSAR)}</td></tr>
                            )}
                        </>
                    )}
                </tbody>
            </table>

            <table className="totals">
                <tbody>
                    {/* PKR is the billed currency in every case. A fixed package
                        has no SAR figure at all, so that row is omitted. */}
                    <tr className="grand"><td>Total Due (PKR)</td><td>{formatPKR(totalDuePKR)}</td></tr>
                    {!isFixed && totals.finalSAR > 0 && (
                        <tr><td style={{ color: '#666' }}>Priced in SAR (converted at today's rate)</td><td style={{ color: '#666' }}>{formatSAR(totals.finalSAR)}</td></tr>
                    )}
                    <tr><td>Paid (PKR)</td><td style={{ color: '#2e7d32' }}>{formatPKR(paidTotalPKR)}</td></tr>
                    {totals.totalPaidSAR > 0 && <tr><td>(of which SAR)</td><td style={{ color: '#2e7d32' }}>{formatSAR(totals.totalPaidSAR)}</td></tr>}
                    <tr className="balance"><td>Balance Due (PKR)</td><td>{formatPKR(totals.balancePKR)}</td></tr>
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
