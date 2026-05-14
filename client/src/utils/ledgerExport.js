// Ledger export helpers — CSV (xlsx), DOCX (Word XML wrapper), PDF (handled by print page).
// Used by SupplierDetail, ClientLedgerDetail, and LedgerStatement.

import * as XLSX from 'xlsx';

const fmtDate = (v) => v ? new Date(v).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const fmtMoney = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function safeFilename(s) {
    return String(s || 'ledger').replace(/[^a-z0-9_-]+/gi, '_').slice(0, 60);
}

// ── Build a normalised row set used by every export format ─────────────
export function buildLedgerRows(entries, kind = 'client') {
    // kind = 'client' | 'supplier' — controls Dr/Cr semantics labels
    return entries.map(e => ({
        date: fmtDate(e.date),
        description: e.description || '',
        reference: e.referenceNumber || '',
        category: (e.category || '').replace(/_/g, ' '),
        method: (e.paymentMethod || '').replace(/_/g, ' '),
        linked: e.package?.voucherId || e.departure?.code || '',
        type: kind === 'supplier'
            ? (e.type === 'debit' ? 'Invoice' : 'Payment')
            : (e.type === 'debit' ? 'Charge' : 'Payment'),
        debit: e.type === 'debit' ? Number(e.amount || 0) : '',
        credit: e.type === 'credit' ? Number(e.amount || 0) : '',
        currency: e.currency || 'PKR',
        amountPKR: Number(e.amountPKR || e.amount || 0),
        running: Number(e.runningBalancePKR || 0),
        notes: e.notes || ''
    }));
}

