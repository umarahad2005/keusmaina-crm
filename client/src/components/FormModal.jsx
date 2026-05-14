import { MdClose } from 'react-icons/md';

export default function FormModal({ isOpen, onClose, title, children, onSubmit, submitLabel = 'Save', loading = false }) {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="modal-header">
                    <h3 className="text-lg font-heading font-bold text-dark">{title}</h3>
                    <button onClick={onClose} className="btn-icon text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                        <MdClose size={20} />
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
                    <div className="modal-body space-y-4">
                        {children}
                    </div>

                    {/* Footer */}
                    <div className="modal-footer">
                        <button type="button" onClick={onClose} className="btn-ghost">
                            Cancel
                        </button>
                        <button type="submit" disabled={loading} className="btn-gold">
                            {loading ? (
                                <span className="flex items-center gap-2">
                                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                    Saving...
                                </span>
                            ) : submitLabel}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
