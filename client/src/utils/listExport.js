// Generic list export — Excel, PDF and Word for any table in the CRM.
//
// A page describes its list once as a spec and gets all three formats from it,
// so the downloaded file always matches the columns on screen and the formats
// can never drift apart from each other.
//
//   {
//     title:    'Suppliers',
//     meta:     [['Filter', 'Active only']],        // optional header rows
//     columns:  [{ key, label, right?, money?, width? }],
//     rows:     [ {...}, ... ],                     // plain objects
//     totals:   [['Total payable (PKR)', 123456]],  // optional footer rows
//     baseName: 'suppliers'                         // filename stem
//   }
//
// html2pdf drags in jsPDF + html2canvas (~1 MB) so it is loaded lazily; only
// someone who clicks PDF pays for it.

import * as XLSX from 'xlsx';

const money = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const stamp = () => new Date().toISOString().slice(0, 10);
const safeName = (s) => String(s || 'list').replace(/[^a-z0-9_-]+/gi, '_').slice(0, 50);

function escapeHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Raw value for a cell, after any per-column mapper. Mappers exist because the
// on-screen DataTable columns render JSX (badges, coloured amounts) which is
// useless in a spreadsheet — the export needs the plain underlying value.
const rawCell = (row, col) => (col.value ? col.value(row[col.key], row) : row[col.key]);

// Cell value for display. `money` columns are formatted; everything else is
// stringified, with null/undefined shown as an em dash rather than "undefined".
const displayCell = (row, col) => {
    const v = rawCell(row, col);
    if (col.money) return money(v);
    if (v === null || v === undefined || v === '') return '—';
    return String(v);
};

// Build export columns from a DataTable `columns` array, dropping its render()
// functions. `money` lists the keys that are amounts; `format` supplies a
// plain-value mapper for any column whose display differs from its raw field.
export function columnsFromDataTable(columns, { money: moneyKeys = [], skip = [], format = {}, width = {} } = {}) {
    return columns
        .filter(c => c.key && !skip.includes(c.key))
        .map(c => ({
            key: c.key,
            label: c.label,
            money: moneyKeys.includes(c.key),
            right: moneyKeys.includes(c.key),
            value: format[c.key],
            width: width[c.key],
        }));
}