// ── CSV / XLSX export ──────────────────────────────────────────────────
export function exportLedgerXLSX({ entries, kind = 'client', partyName, partyMeta = {}, summary = {}, filters = {}, filename }) {
    const rows = buildLedgerRows(entries, kind);
    const sheetData = [];

    // Header block
    sheetData.push(['Karwan-e-Usmania — Ledger Statement']);
    sheetData.push([kind === 'supplier' ? 'Supplier' : 'Client', partyName]);
    Object.entries(partyMeta).forEach(([k, v]) => v && sheetData.push([k, String(v)]));
    if (filters.dateFrom || filters.dateTo) {
        sheetData.push(['Period', `${filters.dateFrom || 'beginning'}  →  ${filters.dateTo || 'today'}`]);
    }
    if (filters.type) sheetData.push(['Type filter', filters.type]);
    if (filters.paymentMethod) sheetData.push(['Method filter', filters.paymentMethod]);
    sheetData.push([]);

    // Column headings
    sheetData.push(['Date', 'Description', 'Reference', 'Category', 'Method', 'Linked', 'Type', 'Debit', 'Credit', 'Currency', 'Amount (PKR)', 'Running Balance (PKR)', 'Notes']);
    rows.forEach(r => sheetData.push([r.date, r.description, r.reference, r.category, r.method, r.linked, r.type, r.debit, r.credit, r.currency, r.amountPKR, r.running, r.notes]));

    // Totals
    sheetData.push([]);
    sheetData.push(['', '', '', '', '', '', 'Totals (PKR)',
        '', '', '', summary.totalDebitPKR || 0]);
    sheetData.push(['', '', '', '', '', '', 'Total Charged / Invoiced',
        '', '', '', summary.totalDebitPKR || 0]);
    sheetData.push(['', '', '', '', '', '', 'Total Paid / Received',
        '', '', '', summary.totalCreditPKR || 0]);
    sheetData.push(['', '', '', '', '', '', 'Outstanding Balance',
        '', '', '', summary.balancePKR || 0]);

    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    // Column widths
    ws['!cols'] = [
        { wch: 12 }, { wch: 40 }, { wch: 16 }, { wch: 16 }, { wch: 14 },
        { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 16 }, { wch: 30 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ledger');
    const fname = (filename || `${kind}_ledger_${safeFilename(partyName)}_${new Date().toISOString().slice(0, 10)}`) + '.xlsx';
    XLSX.writeFile(wb, fname);
}

// ── DOCX export (Word-compatible HTML, no extra deps) ──────────────────
// Word opens .doc files with a special "Word HTML" MIME type. Renders cleanly
// in Word 2007+ and LibreOffice. Lets the user edit before sending.
export function exportLedgerDOCX({ entries, kind = 'client', partyName, partyMeta = {}, summary = {}, filters = {}, filename }) {
    const rows = buildLedgerRows(entries, kind);
    const title = `${kind === 'supplier' ? 'Supplier' : 'Client'} Ledger Statement`;
    const period = (filters.dateFrom || filters.dateTo)
        ? `${filters.dateFrom || 'beginning'} → ${filters.dateTo || 'today'}`
        : 'All entries';

    const metaRows = Object.entries(partyMeta).filter(([_, v]) => v)
        .map(([k, v]) => `<tr><td style="padding:2px 6px;color:#555;">${k}</td><td style="padding:2px 6px;"><b>${v}</b></td></tr>`).join('');

    const rowsHTML = rows.map(r => `
        <tr>
            <td style="padding:4px 6px;border:1px solid #999;">${r.date}</td>
            <td style="padding:4px 6px;border:1px solid #999;">${escapeHtml(r.description)}${r.reference ? `<br/><span style="font-size:9px;color:#666;">Ref: ${escapeHtml(r.reference)}</span>` : ''}</td>
            <td style="padding:4px 6px;border:1px solid #999;">${escapeHtml(r.category)}</td>
            <td style="padding:4px 6px;border:1px solid #999;">${escapeHtml(r.method)}</td>
            <td style="padding:4px 6px;border:1px solid #999;">${escapeHtml(r.linked)}</td>
            <td style="padding:4px 6px;border:1px solid #999;text-align:right;color:${r.type.includes('vo') || r.type === 'Charge' ? '#c00' : '#080'};font-weight:bold;">
                ${r.debit ? r.currency + ' ' + fmtMoney(r.debit) : ''}
            </td>
            <td style="padding:4px 6px;border:1px solid #999;text-align:right;color:#080;font-weight:bold;">
                ${r.credit ? r.currency + ' ' + fmtMoney(r.credit) : ''}
            </td>
            <td style="padding:4px 6px;border:1px solid #999;text-align:right;">PKR ${fmtMoney(r.running)}</td>
        </tr>`).join('');

    const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${title}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
@page WordSection1 { size: 11.69in 8.27in; mso-page-orientation: landscape; margin: 0.5in 0.5in 0.5in 0.5in; }
div.WordSection1 { page: WordSection1; }
body { font-family: 'Segoe UI', Calibri, sans-serif; font-size: 11px; color: #111; }
h1 { color:#1a2c5b; margin:0 0 4px; font-size:20px; }
.tag { color:#c9a66b; letter-spacing:1px; font-size:10px; font-weight:600; }
.hdr-table { width:100%; margin-bottom:12px; }
.summary-row td { padding:6px 10px; background:#fff6e0; border:1px solid #c9a66b; font-weight:bold; }
table.ledger { border-collapse:collapse; width:100%; }
table.ledger th { background:#1a2c5b; color:#fff; padding:6px; border:1px solid #999; text-align:left; font-size:11px; }
</style></head>
<body><div class="WordSection1">
<table class="hdr-table"><tr>
    <td><h1>KARWAN-E-USMANIA</h1><div class="tag">UMRAH &amp; HAJJ SERVICES</div></td>
    <td style="text-align:right;"><div style="font-size:18px;font-weight:bold;color:#1a2c5b;">${title.toUpperCase()}</div><div style="color:#666;">Period: ${period}</div><div style="color:#666;">Generated: ${new Date().toLocaleString('en-PK')}</div></td>
</tr></table>

<table style="width:100%;margin-bottom:10px;border:1px solid #ddd;padding:6px;">
    <tr><td style="padding:2px 6px;color:#555;width:120px;">${kind === 'supplier' ? 'Supplier' : 'Client'}</td><td style="padding:2px 6px;"><b style="font-size:14px;">${escapeHtml(partyName)}</b></td></tr>
    ${metaRows}
</table>

<table class="ledger">
    <thead><tr>
        <th style="width:80px;">Date</th>
        <th>Description</th>
        <th style="width:100px;">Category</th>
        <th style="width:90px;">Method</th>
        <th style="width:80px;">Linked</th>
        <th style="width:110px;text-align:right;">${kind === 'supplier' ? 'Invoice (Dr)' : 'Charge (Dr)'}</th>
        <th style="width:110px;text-align:right;">Payment (Cr)</th>
        <th style="width:120px;text-align:right;">Balance (PKR)</th>
    </tr></thead>
    <tbody>${rowsHTML || '<tr><td colspan="8" style="padding:18px;text-align:center;color:#888;">No entries</td></tr>'}</tbody>
    <tfoot>
        <tr class="summary-row"><td colspan="5" style="text-align:right;">Total ${kind === 'supplier' ? 'Invoiced' : 'Charged'} (PKR)</td><td style="text-align:right;">${fmtMoney(summary.totalDebitPKR)}</td><td></td><td></td></tr>
        <tr class="summary-row"><td colspan="5" style="text-align:right;">Total ${kind === 'supplier' ? 'Paid' : 'Received'} (PKR)</td><td></td><td style="text-align:right;">${fmtMoney(summary.totalCreditPKR)}</td><td></td></tr>
        <tr class="summary-row"><td colspan="5" style="text-align:right;">${kind === 'supplier' ? 'Outstanding Payable' : 'Outstanding Receivable'}</td><td></td><td></td><td style="text-align:right;font-size:14px;">PKR ${fmtMoney(summary.balancePKR)}</td></tr>
    </tfoot>
</table>

<p style="margin-top:18px;font-size:10px;color:#777;">This statement is computer-generated by Karwan-e-Usmania CRM.</p>
</div></body></html>`;

    const blob = new Blob(['﻿', html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = (filename || `${kind}_ledger_${safeFilename(partyName)}_${new Date().toISOString().slice(0, 10)}`) + '.doc';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Convenience: open the printable statement page in a new tab (becomes PDF via browser print)
export function openLedgerPrint({ kind, partyId, filters = {} }) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) params.append(k, v); });
    const qs = params.toString();
    const path = kind === 'supplier'
        ? `/print/ledger-statement/supplier/${partyId}${qs ? '?' + qs : ''}`
        : `/print/ledger-statement/${filters.clientType || 'B2C'}/${partyId}${qs ? '?' + qs : ''}`;
    window.open(path, '_blank');
}
