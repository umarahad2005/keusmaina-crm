import { useState, useEffect } from 'react';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import { MdLockOpen } from 'react-icons/md';

// Month-end profit closing.
//
// Divides the month into N equal shares: one for the office, the rest for
// partners. N is asked for every time because the number of partners is not
// always the same.
//
// What gets divided is:
//
//     money RECEIVED from clients
//   − every supplier bill INVOICED for the month (payable and paid alike)
//   − the month's expenses
//
// The two sides are measured differently on purpose: only client money we are
// actually holding counts, but the full supplier bill counts even when unpaid,
// because it is already committed and must not be handed out.
//
// The server snapshots the figures when the close is taken, so a later
// back-dated invoice or corrected expense cannot quietly change what partners
// were told they were owed. Restating a month means reopening it explicitly.

const lastFullMonth = () => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export default function ClosingView({ formatPKR }) {
    const [month, setMonth] = useState(lastFullMonth());
    const [parts, setParts] = useState(6);
    const [preview, setPreview] = useState(null);
    const [history, setHistory] = useState([]);
    const [busy, setBusy] = useState(false);
    const [notes, setNotes] = useState('');

    const loadPreview = async (m, p) => {
        try {
            const r = await api.get(`/closings/preview?month=${m}&parts=${p}`);
            setPreview(r.data.data);
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to preview');
            setPreview(null);
        }
    };
    const loadHistory = async () => {
        try { const r = await api.get('/closings'); setHistory(r.data.data || []); }
        catch { /* history is secondary — no need to nag */ }
    };

    // Both loaders are async — their setState runs after the awaited request,
    // not synchronously in the effect body, so the rule misfires here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { loadPreview(month, parts); }, [month, parts]);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { loadHistory(); }, []);

    const takeClosing = async () => {
        if (!preview) return;
        if (!confirm(`Close ${month} and divide ${formatPKR(preview.distributedPKR)} (received − supplier invoices − expenses) into ${parts} share(s)?`)) return;
        setBusy(true);
        try {
            await api.post('/closings', { month, parts, notes });
            toast.success(`${month} closed`);
            setNotes('');
            await Promise.all([loadPreview(month, parts), loadHistory()]);
        } catch (e) { toast.error(e.response?.data?.message || 'Failed to close'); }
        finally { setBusy(false); }
    };

    const reopen = async (row) => {
        if (!confirm(`Reopen ${row.periodMonth}? The recorded shares are deleted so the month can be restated.`)) return;
        try {
            await api.delete(`/closings/${row._id}`);
            toast.success(`${row.periodMonth} reopened`);
            await Promise.all([loadPreview(month, parts), loadHistory()]);
        } catch (e) { toast.error(e.response?.data?.message || 'Failed to reopen'); }
    };

    const partnerCount = Math.max(0, parts - 1);

    return (
        <div>
            <div className="card mb-4">
                <div className="card-body grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                        <label className="label text-xs">Month to close</label>
                        <input type="month" className="input" value={month} onChange={e => setMonth(e.target.value)} />
                    </div>
                    <div>
                        <label className="label text-xs">Number of parts</label>
                        <input type="number" min="1" max="50" className="input" value={parts}
                            onChange={e => setParts(Math.min(50, Math.max(1, parseInt(e.target.value, 10) || 1)))} />
                        <p className="text-[11px] text-gray-500 mt-1">
                            1 office + {partnerCount} partner{partnerCount === 1 ? '' : 's'}
                        </p>
                    </div>
                    <div>
                        <label className="label text-xs">Notes (optional)</label>
                        <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Ramadan season close" />
                    </div>
                </div>
            </div>

            {preview && (
                <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                        <div className="stat-card">
                            <p className="stat-label">Revenue (Booked)</p>
                            <p className="stat-value text-green-700 text-base">{formatPKR(preview.revenuePKR)}</p>
                            <p className="text-[11px] text-gray-500">
                                {preview.packageCount} package(s) · {preview.directChargeCount ?? 0} direct charge(s)
                            </p>
                        </div>
                        <div className="stat-card">
                            <p className="stat-label">Supplier COGS</p>
                            <p className="stat-value text-red-600 text-base">{formatPKR(preview.cogsPKR)}</p>
                        </div>
                        <div className="stat-card">
                            <p className="stat-label">Operating Expenses</p>
                            <p className="stat-value text-orange-600 text-base">{formatPKR(preview.opexPKR)}</p>
                        </div>
                        <div className="stat-card">
                            <p className="stat-label">Net Profit (earned)</p>
                            <p className={`stat-value text-base ${preview.netProfitPKR < 0 ? 'text-red-600' : 'text-navy-800'}`}>
                                {formatPKR(preview.netProfitPKR)}
                            </p>
                        </div>
                    </div>

                    {/* The close, shown as the subtraction it is. */}
                    <div className="card mb-4">
                        <div className="card-body">
                            <h3 className="font-bold text-sm text-navy-800 mb-2">What is available to divide</h3>
                            <div className="flex items-center gap-2 flex-wrap text-sm">
                                <span className="px-3 py-2 rounded-lg bg-green-50 border border-green-200">
                                    <span className="block text-[11px] text-gray-600">Received from clients</span>
                                    <b className="text-green-700">{formatPKR(preview.cashInPKR)}</b>
                                </span>
                                <span className="text-gray-400 font-bold">−</span>
                                <span className="px-3 py-2 rounded-lg bg-red-50 border border-red-200">
                                    <span className="block text-[11px] text-gray-600">Supplier invoices (payable + paid)</span>
                                    <b className="text-red-600">{formatPKR(preview.cogsPKR)}</b>
                                </span>
                                <span className="text-gray-400 font-bold">−</span>
                                <span className="px-3 py-2 rounded-lg bg-orange-50 border border-orange-200">
                                    <span className="block text-[11px] text-gray-600">Expenses</span>
                                    <b className="text-orange-600">{formatPKR(preview.opexPKR)}</b>
                                </span>
                                <span className="text-gray-400 font-bold">=</span>
                                <span className="px-4 py-2 rounded-lg bg-gold-50 border-2 border-gold-500">
                                    <span className="block text-[11px] text-gray-600">Distributable profit</span>
                                    <b className={`text-lg ${preview.netReceivedPKR < 0 ? 'text-red-600' : 'text-navy-800'}`}>{formatPKR(preview.netReceivedPKR)}</b>
                                </span>
                            </div>
                            <p className="text-[11px] text-gray-500 mt-2">
                                Only client money actually received counts, but the <strong>full</strong> supplier bill counts
                                even where it is still unpaid — that money is already committed and must not be handed out.
                            </p>
                            {preview.revenuePKR > preview.cashInPKR && (
                                <p className="text-[11px] text-gray-600 mt-1">
                                    For reference: <strong>{formatPKR(preview.revenuePKR)}</strong> was billed this month,
                                    so <strong>{formatPKR(preview.revenuePKR - preview.cashInPKR)}</strong> is still to be collected
                                    and is not part of this close.
                                </p>
                            )}
                        </div>
                    </div>

                    {preview.distributedPKR < 0 && (
                        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                            This month is negative — closing it records a negative share against every part.
                        </div>
                    )}

                    <div className="card mb-4">
                        <div className="card-body">
                            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                                <h3 className="font-bold text-sm text-navy-800">
                                    Proposed split — {formatPKR(preview.distributedPKR)} over {preview.parts} part{preview.parts === 1 ? '' : 's'}
                                    <span className="ml-2 text-[11px] font-normal text-gray-500">
                                        (received − supplier invoices − expenses)
                                    </span>
                                </h3>
                                {preview.alreadyClosed ? (
                                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-200 text-gray-600">
                                        Already closed{preview.closedAt ? ` ${new Date(preview.closedAt).toLocaleDateString('en-PK')}` : ''}
                                    </span>
                                ) : (
                                    <button onClick={takeClosing} disabled={busy} className="btn-gold btn-sm disabled:opacity-50">
                                        {busy ? 'Closing…' : `Close ${month}`}
                                    </button>
                                )}
                            </div>
                            <div className="table-container">
                                <table className="data-table">
                                    <thead><tr><th>Share</th><th>Type</th><th className="text-right">Amount (PKR)</th></tr></thead>
                                    <tbody>
                                        {preview.shares.map((s, i) => (
                                            <tr key={i}>
                                                <td className="font-medium">{s.label}</td>
                                                <td>
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${s.kind === 'office' ? 'bg-navy-100 text-navy-800' : 'bg-gold-100 text-gold-700'}`}>
                                                        {s.kind}
                                                    </span>
                                                </td>
                                                <td className="text-right font-semibold">{formatPKR(s.amountPKR)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {preview.roundingPKR > 0 && (
                                <p className="text-[11px] text-gray-500 mt-2">
                                    {formatPKR(preview.roundingPKR)} rounding remainder goes to the office share, so the parts total exactly.
                                </p>
                            )}
                        </div>
                    </div>
                </>
            )}

            <div className="card">
                <div className="card-body">
                    <h3 className="font-bold text-sm text-navy-800 mb-3">Closing history</h3>
                    {history.length === 0 ? (
                        <p className="text-sm text-gray-400 py-6 text-center">No months closed yet.</p>
                    ) : (
                        <div className="table-container">
                            <table className="data-table">
                                <thead><tr>
                                    <th>Month</th>
                                    <th>Basis</th><th className="text-right">Divided</th>
                                    <th className="text-right">Parts</th>
                                    <th className="text-right">Per partner</th>
                                    <th>Closed</th>
                                    <th className="text-right">Actions</th>
                                </tr></thead>
                                <tbody>
                                    {history.map(h => (
                                        <tr key={h._id}>
                                            <td className="font-mono font-semibold">{h.periodMonth}</td>
                                            {/* Older closings were taken on a cash or accrual basis; they
                                                keep their original label so history stays honest. */}
                                            <td className="text-[11px] text-gray-600">
                                                {h.basis === 'net_received' || !h.basis
                                                    ? 'Received − supplier − expenses'
                                                    : h.basis === 'cash' ? 'Net cash (legacy)' : 'Net profit (legacy)'}
                                            </td>
                                            <td className="text-right">{formatPKR(h.distributedPKR ?? h.netProfitPKR)}</td>
                                            <td className="text-right">{h.parts}</td>
                                            <td className="text-right">
                                                {formatPKR(h.shares?.find(s => s.kind === 'partner')?.amountPKR ?? h.shares?.[0]?.amountPKR ?? 0)}
                                            </td>
                                            <td className="text-xs text-gray-500">
                                                {h.closedAt ? new Date(h.closedAt).toLocaleDateString('en-PK') : '—'}
                                                {h.closedBy?.name ? ` · ${h.closedBy.name}` : ''}
                                            </td>
                                            <td className="text-right">
                                                <button onClick={() => reopen(h)} className="btn-ghost btn-sm text-red-500 flex items-center gap-1 ml-auto" title="Reopen to restate">
                                                    <MdLockOpen size={14} /> Reopen
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
