// Reports & Analytics export — Excel, Word and PDF.
//
// All three formats render from ONE model built by buildReportModel(), so a
// downloaded file can never disagree with what is on screen or with the other
// formats. Follows the same conventions as ledgerExport.js.
//
// html2pdf pulls in jsPDF + html2canvas (~1 MB), so it is imported lazily —
// only someone who actually clicks "PDF" pays for it.

import * as XLSX from 'xlsx';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (k) => { const [y, m] = k.split('-'); return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y.slice(2)}`; };
const money = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const pkr = (n) => 'PKR ' + money(n);
const stamp = () => new Date().toISOString().slice(0, 10);

function escapeHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const titleCase = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

// ── The single source of truth for every export format ─────────────────────
export function buildReportModel({ pnl, overview, from, to, catLabel = {} }) {
    const p = pnl || {};
    const rev = p.revenue || {};
    const cogs = p.cogs || {};
    const opex = p.opex || {};

    const summary = [
        ['Revenue (Booked)', rev.bookedPKR, `${rev.bookedCount || 0} package(s)`],
        ['Cash Received', rev.cashReceivedPKR, 'Client ledger credits in period'],
        ['Cost of Goods (Supplier, invoiced)', cogs.invoicedPKR, 'Supplier ledger debits'],
        ['Cost of Goods (Supplier, paid)', cogs.paidPKR, 'Supplier ledger credits'],
        ['Operating Expenses', opex.totalPKR, `${opex.count || 0} entr${opex.count === 1 ? 'y' : 'ies'}`],
        ['Gross Profit', p.grossProfitPKR, `Gross margin ${p.grossMarginPct ?? 0}%`],
        ['Net Profit', p.netProfitPKR, `Net margin ${p.netMarginPct ?? 0}%`],
        ['Net Cash Flow', p.netCashFlowPKR, 'Cash received − supplier paid − opex'],
    ];

    const byCategory = (opex.byCategory || []).map(c => [
        catLabel[c.category] || titleCase(c.category), c.total, c.count
    ]);

    const trend = (p.series || []).map(s => [
        monthLabel(s.month), s.revenuePKR, s.cogsPKR, s.opexPKR, s.netPKR
    ]);

    const o = overview || {};
    const counts = o.counts || {};
    const fin = o.financial || {};
    const overviewRows = [
        ['Packages (active)', counts.packages],
        ['B2C Clients', counts.b2cClients],
        ['B2B Agents', counts.b2bClients],
        ['Airlines', counts.airlines],
        ['Hotels — Makkah', counts.hotelsMakkah],
        ['Hotels — Madinah', counts.hotelsMadinah],
        ['Revenue booked (all time, PKR)', fin.revenue],
        ['Cash received (all time, PKR)', fin.cashReceived],
        ['Outstanding receivable (PKR)', fin.outstanding],
    ];
    const byType = (o.packageByType || []).map(t => [t._id || 'Unspecified', t.count]);
    const byStatus = (o.packageByStatus || []).map(s => [titleCase(s._id), s.count]);

    return {
        title: 'Reports & Analytics',
        period: `${from} → ${to}`,
        generated: new Date().toLocaleString('en-PK'),
        summary, byCategory, trend, overviewRows, byType, byStatus,
    };
}

// ── Excel ──────────────────────────────────────────────────────────────────
// Numbers stay numeric so the recipient can pivot and total them.
export function exportReportXLSX(model) {
    const wb = XLSX.utils.book_new();

    const head = [
        ['Karwan-e-Usmania — Reports & Analytics'],
        ['Period', model.period],
        ['Generated', model.generated],
        [],
    ];

    const pl = [...head, ['Profit & Loss'], ['Line', 'Amount (PKR)', 'Basis']];
    model.summary.forEach(r => pl.push([r[0], Number(r[1] || 0), r[2]]));
    pl.push([], ['Operating Expenses by Category'], ['Category', 'Amount (PKR)', 'Entries']);
    model.byCategory.forEach(r => pl.push([r[0], Number(r[1] || 0), r[2]]));
    const wsPl = XLSX.utils.aoa_to_sheet(pl);
    wsPl['!cols'] = [{ wch: 38 }, { wch: 18 }, { wch: 34 }];
    XLSX.utils.book_append_sheet(wb, wsPl, 'Profit & Loss');

    const tr = [['12-Month Trend'], ['Month', 'Revenue (PKR)', 'COGS (PKR)', 'Opex (PKR)', 'Net (PKR)']];
    model.trend.forEach(r => tr.push([r[0], Number(r[1] || 0), Number(r[2] || 0), Number(r[3] || 0), Number(r[4] || 0)]));
    const wsTr = XLSX.utils.aoa_to_sheet(tr);
    wsTr['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsTr, 'Monthly Trend');

    const ov = [['Overview (all time)'], ['Metric', 'Value']];
    model.overviewRows.forEach(r => ov.push([r[0], Number(r[1] || 0)]));
    ov.push([], ['Packages by Type'], ['Type', 'Count']);
    model.byType.forEach(r => ov.push([r[0], Number(r[1] || 0)]));
    ov.push([], ['Packages by Status'], ['Status', 'Count']);
    model.byStatus.forEach(r => ov.push([r[0], Number(r[1] || 0)]));
    const wsOv = XLSX.utils.aoa_to_sheet(ov);
    wsOv['!cols'] = [{ wch: 34 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, wsOv, 'Overview');

    XLSX.writeFile(wb, `keusmania_report_${stamp()}.xlsx`);
}

// ── Shared HTML body, used by both Word and PDF ────────────────────────────
function reportHTML(model, { forWord }) {
    const rows = (arr, cols) => arr.length
        ? arr.map(r => `<tr>${cols.map((c, i) =>
            `<td style="padding:5px 7px;border:1px solid #bbb;${c.right ? 'text-align:right;' : ''}${c.bold ? 'font-weight:bold;' : ''}">${c.money ? escapeHtml(money(r[i])) : escapeHtml(r[i])}</td>`
        ).join('')}</tr>`).join('')
        : `<tr><td colspan="${cols.length}" style="padding:14px;text-align:center;color:#888;border:1px solid #bbb;">No data in this period</td></tr>`;

    const th = (labels) => `<tr>${labels.map(l =>
        `<th style="background:#1a2c5b;color:#fff;padding:6px 7px;border:1px solid #bbb;text-align:${l.right ? 'right' : 'left'};font-size:11px;">${l.text}</th>`
    ).join('')}</tr>`;

    return `
