import { PRINT_STYLES } from './printStyles';

// Common header + auto-print wrapper used by every printable doc.
export default function PrintShell({ title, subtitle, children }) {
    return (
        <div className="doc">
            <style>{PRINT_STYLES}</style>
            <div className="no-print" style={{ marginBottom: 12, textAlign: 'right' }}>
                <button onClick={() => window.print()} style={{ background: '#1a2c5b', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Print / Save as PDF</button>
            </div>
            <div className="doc-header">
                <div className="brand">
                    <img src="/assets/karwan-e-usmania-logo.png" alt="" />
                    <div>
                        <div className="brand-name">KARWAN-E-USMANIA</div>
                        <div className="brand-tag">UMRAH & HAJJ SERVICES</div>
                    </div>
                </div>
                <div className="doc-title">
                    <h1>{title}</h1>
                    {subtitle && <div className="meta">{subtitle}</div>}
                </div>
            </div>
            {children}
            <div className="footer-notes">
                <p>This document is computer-generated and valid without signature. For queries contact Karwan-e-Usmania administration.</p>
                <p>Generated: {new Date().toLocaleString('en-PK')}</p>
            </div>
        </div>
    );
}
