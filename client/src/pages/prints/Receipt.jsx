import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../utils/api';
import PrintShell from './PrintShell';

const fmtDate = (v) => v ? new Date(v).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// Number-to-words (basic English) for receipt amounts
function amountInWords(n) {
    n = Math.round(Number(n) || 0);
    if (n === 0) return 'Zero';
    const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const helper = (num) => {
        if (num === 0) return '';
        if (num < 20) return units[num];
        if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + units[num % 10] : '');
        if (num < 1000) return units[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' ' + helper(num % 100) : '');
        return '';
    };
    let words = '';
    const crore = Math.floor(n / 10000000); n %= 10000000;
    const lakh = Math.floor(n / 100000); n %= 100000;
    const thousand = Math.floor(n / 1000); n %= 1000;
    if (crore) words += helper(crore) + ' Crore ';
    if (lakh) words += helper(lakh) + ' Lakh ';
    if (thousand) words += helper(thousand) + ' Thousand ';
    if (n) words += helper(n);
    return words.trim() + ' Only';
}

export default function Receipt() {
    const { entryId } = useParams();
    const [entry, setEntry] = useState(null);
    const [err, setErr] = useState('');

    useEffect(() => {
        (async () => {
            try { const r = await api.get(`/ledger/${entryId}`); setEntry(r.data.data); }
            catch (e) { setErr(e.response?.data?.message || 'Failed to load'); }
        })();
    }, [entryId]);

    useEffect(() => { if (entry) setTimeout(() => window.print(), 350); }, [entry]);

    if (err) return <div style={{ padding: 24, color: 'red' }}>{err}</div>;
    if (!entry) return <div style={{ padding: 24 }}>Loading…</div>;

    const c = entry.client || {};
    const isCredit = entry.type === 'credit';

    return (
        <PrintShell title={isCredit ? 'PAYMENT RECEIPT' : 'DEBIT NOTE'} subtitle={`Receipt # ${String(entry._id).slice(-8).toUpperCase()} · ${fmtDate(entry.date)}`}>
            <div className="grid-2">
                <div className="box">
                    <h3>Received From</h3>
                    <div className="v">{c.fullName || c.companyName || '—'}</div>
                    {c.phone && <div style={{ fontSize: 11, color: '#444' }}>{c.phone}</div>}
                    {c.cnic && <div style={{ fontSize: 11, color: '#444' }}>CNIC: {c.cnic}</div>}
                    <div style={{ fontSize: 11, color: '#444' }}>{entry.clientType}</div>
                </div>
                <div className="box">
                    <h3>Against</h3>
                    <div className="v">{entry.package?.voucherId || entry.voucherId || '— No package linked —'}</div>
                    {entry.package?.packageName && <div style={{ fontSize: 11, color: '#444' }}>{entry.package.packageName}</div>}
                    {entry.package?.travelDates?.departure && <div style={{ fontSize: 11, color: '#444' }}>Departure: {fmtDate(entry.package.travelDates.departure)}</div>}
                </div>
            </div>

            <table className="bordered">
                <tbody>
                    <tr><th style={{ width: '22%' }}>Description</th><td colSpan="3">{entry.description}</td></tr>
                    <tr><th>Payment Method</th><td style={{ textTransform: 'capitalize' }}>{entry.paymentMethod?.replace('_', ' ')}</td>
                        <th style={{ width: '18%' }}>Reference</th><td>{entry.referenceNumber || '—'}</td></tr>
                    <tr><th>Date</th><td>{fmtDate(entry.date)}</td>
                        <th>Currency</th><td>{entry.currency}</td></tr>
                </tbody>
            </table>

            <div style={{ marginTop: 14, padding: 14, background: '#fffbe8', border: '2px solid #c9a66b', borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 1 }}>Amount {isCredit ? 'Received' : 'Charged'}</div>
                <div style={{ fontSize: 28, fontWeight: 'bold', color: '#1a2c5b' }}>{entry.currency} {Number(entry.amount).toLocaleString()}</div>
                <div style={{ fontSize: 11, color: '#444', marginTop: 4, fontStyle: 'italic' }}>({entry.currency === 'PKR' ? 'Pakistani Rupees' : 'Saudi Riyals'} {amountInWords(entry.amount)})</div>
            </div>

            {entry.notes && (
                <div className="box" style={{ marginTop: 12 }}>
                    <h3>Notes</h3>
                    <div style={{ fontSize: 11 }}>{entry.notes}</div>
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 30 }}>
                <div className="stamp">{isCredit ? 'RECEIVED' : 'CHARGED'}</div>
                <div style={{ textAlign: 'right', fontSize: 11 }}>
                    <div style={{ marginTop: 38, borderTop: '1px solid #888', paddingTop: 4, width: 200, display: 'inline-block' }}>Authorized Signature</div>
                </div>
            </div>
        </PrintShell>
    );
}