// ── Excel ──────────────────────────────────────────────────────────────────
// Money and count columns stay numeric so the recipient can sum and pivot.
export function exportListXLSX(spec) {
    const { title, meta = [], columns, rows, totals = [], baseName } = spec;
    const aoa = [];

    aoa.push([`Karwan-e-Usmania — ${title}`]);
    aoa.push(['Generated', new Date().toLocaleString('en-PK')]);
    aoa.push(['Records', rows.length]);
    meta.forEach(([k, v]) => aoa.push([k, v]));
    aoa.push([]);

    aoa.push(columns.map(c => c.label));
    rows.forEach(r => aoa.push(columns.map(c => {
        const v = rawCell(r, c);
        if (c.money) return Number(v || 0);
        return v === null || v === undefined ? '' : v;
    })));

    if (totals.length) {
        aoa.push([]);
        totals.forEach(([label, value]) => {
            const line = new Array(Math.max(1, columns.length - 1)).fill('');
            line[Math.max(0, columns.length - 2)] = label;
            line[columns.length - 1] = typeof value === 'number' ? value : String(value);
            aoa.push(line);
        });
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = columns.map(c => ({ wch: c.width || (c.money ? 16 : 22) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31) || 'List');
    XLSX.writeFile(wb, `${safeName(baseName || title)}_${stamp()}.xlsx`);
}

// ── Shared HTML, used by both Word and PDF ─────────────────────────────────
function listHTML(spec) {
    const { title, meta = [], columns, rows, totals = [] } = spec;

    const head = columns.map(c =>
        `<th style="background:#1a2c5b;color:#fff;padding:6px 7px;border:1px solid #bbb;text-align:${c.right ? 'right' : 'left'};font-size:10px;">${escapeHtml(c.label)}</th>`
    ).join('');

    const body = rows.length
        ? rows.map(r => `<tr>${columns.map(c =>
            `<td style="padding:4px 7px;border:1px solid #bbb;font-size:10px;${c.right ? 'text-align:right;' : ''}">${escapeHtml(displayCell(r, c))}</td>`
        ).join('')}</tr>`).join('')
        : `<tr><td colspan="${columns.length}" style="padding:16px;text-align:center;color:#888;border:1px solid #bbb;">No records</td></tr>`;

    const foot = totals.map(([label, value]) => `
        <tr><td colspan="${Math.max(1, columns.length - 1)}" style="padding:6px 8px;border:1px solid #c9a66b;background:#fff6e0;text-align:right;font-weight:bold;font-size:11px;">${escapeHtml(label)}</td>
            <td style="padding:6px 8px;border:1px solid #c9a66b;background:#fff6e0;text-align:right;font-weight:bold;font-size:11px;">${escapeHtml(typeof value === 'number' ? money(value) : value)}</td></tr>`).join('');

    const metaRows = meta.map(([k, v]) =>
        `<span style="margin-right:14px;color:#666;font-size:11px;">${escapeHtml(k)}: <b style="color:#111;">${escapeHtml(v)}</b></span>`).join('');

    return `
<table style="width:100%;margin-bottom:12px;"><tr>
  <td><div style="font-size:19px;font-weight:bold;color:#1a2c5b;">KARWAN-E-USMANIA</div>
      <div style="color:#c9a66b;letter-spacing:1px;font-size:10px;font-weight:600;">UMRAH &amp; HAJJ SERVICES</div></td>
  <td style="text-align:right;">
      <div style="font-size:16px;font-weight:bold;color:#1a2c5b;">${escapeHtml(title.toUpperCase())}</div>
      <div style="color:#666;font-size:11px;">${rows.length} record${rows.length === 1 ? '' : 's'}</div>
      <div style="color:#666;font-size:11px;">Generated: ${escapeHtml(new Date().toLocaleString('en-PK'))}</div>
  </td>
</tr></table>
${metaRows ? `<div style="margin-bottom:8px;">${metaRows}</div>` : ''}
<table style="border-collapse:collapse;width:100%;">
  <thead><tr>${head}</tr></thead>
  <tbody>${body}</tbody>
  ${foot ? `<tfoot>${foot}</tfoot>` : ''}
</table>
<p style="margin-top:14px;font-size:9px;color:#777;">Computer-generated by Karwan-e-Usmania CRM.</p>`;
}

// ── Word (.doc via Word-compatible HTML, no extra dependency) ──────────────
export function exportListDOC(spec) {
    // Wide tables read better on landscape paper.
    const landscape = (spec.columns?.length || 0) > 6;
    const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${escapeHtml(spec.title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
@page WordSection1 { size: ${landscape ? '11.69in 8.27in' : '8.27in 11.69in'}; ${landscape ? 'mso-page-orientation: landscape;' : ''} margin: 0.5in; }
div.WordSection1 { page: WordSection1; }
body { font-family: 'Segoe UI', Calibri, sans-serif; font-size: 10px; color: #111; }
</style></head>
<body><div class="WordSection1">${listHTML(spec)}</div></body></html>`;

    const blob = new Blob(['﻿', html], { type: 'application/msword' });
    triggerDownload(blob, `${safeName(spec.baseName || spec.title)}_${stamp()}.doc`);
}

// ── PDF ────────────────────────────────────────────────────────────────────
// Two things matter here, both of which produce a blank PDF when got wrong —
// see the same notes in reportExport.js:
//
//  1. html2canvas renders by CLONING the target into an off-document iframe.
//     Any positioning on the target is cloned with it, so an element parked at
//     `position:fixed; left:-10000px` lands outside the clone's own viewport
//     and renders blank. The element handed to html2pdf must sit in normal
//     static flow; a wrapper does the hiding instead.
//
//  2. html2pdf's UMD build can come back as the function, as `.default`, or as
//     `.default.default` depending on how the bundler applies CJS interop.
const A4_WIDTH_PX = 794;        // 210mm at 96dpi
const A4_LANDSCAPE_PX = 1123;   // 297mm at 96dpi

export async function exportListPDF(spec) {
    const mod = await import('html2pdf.js');
    const html2pdf = typeof mod === 'function' ? mod
        : typeof mod.default === 'function' ? mod.default
            : typeof mod.default?.default === 'function' ? mod.default.default
                : null;
    if (!html2pdf) throw new Error('PDF engine failed to load');

    const landscape = (spec.columns?.length || 0) > 6;
    const widthPx = landscape ? A4_LANDSCAPE_PX : A4_WIDTH_PX;

    const wrapper = document.createElement('div');
    // Only the WRAPPER is moved out of sight; the page itself stays in flow.
    wrapper.style.cssText = `position:absolute;left:-${widthPx * 2}px;top:0;width:${widthPx}px;`;

    const page = document.createElement('div');
    page.style.cssText = `width:${widthPx}px;background:#ffffff;padding:24px;box-sizing:border-box;font-family:'Segoe UI',Calibri,sans-serif;color:#111111;font-size:10px;`;
    page.innerHTML = listHTML(spec);

    // Keep table headers from being sliced across a page break.
    for (const el of page.querySelectorAll('thead, tr')) {
        el.style.pageBreakInside = 'avoid';
        el.style.breakInside = 'avoid';
    }

    wrapper.appendChild(page);
    document.body.appendChild(wrapper);

    try {
        await html2pdf().set({
            margin: [8, 8, 10, 8],
            filename: `${safeName(spec.baseName || spec.title)}_${stamp()}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
                // Pin the capture box so it can't inherit the real window's
                // width or scroll position.
                windowWidth: widthPx,
                width: widthPx,
                scrollX: 0,
                scrollY: 0
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: landscape ? 'landscape' : 'portrait', compress: true },
            pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', 'thead'] },
        }).from(page).save();
    } finally {
        wrapper.remove();
    }
}

export async function exportList(format, spec) {
    if (format === 'xlsx') return exportListXLSX(spec);
    if (format === 'doc') return exportListDOC(spec);
    return exportListPDF(spec);
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
