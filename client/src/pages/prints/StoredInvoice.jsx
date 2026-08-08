import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../utils/api';
import PrintShell from './PrintShell';

// Printable copy of an EDITED invoice.
//
// Distinct from prints/Invoice.jsx, which renders a package's auto-generated
// invoice straight from its pricing. This one renders exactly what was saved on
// the Invoice document — whatever lines and wording the user settled on — and
// derives nothing, so the paper and the editor always agree.

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export default function StoredInvoice() {
    const { id } = useParams();
    const [inv, setInv] = useState(null);
    const [err, setErr] = useState('');

    useEffect(() => {
        (async () => {
            try { const r = await api.get(`/invoices/${id}`); setInv(r.data.data); }
            catch (e) { setErr(e.response?.data?.message || 'Failed to load'); }
        })();
    }, [id]);

    useEffect(() => { if (inv) setTimeout(() => window.print(), 350); }, [inv]);

    if (err) return <div style={{ padding: 24, color: 'red' }}>{err}</div>;
    if (!inv) return <div style={{ padding: 24 }}>Loading…</div>;

    const cur = inv.currency || 'PKR';
    const money = (n) => `${cur} ${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    const b = inv.billTo || {};
    const lines = inv.lineItems || [];

    return (
        <PrintShell
            title={inv.status === 'cancelled' ? 'INVOICE (CANCELLED)' : 'INVOICE'}
            subtitle={`${inv.invoiceNumber} · Issued ${fmtDate(inv.date)}`}
        >
            <div className="grid-2">
                <div className="box">
                    <h3>Bill To</h3>
                    <div className="v">{b.name || '—'}</div>
                    {b.address && <div>{b.address}</div>}
                    {b.phone && <div>Phone: {b.phone}</div>}
                    {b.email && <div>{b.email}</div>}
                    {b.reference && <div>Ref: {b.reference}</div>}
                </div>
                <div className="box">
                    <h3>Invoice</h3>
                    <div>Number: <strong>{inv.invoiceNumber}</strong></div>
                    <div>Date: {fmtDate(inv.date)}</div>
                    {inv.dueDate && <div>Due: {fmtDate(inv.dueDate)}</div>}
                    {inv.status === 'draft' && <div style={{ color: '#b45309' }}>DRAFT — not yet issued</div>}
                </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 14 }}>
                <thead>
                    <tr>
                        <th style={{ textAlign: 'left', background: '#1a2c5b', color: '#fff', padding: '6px 8px', border: '1px solid #bbb' }}>Description</th>
                        <th style={{ textAlign: 'right', background: '#1a2c5b', color: '#fff', padding: '6px 8px', border: '1px solid #bbb', width: 70 }}>Qty</th>
                        <th style={{ textAlign: 'right', background: '#1a2c5b', color: '#fff', padding: '6px 8px', border: '1px solid #bbb', width: 120 }}>Unit</th>
                        <th style={{ textAlign: 'right', background: '#1a2c5b', color: '#fff', padding: '6px 8px', border: '1px solid #bbb', width: 130 }}>Amount</th>
                    </tr>
                </thead>
                <tbody>
                    {lines.length === 0 ? (
                        <tr><td colSpan={4} style={{ padding: 16, textAlign: 'center', color: '#888', border: '1px solid #bbb' }}>No line items</td></tr>
                    ) : lines.map((li, i) => (
                        <tr key={i}>
                            <td style={{ padding: '5px 8px', border: '1px solid #bbb' }}>{li.description}</td>
                            <td style={{ padding: '5px 8px', border: '1px solid #bbb', textAlign: 'right' }}>{li.quantity}</td>
                            <td style={{ padding: '5px 8px', border: '1px solid #bbb', textAlign: 'right' }}>{money(li.unitPrice)}</td>
                            <td style={{ padding: '5px 8px', border: '1px solid #bbb', textAlign: 'right', fontWeight: 'bold' }}>{money(li.amount)}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr>
                        <td colSpan={3} style={{ padding: '5px 8px', border: '1px solid #bbb', textAlign: 'right' }}>Subtotal</td>
                        <td style={{ padding: '5px 8px', border: '1px solid #bbb', textAlign: 'right' }}>{money(inv.subtotal)}</td>
                    </tr>
                    {Number(inv.discount) > 0 && (
                        <tr>
                            <td colSpan={3} style={{ padding: '5px 8px', border: '1px solid #bbb', textAlign: 'right' }}>Discount</td>
                            <td style={{ padding: '5px 8px', border: '1px solid #bbb', textAlign: 'right' }}>− {money(inv.discount)}</td>
                        </tr>
                    )}
                    <tr>
                        <td colSpan={3} style={{ padding: '7px 8px', border: '1px solid #c9a66b', background: '#fff6e0', textAlign: 'right', fontWeight: 'bold' }}>Total</td>
                        <td style={{ padding: '7px 8px', border: '1px solid #c9a66b', background: '#fff6e0', textAlign: 'right', fontWeight: 'bold', fontSize: 15 }}>{money(inv.total)}</td>
                    </tr>
                    {cur === 'SAR' && (
                        <tr>
                            <td colSpan={3} style={{ padding: '4px 8px', textAlign: 'right', fontSize: 10, color: '#666' }}>
                                Converted at {inv.exchangeRate} PKR per SAR
                            </td>
                            <td style={{ padding: '4px 8px', textAlign: 'right', fontSize: 10, color: '#666' }}>
                                PKR {Number(inv.totalPKR || 0).toLocaleString()}
                            </td>
                        </tr>
                    )}
                </tfoot>
            </table>

            {(inv.notes || inv.terms) && (
                <div className="grid-2" style={{ marginTop: 14 }}>
                    {inv.notes && <div className="box"><h3>Notes</h3><div style={{ whiteSpace: 'pre-wrap' }}>{inv.notes}</div></div>}
                    {inv.terms && <div className="box"><h3>Terms</h3><div style={{ whiteSpace: 'pre-wrap' }}>{inv.terms}</div></div>}
                </div>
            )}
        </PrintShell>
    );
}
