import { useState, useMemo } from 'react';
import { MdSearch, MdEdit, MdDelete, MdChevronLeft, MdChevronRight, MdAdd } from 'react-icons/md';

export default function DataTable({
    columns,
    data = [],
    onEdit,
    onDelete,
    onAdd,
    title,
    addLabel = 'Add New',
    searchable = true,
    loading = false,
    extraActions = []
}) {
    const [search, setSearch] = useState('');
    const [sortKey, setSortKey] = useState('');
    const [sortDir, setSortDir] = useState('asc');
    const [page, setPage] = useState(1);
    const perPage = 10;

    // Filter
    const filtered = useMemo(() => {
        if (!search) return data;
        const s = search.toLowerCase();
        return data.filter(row =>
            columns.some(col => {
                const val = row[col.key];
                return val && String(val).toLowerCase().includes(s);
            })
        );
    }, [data, search, columns]);

    // Sort
    const sorted = useMemo(() => {
        if (!sortKey) return filtered;
        return [...filtered].sort((a, b) => {
            const aVal = a[sortKey] ?? '';
            const bVal = b[sortKey] ?? '';
            const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
            return sortDir === 'asc' ? cmp : -cmp;
        });
    }, [filtered, sortKey, sortDir]);

    // Paginate
    const totalPages = Math.ceil(sorted.length / perPage);
    const paginated = sorted.slice((page - 1) * perPage, page * perPage);

    const handleSort = (key) => {
        if (sortKey === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    };

    return (
        <div>
            {/* Header */}
            <div className="page-header">
                <div>
                    {title && <h2 className="page-title">{title}</h2>}
                    <p className="page-subtitle">{sorted.length} records found</p>
                </div>
                <div className="flex items-center gap-3">
                    {searchable && (
                        <div className="relative">
                            <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                                placeholder="Search..."
                                className="search-input w-56"
                            />
                        </div>
                    )}
                    {onAdd && (
                        <button onClick={onAdd} className="btn-gold flex items-center gap-2">
                            <MdAdd size={18} /> {addLabel}
                        </button>
                    )}
                </div>
            </div>

            {/* Table */}
            <div className="table-container">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-10 h-10 border-4 border-navy-800 border-t-gold-500 rounded-full animate-spin" />
                    </div>
                ) : paginated.length === 0 ? (
                    <div className="text-center py-16">
                        <p className="text-gray-400 text-lg mb-1">No records found</p>
                        <p className="text-gray-300 text-sm">Try adjusting your search or add a new entry</p>
                    </div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                {columns.map(col => (
                                    <th
                                        key={col.key}
                                        onClick={() => col.sortable !== false && handleSort(col.key)}
                                        className={col.sortable !== false ? 'cursor-pointer hover:bg-navy-700 select-none' : ''}
                                    >
                                        <div className="flex items-center gap-1">
                                            {col.label}
                                            {sortKey === col.key && (
                                                <span className="text-gold-400">{sortDir === 'asc' ? '↑' : '↓'}</span>
                                            )}
                                        </div>
                                    </th>
                                ))}
                                {(onEdit || onDelete || extraActions.length > 0) && <th className="text-right">Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {paginated.map((row, idx) => (
                                <tr key={row._id || idx}>
                                    {columns.map(col => (
                                        <td key={col.key}>
                                            {col.render ? col.render(row[col.key], row) : (
                                                row[col.key] !== undefined ? String(row[col.key]) : '—'
                                            )}
                                        </td>
                                    ))}
                                    {(onEdit || onDelete || extraActions.length > 0) && (
                                        <td className="text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                {onEdit && (
                                                    <button
                                                        onClick={() => onEdit(row)}
                                                        className="btn-icon text-navy-800 hover:bg-navy-50"
                                                        title="Edit"
                                                    >
                                                        <MdEdit size={16} />
                                                    </button>
                                                )}
                                                {extraActions.map((a, i) => {
                                                    if (a.show && !a.show(row)) return null;
                                                    const Icon = a.icon;
                                                    return (
                                                        <button
                                                            key={i}
                                                            onClick={() => a.onClick(row)}
                                                            className={`btn-icon ${a.className || 'text-gray-600 hover:bg-gray-100'}`}
                                                            title={typeof a.title === 'function' ? a.title(row) : a.title}
                                                        >
                                                            <Icon size={16} />
                                                        </button>
                                                    );
                                                })}
                                                {onDelete && (
                                                    <button
                                                        onClick={() => onDelete(row)}
                                                        className="btn-icon text-red-500 hover:bg-red-50"
                                                        title="Delete"
                                                    >
                                                        <MdDelete size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 px-2">
                    <p className="text-sm text-gray-500">
                        Showing {(page - 1) * perPage + 1}–{Math.min(page * perPage, sorted.length)} of {sorted.length}
                    </p>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="btn-ghost btn-sm"
                        >
                            <MdChevronLeft size={18} />
                        </button>
                        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                            const p = page <= 3 ? i + 1 : page + i - 2;
                            if (p < 1 || p > totalPages) return null;
                            return (
                                <button
                                    key={p}
                                    onClick={() => setPage(p)}
                                    className={`btn-sm ${p === page ? 'btn-primary' : 'btn-ghost'}`}
                                >
                                    {p}
                                </button>
                            );
                        })}
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="btn-ghost btn-sm"
                        >
                            <MdChevronRight size={18} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
