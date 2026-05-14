import { useRef, useState } from 'react';
import api, { fileUrl } from '../utils/api';
import toast from 'react-hot-toast';
import { MdAttachFile, MdDelete, MdPictureAsPdf, MdImage, MdInsertDriveFile, MdUpload, MdOpenInNew } from 'react-icons/md';

const ICON_FOR = (mime) => {
    if (mime?.startsWith('image/')) return MdImage;
    if (mime === 'application/pdf') return MdPictureAsPdf;
    return MdInsertDriveFile;
};

const fmtSize = (n) => {
    if (!n) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

// Reusable component for any record that has a documents[] array.
//
// Props:
//   documents: the array (read from owner record)
//   uploadUrl: API path to POST a new file to (e.g., '/clients/b2c/123/documents')
//   onChange: called with the updated owner record after upload/delete
//   categories: optional [['key','Label'], ...] for the category dropdown
//   compact: skip the upload button (read-only list)
export default function DocumentManager({ documents = [], uploadUrl, onChange, categories, compact = false }) {
    const [category, setCategory] = useState((categories && categories[0]?.[0]) || 'other');
    const [uploading, setUploading] = useState(false);
    const fileRef = useRef(null);

    const handleFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const fd = new FormData();
        fd.append('file', file);
        fd.append('category', category);
        setUploading(true);
        try {
            const res = await api.post(uploadUrl, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            toast.success('Uploaded');
            onChange?.(res.data.data);
        } catch (err) {
            toast.error(err.response?.data?.message || err.message || 'Upload failed');
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const handleDelete = async (doc) => {
        if (!confirm(`Delete "${doc.originalName || doc.filename}"?`)) return;
        try {
            const res = await api.delete(`${uploadUrl}/${doc._id}`);
            toast.success('Deleted');
            onChange?.(res.data.data);
        } catch (err) { toast.error(err.response?.data?.message || 'Delete failed'); }
    };

    return (
        <div>
            {!compact && (
                <div className="flex items-center gap-2 mb-2">
                    {categories && (
                        <select className="select text-xs py-1 w-auto" value={category} onChange={e => setCategory(e.target.value)}>
                            {categories.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </select>
                    )}
                    <input ref={fileRef} type="file" onChange={handleFile} className="hidden" accept="image/*,application/pdf" />
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                        className="btn-outline btn-sm flex items-center gap-1 text-xs">
                        <MdUpload size={14} /> {uploading ? 'Uploading…' : 'Attach File'}
                    </button>
                    <span className="text-[10px] text-gray-500">JPG, PNG, WEBP, GIF or PDF · max 8 MB</span>
                </div>
            )}

            {documents.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No documents attached.</p>
            ) : (
                <ul className="space-y-1">
                    {documents.map(doc => {
                        const Icon = ICON_FOR(doc.mimeType);
                        const isImg = doc.mimeType?.startsWith('image/');
                        return (
                            <li key={doc._id} className="flex items-center gap-2 p-2 bg-gray-50 rounded border border-gray-200 text-xs">
                                {isImg ? (
                                    <a href={fileUrl(doc.url)} target="_blank" rel="noreferrer">
                                        <img src={fileUrl(doc.url)} alt="" className="w-10 h-10 object-cover rounded" />
                                    </a>
                                ) : (
                                    <Icon size={28} className="text-gray-500" />
                                )}
                                <div className="flex-1 min-w-0">
                                    <div className="font-semibold truncate">{doc.originalName || doc.filename}</div>
                                    <div className="text-[10px] text-gray-500">
                                        {doc.category} · {fmtSize(doc.size)} · {new Date(doc.uploadedAt).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    </div>
                                </div>
                                <a href={fileUrl(doc.url)} target="_blank" rel="noreferrer" className="btn-icon text-navy-700 hover:bg-navy-50" title="Open"><MdOpenInNew size={14} /></a>
                                {!compact && (
                                    <button type="button" onClick={() => handleDelete(doc)} className="btn-icon text-red-500 hover:bg-red-50" title="Delete"><MdDelete size={14} /></button>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

export { MdAttachFile };
