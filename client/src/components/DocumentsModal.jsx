import { useEffect, useState } from 'react';
import api from '../utils/api';
import FormModal from './FormModal';
import DocumentManager from './DocumentManager';

// Wrapper modal: fetches the owner record (so we get the latest documents),
// then renders DocumentManager. Used for places where there's no existing
// edit modal to embed into (e.g., ledger rows, supplier-ledger rows).
//
// Props:
//   isOpen, onClose
//   title
//   fetchUrl: GET to load the owner record (returns {data: {documents: []}} or {data: data: {documents: []}})
//   uploadUrl: POST/DELETE base for documents
//   getDocs: optional fn(record) → documents[] for nested cases
//   categories: same as DocumentManager
export default function DocumentsModal({ isOpen, onClose, title, fetchUrl, uploadUrl, getDocs, categories }) {
    const [docs, setDocs] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isOpen || !fetchUrl) return;
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const r = await api.get(fetchUrl);
                if (cancelled) return;
                const record = r.data.data;
                setDocs(getDocs ? getDocs(record) : (record?.documents || []));
            } catch { /* leave empty */ }
            finally { if (!cancelled) setLoading(false); }
        })();
        return () => { cancelled = true; };
    }, [isOpen, fetchUrl, getDocs]);

    if (!isOpen) return null;

    return (
        <FormModal isOpen={isOpen} onClose={onClose} title={title || 'Documents'} onSubmit={onClose} submitLabel="Done">
            {loading ? (
                <p className="text-sm text-gray-400">Loading…</p>
            ) : (
                <DocumentManager
                    documents={docs}
                    uploadUrl={uploadUrl}
                    onChange={(updated) => setDocs(getDocs ? getDocs(updated) : (updated?.documents || []))}
                    categories={categories}
                />
            )}
        </FormModal>
    );
}