<table style="width:100%;margin-bottom:14px;">
  <tr>
    <td><div style="font-size:20px;font-weight:bold;color:#1a2c5b;">KARWAN-E-USMANIA</div>
        <div style="color:#c9a66b;letter-spacing:1px;font-size:10px;font-weight:600;">UMRAH &amp; HAJJ SERVICES</div></td>
    <td style="text-align:right;">
        <div style="font-size:17px;font-weight:bold;color:#1a2c5b;">REPORTS &amp; ANALYTICS</div>
        <div style="color:#666;font-size:11px;">Period: ${escapeHtml(model.period)}</div>
        <div style="color:#666;font-size:11px;">Generated: ${escapeHtml(model.generated)}</div>
    </td>
  </tr>
</table>

<h2 style="color:#1a2c5b;font-size:14px;margin:14px 0 6px;">Profit &amp; Loss</h2>
<table style="border-collapse:collapse;width:100%;font-size:11px;">
  <thead>${th([{ text: 'Line' }, { text: 'Amount (PKR)', right: true }, { text: 'Basis' }])}</thead>
  <tbody>${rows(model.summary, [{}, { right: true, money: true, bold: true }, {}])}</tbody>
</table>

<h2 style="color:#1a2c5b;font-size:14px;margin:14px 0 6px;">Operating Expenses by Category</h2>
<table style="border-collapse:collapse;width:100%;font-size:11px;">
  <thead>${th([{ text: 'Category' }, { text: 'Amount (PKR)', right: true }, { text: 'Entries', right: true }])}</thead>
  <tbody>${rows(model.byCategory, [{}, { right: true, money: true }, { right: true }])}</tbody>
</table>

<h2 style="color:#1a2c5b;font-size:14px;margin:14px 0 6px;">12-Month Trend</h2>
<table style="border-collapse:collapse;width:100%;font-size:11px;">
  <thead>${th([{ text: 'Month' }, { text: 'Revenue', right: true }, { text: 'COGS', right: true }, { text: 'Opex', right: true }, { text: 'Net', right: true }])}</thead>
  <tbody>${rows(model.trend, [{}, { right: true, money: true }, { right: true, money: true }, { right: true, money: true }, { right: true, money: true, bold: true }])}</tbody>
</table>

<h2 style="color:#1a2c5b;font-size:14px;margin:14px 0 6px;">Overview (all time)</h2>
<table style="border-collapse:collapse;width:100%;font-size:11px;">
  <thead>${th([{ text: 'Metric' }, { text: 'Value', right: true }])}</thead>
  <tbody>${rows(model.overviewRows, [{}, { right: true, money: true }])}</tbody>
