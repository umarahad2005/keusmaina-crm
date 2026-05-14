// Shared print styles used by all printable docs (voucher/invoice/itinerary/receipt)
// Inlined as a string so each page can drop it in a <style> block.
export const PRINT_STYLES = `
    @media print {
        @page { size: A4 portrait; margin: 14mm; }
        body { font-size: 11px; }
        .no-print { display: none !important; }
    }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111; }
    .doc { max-width: 800px; margin: 0 auto; padding: 24px; background: #fff; }
    .doc-header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 12px; border-bottom: 3px double #c9a66b; margin-bottom: 18px; }
    .brand { display: flex; gap: 10px; align-items: center; }
    .brand img { width: 52px; height: 52px; object-fit: contain; }
    .brand-name { font-size: 18px; font-weight: bold; color: #1a2c5b; line-height: 1.1; }
    .brand-tag { font-size: 10px; color: #c9a66b; letter-spacing: 1px; font-weight: 600; }
    .doc-title { text-align: right; }
    .doc-title h1 { font-size: 22px; margin: 0; color: #1a2c5b; letter-spacing: 1px; }
    .doc-title .meta { font-size: 11px; color: #666; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin: 6px 0; }
    table.bordered th, table.bordered td { border: 1px solid #aaa; padding: 5px 7px; text-align: left; vertical-align: top; }
    table.bordered th { background: #f3f3f3; font-weight: bold; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
    .box { border: 1px solid #ddd; border-radius: 6px; padding: 10px 12px; }
    .box h3 { margin: 0 0 6px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #666; }
    .box .v { font-size: 13px; font-weight: 600; color: #111; }
    .totals { width: 320px; margin-left: auto; margin-top: 10px; }
    .totals tr td { padding: 4px 8px; font-size: 12px; }
    .totals tr td:last-child { text-align: right; font-weight: 600; }
    .totals tr.grand td { border-top: 2px solid #1a2c5b; padding-top: 8px; font-size: 15px; color: #1a2c5b; }
    .totals tr.balance td { background: #fff6e0; padding: 8px; font-size: 14px; }
    .footer-notes { margin-top: 20px; padding-top: 10px; border-top: 1px solid #ddd; font-size: 10px; color: #666; }
    .stamp { text-align: center; padding: 12px; border: 2px solid #2e7d32; color: #2e7d32; font-weight: bold; font-size: 16px; border-radius: 8px; transform: rotate(-2deg); display: inline-block; margin-top: 10px; }
    .stamp.pending { border-color: #c9a66b; color: #c9a66b; }
`;

export const PRINT_HEADER_HTML = (title, subtitle) => ({ title, subtitle });
