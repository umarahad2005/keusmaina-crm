import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import api from '../../utils/api';
import PrintShell from './PrintShell';

const fmtDate = (v) => v ? new Date(v).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtMoney = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

// Renders a full ledger statement for printing / saving as PDF.
//
//   /print/ledger-statement/supplier/:id?dateFrom=&dateTo=&type=&paymentMethod=...
//   /print/ledger-statement/:clientType/:id?...   (clientType = B2C or B2B)
export default function LedgerStatement() {
    const { kind, id } = useParams();
    const [search] = useSearchParams();
    const [data, setData] = useState(null);
    const [err, setErr] = useState('');

    const isSupplier = kind === 'supplier';
    const clientType = isSupplier ? null : kind;

    useEffect(() => {
        (async () => {
            try {
                const qs = search.toString();
                const url = isSupplier
                    ? `/suppliers/${id}${qs ? '?' + qs : ''}`
                    : `/ledger/client/${clientType}/${id}${qs ? '?' + qs : ''}`;
                const r = await api.get(url);
                setData(r.data.data);
            } catch (e) {
                setErr(e.response?.data?.message || 'Failed to load statement');
            }
        })();
    }, [kind, id, search.toString()]);

    useEffect(() => { if (data) setTimeout(() => window.print(), 400); }, [data]);

    if (err) return <div style={{ padding: 24, color: 'red' }}>{err}</div>;
    if (!data) return <div style={{ padding: 24 }}>Loading…</div>;

    const partyName = isSupplier
        ? data.name
        : (data.client?.fullName || data.client?.companyName || '—');
    const partyMeta = isSupplier ? {
        Type: data.type,
        'Contact Person': data.contactPerson,
        Phone: data.phone,
        City: data.city
    } : {
        ...(data.clientType === 'B2B' ? { 'Agent Code': data.client?.agentCode } : {}),
        ...(data.clientType === 'B2C' ? { CNIC: data.client?.cnic, Passport: data.client?.passportNumber } : {}),
        Phone: data.client?.phone,
        City: data.client?.city
    };

    const entries = isSupplier ? (data.ledger || []) : (data.entries || []);
    const ft = data.filteredTotals || {};
    const overall = isSupplier
        ? { totalDebitPKR: data.totalDebit, totalCreditPKR: data.totalCredit, balancePKR: data.balancePKR }
        : { totalDebitPKR: data.balance?.totalDebitPKR ?? data.balance?.totalDebit, totalCreditPKR: data.balance?.totalCreditPKR ?? data.balance?.totalCredit, balancePKR: data.balance?.balancePKR ?? data.balance?.balance };

    const dateFrom = search.get('dateFrom');
    const dateTo = search.get('dateTo');
    const period = (dateFrom || dateTo) ? `${dateFrom || 'beginning'} → ${dateTo || 'today'}` : 'All entries';

    const docTitle = isSupplier ? 'SUPPLIER LEDGER' : `${clientType} CLIENT LEDGER`;
    const subtitle = `${partyName} · Period: ${period}`;

    return (
        <PrintShell title={docTitle} subtitle={subtitle}>
            <style>{`
                table.ledger-table { width:100%; border-collapse: collapse; margin-top: 8px; font-size: 11px; }
                table.ledger-table th { background:#1a2c5b; color:#fff; padding:6px 7px; border:1px solid #999; text-align:left; font-size:10px; }
                table.ledger-table td { padding:5px 7px; border:1px solid #bbb; vertical-align:top; }
                .num { text-align:right; font-variant-numeric: tabular-nums; }
                .dr { color:#c00; font-weight:600; }
                .cr { color:#080; font-weight:600; }
                .tot-row td { background:#fff6e0; font-weight:bold; }
                .grand td { background:#1a2c5b; color:#fff; font-size:13px; }
                .meta-table td { padding:2px 8px; font-size:11px; }
                @media print { .ledger-table { font-size: 9.5px; } }
            `}</style>

            <div className="grid-2">
                <div className="box">
                    <h3>{isSupplier ? 'Supplier' : 'Client'}</h3>
                    <div className="v">{partyName}</div>
                    <table className="meta-table">
                        <tbody>
                            {Object.entries(partyMeta).filter(([_, v]) => v).map(([k, v]) => (
                                <tr key={k}><td style={{ color: '#666' }}>{k}</td><td>{v}</td></tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="box">
                    <h3>Overall Position</h3>
                    <table className="meta-table">
                        <tbody>
                            {isSupplier && <tr><td>Opening Balance</td><td className="num">PKR {fmtMoney(data.openingBalancePKR)}</td></tr>}
                            <tr><td>Total {isSupplier ? 'Invoiced' : 'Charged'}</td><td className="num dr">PKR {fmtMoney(overall.totalDebitPKR)}</td></tr>
                            <tr><td>Total {isSupplier ? 'Paid' : 'Received'}</td><td className="num cr">PKR {fmtMoney(overall.totalCreditPKR)}</td></tr>
                            <tr><td><b>Outstanding {isSupplier ? 'Payable' : 'Receivable'}</b></td><td className="num"><b style={{ color: overall.balancePKR > 0 ? '#c00' : '#080', fontSize: 13 }}>PKR {fmtMoney(overall.balancePKR)}</b></td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <table className="ledger-table">
                <thead>
                    <tr>
                        <th style={{ width: 64 }}>Date</th>
                        <th>Description</th>
                        <th style={{ width: 80 }}>Category</th>
                        <th style={{ width: 70 }}>Method</th>
                        <th style={{ width: 70 }}>Linked</th>
                        <th style={{ width: 90 }} className="num">{isSupplier ? 'Invoice (Dr)' : 'Charge (Dr)'}</th>
                        <th style={{ width: 90 }} className="num">Payment (Cr)</th>
                        <th style={{ width: 100 }} className="num">Balance (PKR)</th>
                    </tr>
                </thead>
                <tbody>
                    {entries.length === 0 ? (
                        <tr><td colSpan="8" style={{ textAlign: 'center', padding: 24, color: '#888' }}>No entries match the selected filters.</td></tr>
                    ) : entries.map(e => (
                        <tr key={e._id}>
                            <td>{fmtDate(e.date)}</td>
                            <td>
                                {e.description}
                                {e.referenceNumber && <div style={{ fontSize: 9, color: '#666' }}>Ref: {e.referenceNumber}</div>}
                            </td>
                            <td style={{ textTransform: 'capitalize' }}>{e.category?.replace('_', ' ') || '—'}</td>
                            <td style={{ textTransform: 'capitalize' }}>{e.paymentMethod?.replace('_', ' ')}</td>
                            <td>{e.package?.voucherId || e.departure?.code || '—'}</td>
                            <td className="num dr">{e.type === 'debit' ? `${e.currency} ${fmtMoney(e.amount)}` : ''}</td>
                            <td className="num cr">{e.type === 'credit' ? `${e.currency} ${fmtMoney(e.amount)}` : ''}</td>
                            <td className="num">{fmtMoney(e.runningBalancePKR)}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr className="tot-row">
                        <td colSpan="5" className="num">Filtered Total {isSupplier ? 'Invoiced' : 'Charged'} (PKR)</td>
                        <td className="num dr">{fmtMoney(ft.totalDebitPKR)}</td>
                        <td></td><td></td>
                    </tr>
                    <tr className="tot-row">
                        <td colSpan="5" className="num">Filtered Total {isSupplier ? 'Paid' : 'Received'} (PKR)</td>
                        <td></td>
                        <td className="num cr">{fmtMoney(ft.totalCreditPKR)}</td>
                        <td></td>
                    </tr>
                    <tr className="grand">
                        <td colSpan="5" className="num">Net for period (PKR)</td>
                        <td></td><td></td>
                        <td className="num">{fmtMoney(ft.balancePKR)}</td>
                    </tr>
                </tfoot>
            </table>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 30, fontSize: 11 }}>
                <div style={{ flex: 1 }}>
                    <p style={{ marginTop: 0, color: '#666' }}>
                        Statement reflects {entries.length} {entries.length === 1 ? 'entry' : 'entries'} for the period shown.
                        Outstanding balance figure includes all entries (unfiltered).
                    </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ marginTop: 38, borderTop: '1px solid #888', paddingTop: 4, width: 200, display: 'inline-block' }}>Authorized Signature</div>
                </div>
            </div>
        </PrintShell>
    );
}
