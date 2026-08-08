import { useState } from 'react';
import toast from 'react-hot-toast';
import { MdGridOn, MdPictureAsPdf, MdDescription } from 'react-icons/md';
import { exportList } from '../utils/listExport';

// Excel / PDF / Word download group for any list screen.
//
// `getSpec` is called at click time, not render time, so the download always
// reflects the rows currently on screen — including whatever filters or search
// the user has applied — rather than a snapshot from an earlier render.

export default function ExportButtons({ getSpec, label = 'Download list:', className = '' }) {
    const [busy, setBusy] = useState('');

    const run = async (format) => {
        setBusy(format);
        try {
            const spec = getSpec();
            if (!spec || !spec.rows?.length) { toast.error('Nothing to export'); return; }
            await exportList(format, spec);
            toast.success(`${format === 'xlsx' ? 'Excel' : format === 'doc' ? 'Word' : 'PDF'} downloaded`);
        } catch (e) {
            toast.error(`Export failed: ${e.message || format}`);
        } finally { setBusy(''); }
    };

    return (
        <div className={`flex items-center gap-1.5 flex-wrap ${className}`}>
            {label && <span className="text-xs text-gray-500">{label}</span>}
            <button onClick={() => run('xlsx')} disabled={!!busy} title="Excel spreadsheet"
                className="btn-outline btn-sm flex items-center gap-1 disabled:opacity-50">
                <MdGridOn size={14} /> {busy === 'xlsx' ? '…' : 'Excel'}
            </button>
            <button onClick={() => run('pdf')} disabled={!!busy} title="PDF document"
                className="btn-outline btn-sm flex items-center gap-1 disabled:opacity-50">
                <MdPictureAsPdf size={14} /> {busy === 'pdf' ? 'Building…' : 'PDF'}
            </button>
            <button onClick={() => run('doc')} disabled={!!busy} title="Word document you can edit before sending"
                className="btn-outline btn-sm flex items-center gap-1 disabled:opacity-50">
                <MdDescription size={14} /> {busy === 'doc' ? '…' : 'Word'}
            </button>
        </div>
    );
}
