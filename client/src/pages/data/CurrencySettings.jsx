import { useState, useEffect } from 'react';
import api from '../../utils/api';
import { useCurrency } from '../../context/CurrencyContext';
import toast from 'react-hot-toast';
import { MdCurrencyExchange, MdHistory, MdSave } from 'react-icons/md';

export default function CurrencySettings() {
    const { sarToPkr, setSarToPkr, fetchRate } = useCurrency();
    const [newRate, setNewRate] = useState('');
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadHistory();
    }, []);

    const loadHistory = async () => {
        try {
            setLoading(true);
            const res = await api.get('/currency');
            if (res.data.success) {
                setNewRate(res.data.data.sarToPkr);
                setHistory(res.data.data.rateHistory || []);
            }
        } catch { toast.error('Failed to load'); }
        finally { setLoading(false); }
    };

    const handleUpdate = async () => {
        if (!newRate || newRate <= 0) { toast.error('Enter a valid rate'); return; }
        setSaving(true);
        try {
            await api.put('/currency', { sarToPkr: Number(newRate) });
            setSarToPkr(Number(newRate));
            toast.success(`Rate updated to ${newRate}. All PKR prices recalculated!`);
            loadHistory();
            fetchRate();
        } catch (err) { toast.error(err.response?.data?.message || 'Error updating'); }
        finally { setSaving(false); }
    };

    return (
        <div className="max-w-3xl">
            {/* Current Rate Card */}
            <div className="card bg-gradient-to-r from-navy-800 to-navy-900 mb-6">
                <div className="p-8 text-center">
                    <MdCurrencyExchange className="mx-auto text-gold-400 mb-3" size={40} />
                    <p className="text-gray-300 text-sm mb-1">Current Exchange Rate</p>
                    <h2 className="text-4xl font-heading font-bold text-white">
                        1 SAR = <span className="text-gold-400">{sarToPkr}</span> PKR
                    </h2>
                </div>
            </div>

            {/* Update Rate */}
            <div className="card mb-6">
                <div className="card-header">
                    <h3 className="font-heading font-bold text-dark">Update Rate</h3>
                </div>
                <div className="card-body">
                    <div className="flex gap-3">
                        <div className="flex-1">
                            <label className="label">New SAR to PKR Rate</label>
                            <input
                                type="number"
                                className="input text-lg font-semibold"
                                value={newRate}
                                onChange={e => setNewRate(e.target.value)}
                                step="0.01"
                                min="0"
                            />
                        </div>
                        <button
                            onClick={handleUpdate}
                            disabled={saving}
                            className="btn-gold self-end flex items-center gap-2"
                        >
                            <MdSave size={18} />
                            {saving ? 'Updating...' : 'Update Rate'}
                        </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                        ⚠️ Updating the rate will recalculate all PKR prices across airlines, hotels, ziyarats, transport, and services.
                    </p>
                </div>
            </div>

            {/* Rate History */}
            <div className="card">
                <div className="card-header flex items-center gap-2">
                    <MdHistory size={18} className="text-navy-800" />
                    <h3 className="font-heading font-bold text-dark">Rate History</h3>
                </div>
                <div className="card-body">
                    {loading ? (
                        <div className="text-center py-8">
                            <div className="w-8 h-8 border-4 border-navy-800 border-t-gold-500 rounded-full animate-spin mx-auto" />
                        </div>
                    ) : history.length === 0 ? (
                        <p className="text-gray-400 text-center py-8">No rate history yet</p>
                    ) : (
                        <div className="table-container">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Rate (SAR→PKR)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...history].reverse().map((entry, idx) => (
                                        <tr key={idx}>
                                            <td>{new Date(entry.date).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                                            <td className="font-semibold text-navy-800">{entry.rate}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