</table>

<table style="width:100%;margin-top:12px;"><tr>
  <td style="vertical-align:top;width:50%;padding-right:8px;">
    <h2 style="color:#1a2c5b;font-size:13px;margin:0 0 6px;">Packages by Type</h2>
    <table style="border-collapse:collapse;width:100%;font-size:11px;">
      <thead>${th([{ text: 'Type' }, { text: 'Count', right: true }])}</thead>
      <tbody>${rows(model.byType, [{}, { right: true }])}</tbody>
    </table>
  </td>
  <td style="vertical-align:top;width:50%;padding-left:8px;">
    <h2 style="color:#1a2c5b;font-size:13px;margin:0 0 6px;">Packages by Status</h2>
    <table style="border-collapse:collapse;width:100%;font-size:11px;">
      <thead>${th([{ text: 'Status' }, { text: 'Count', right: true }])}</thead>
      <tbody>${rows(model.byStatus, [{}, { right: true }])}</tbody>
    </table>
  </td>
</tr></table>

<p style="margin-top:16px;font-size:10px;color:#777;">
  Computer-generated by Karwan-e-Usmania CRM. Revenue (Booked) is accrual —
  confirmed and completed packages created in the period. Cash Received is what
  was actually collected${forWord ? '' : ''}.
</p>`;
}

// ── Word (.doc via Word-compatible HTML, no extra dependency) ──────────────
export function exportReportDOC(model) {
    const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${escapeHtml(model.title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
@page WordSection1 { size: 8.27in 11.69in; margin: 0.5in; }
div.WordSection1 { page: WordSection1; }
body { font-family: 'Segoe UI', Calibri, sans-serif; font-size: 11px; color: #111; }
</style></head>
<body><div class="WordSection1">${reportHTML(model, { forWord: true })}</div></body></html>`;

    // The BOM keeps Word from mis-detecting the encoding.
    const blob = new Blob(['﻿', html], { type: 'application/msword' });
    triggerDownload(blob, `keusmania_report_${stamp()}.doc`);
}

// ── PDF ────────────────────────────────────────────────────────────────────
// Two things matter here and both were wrong before:
//
//  1. html2canvas renders by CLONING the target into an off-document iframe. Any
//     positioning on the target is cloned with it — so an element parked at
//     `position:fixed; left:-10000px` lands outside the clone's viewport and
//     renders blank. The element handed to html2pdf must therefore be plain
//     static flow; a wrapper does the hiding instead.
//
//  2. html2pdf's UMD build can come back as the function, as `.default`, or as
//     `.default.default` depending on how the bundler applies CJS interop.
//     Resolving only one shape works until it doesn't.
const A4_WIDTH_PX = 794; // 210mm at 96dpi

export async function exportReportPDF(model) {
    const mod = await import('html2pdf.js');
    const html2pdf = typeof mod === 'function' ? mod
        : typeof mod.default === 'function' ? mod.default
            : typeof mod.default?.default === 'function' ? mod.default.default
                : null;
    if (!html2pdf) throw new Error('PDF engine failed to load');

    const wrapper = document.createElement('div');
    // Only the WRAPPER is moved out of sight; the page itself stays in normal flow.
    wrapper.style.cssText = `position:absolute;left:-${A4_WIDTH_PX * 2}px;top:0;width:${A4_WIDTH_PX}px;`;

    const page = document.createElement('div');
    page.style.cssText = `width:${A4_WIDTH_PX}px;background:#ffffff;padding:24px;box-sizing:border-box;font-family:'Segoe UI',Calibri,sans-serif;color:#111111;font-size:11px;`;
    page.innerHTML = reportHTML(model, { forWord: false });

    // Keep tables and their headings from being sliced across a page break.
    for (const el of page.querySelectorAll('table, h2')) {
        el.style.pageBreakInside = 'avoid';
        el.style.breakInside = 'avoid';
    }

    wrapper.appendChild(page);
    document.body.appendChild(wrapper);

    try {
        await html2pdf().set({
            margin: [10, 10, 12, 10],
            filename: `keusmania_report_${stamp()}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
                // Pin the capture box so it doesn't inherit the real window's
                // scroll position or width.
                windowWidth: A4_WIDTH_PX,
                width: A4_WIDTH_PX,
                scrollX: 0,
                scrollY: 0
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true },
            pagebreak: { mode: ['css', 'legacy'], avoid: ['table', 'h2'] }
        }).from(page).save();
    } finally {
        wrapper.remove();
    }
}

function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export { pkr };
