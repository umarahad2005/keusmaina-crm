import { useState, useEffect } from 'react';
import { MdInventory, MdPeople, MdAccountBalance, MdFlight, MdAttachMoney, MdTrendingUp } from 'react-icons/md';
import api from '../utils/api';
import { useCurrency } from '../context/CurrencyContext';

const statDefs = [
    { label: 'Active Packages', icon: MdInventory, color: 'bg-navy-800', textColor: 'text-navy-800', key: 'packages' },
    { label: 'Total Pilgrims', icon: MdPeople, color: 'bg-green-800', textColor: 'text-green-800', key: 'pilgrims' },
    { label: 'Total Revenue', icon: MdAttachMoney, color: 'bg-gold-500', textColor: 'text-gold-600', key: 'revenue', isCurrency: true },
    { label: 'Outstanding', icon: MdTrendingUp, color: 'bg-red-500', textColor: 'text-red-600', key: 'outstanding', isCurrency: true },
    { label: 'B2B Agents', icon: MdAccountBalance, color: 'bg-indigo-600', textColor: 'text-indigo-600', key: 'agents' },
    { label: 'B2C Clients', icon: MdPeople, color: 'bg-teal-600', textColor: 'text-teal-600', key: 'clients' },
];

export default function Dashboard() {
    const { formatPKR } = useCurrency();
    const [data, setData] = useState({
        packages: 0, pilgrims: 0, revenue: 0, outstanding: 0, agents: 0, clients: 0
    });

    useEffect(() => {
        const load = async () => {
            try {
                const res = await api.get('/reports/overview');
                const { counts, financial } = res.data.data;
                setData({
                    packages: counts.packages,
                    pilgrims: counts.b2cClients,
                    revenue: financial.revenue,
                    outstanding: financial.outstanding,
                    agents: counts.b2bClients,
                    clients: counts.b2cClients + counts.b2bClients
                });
            } catch { /* silently fail on dashboard */ }
        };
        load();
    }, []);

    return (
        <div>
            {/* Welcome Banner */}
            <div className="card bg-gradient-to-r from-navy-800 to-navy-900 mb-6">
                <div className="p-6 flex items-center gap-4">
                    <img src="/assets/karwan-e-usmania-logo.png" alt="Logo" className="w-16 h-16 rounded-xl bg-white p-1 object-contain shadow-lg" />
                    <div>
                        <h2 className="text-xl font-heading font-bold text-white">Welcome to Karwan-e-Usmania CRM</h2>
                        <p className="text-gray-300 text-sm mt-1">Manage your Hajj & Umrah operations from one centralized dashboard</p>
                    </div>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                {statDefs.map((stat) => {
                    const Icon = stat.icon;
                    const value = stat.isCurrency ? formatPKR(data[stat.key]) : data[stat.key];
                    return (
                        <div key={stat.key} className="stat-card">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="stat-label">{stat.label}</p>
                                    <p className={`stat-value ${stat.textColor}`}>{value}</p>
                                </div>
                                <div className={`stat-icon ${stat.color} text-white`}><Icon size={22} /></div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="card">
                    <div className="card-header"><h3 className="font-heading font-bold text-dark">Quick Actions</h3></div>
                    <div className="card-body grid grid-cols-2 gap-3">
                        <a href="/packages/new" className="btn-primary text-center">📦 New Package</a>
                        <a href="/clients" className="btn-gold text-center">👤 New Client</a>
                        <a href="/airlines" className="btn-outline text-center">✈️ Add Airline</a>
                        <a href="/ledger" className="btn-green text-center">💰 Ledger Entry</a>
                    </div>
                </div>
                <div className="card">
                    <div className="card-header"><h3 className="font-heading font-bold text-dark">System Status</h3></div>
                    <div className="card-body space-y-3">
                        <div className="flex items-center justify-between"><span className="text-sm text-gray-600">Database</span><span className="badge-active">Connected</span></div>
                        <div className="flex items-center justify-between"><span className="text-sm text-gray-600">API Server</span><span className="badge-active">Running</span></div>
                        <div className="flex items-center justify-between"><span className="text-sm text-gray-600">Modules</span><span className="badge-navy">4 Active</span></div>
                    </div>
                </div>
            </div>
        </div>
    );
}
