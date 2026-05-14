import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    MdDashboard, MdFlight, MdHotel, MdMosque, MdDirectionsBus,
    MdStar, MdCurrencyExchange, MdInventory, MdPeople, MdAccountBalance,
    MdAssessment, MdSettings, MdLogout, MdClose, MdAdminPanelSettings, MdAssignmentInd, MdGroups, MdStorefront, MdReceiptLong,
    MdSavings, MdSpaceDashboard, MdTrendingUp, MdTrendingDown
} from 'react-icons/md';

const navItems = [
    { label: 'Dashboard', icon: MdDashboard, path: '/', roles: ['admin', 'sales', 'accounts', 'visa', 'operations'] },
    { type: 'divider', label: 'Data Management' },
    { label: 'Airlines', icon: MdFlight, path: '/airlines', roles: ['admin', 'sales', 'operations'] },
    { label: 'Hotels Makkah', icon: MdHotel, path: '/hotels-makkah', roles: ['admin', 'sales', 'operations'] },
    { label: 'Hotels Madinah', icon: MdHotel, path: '/hotels-madinah', roles: ['admin', 'sales', 'operations'] },
    { label: 'Ziyarats', icon: MdMosque, path: '/ziyarats', roles: ['admin', 'sales', 'operations'] },
    { label: 'Transport', icon: MdDirectionsBus, path: '/transport', roles: ['admin', 'sales', 'operations'] },
    { label: 'Special Services', icon: MdStar, path: '/special-services', roles: ['admin', 'sales', 'operations'] },
    { type: 'divider', label: 'Package Manager' },
    { label: 'Groups', icon: MdGroups, path: '/departures', roles: ['admin', 'sales', 'operations'] },
    { label: 'Clients', icon: MdPeople, path: '/clients', roles: ['admin', 'sales'] },
    { label: 'Package Maker', icon: MdInventory, path: '/packages', roles: ['admin', 'sales'] },
    { type: 'divider', label: 'Operations' },
    { label: 'Visa Tracker', icon: MdAssignmentInd, path: '/visas', roles: ['admin', 'sales', 'visa', 'operations'] },
    { type: 'divider', label: 'Accounts' },
    { label: 'Accounts Dashboard', icon: MdSpaceDashboard, path: '/accounts', roles: ['admin', 'accounts'] },
    { label: 'Receivables (Clients)', icon: MdTrendingUp, path: '/ledger', roles: ['admin', 'accounts'] },
    { label: 'Payables (Suppliers)', icon: MdTrendingDown, path: '/suppliers', roles: ['admin', 'accounts'] },
    { label: 'Expenses', icon: MdReceiptLong, path: '/expenses', roles: ['admin', 'accounts'] },
    { label: 'Cash & Bank', icon: MdSavings, path: '/cash-accounts', roles: ['admin', 'accounts'] },
    { label: 'Reports', icon: MdAssessment, path: '/reports', roles: ['admin', 'accounts'] },
    { type: 'divider', label: 'Settings' },
    { label: 'Currency', icon: MdCurrencyExchange, path: '/currency', roles: ['admin'] },
    { label: 'Users', icon: MdAdminPanelSettings, path: '/users', roles: ['admin'] },
    { label: 'Audit Log', icon: MdSettings, path: '/audit-log', roles: ['admin'] },
];

export default function Sidebar({ isOpen, onClose }) {
    const { user, logout, isAuthorized } = useAuth();
    const location = useLocation();

    return (
        <>
            {/* Mobile overlay */}
            {isOpen && (
                <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onClose} />
            )}

            <aside className={`
        sidebar w-64
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
      `}>
                {/* Logo */}
                <div className="p-4 border-b border-white/10">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <img
                                src="/assets/karwan-e-usmania-logo.png"
                                alt="Karwan-e-Usmania"
                                className="w-10 h-10 rounded-lg bg-white p-0.5 object-contain"
                            />
                            <div>
                                <h2 className="text-sm font-bold text-white leading-tight">KARWAN-E-USMANIA</h2>
                                <p className="text-[10px] text-gold-400 font-medium">CRM System</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="lg:hidden text-gray-400 hover:text-white">
                            <MdClose size={20} />
                        </button>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 overflow-y-auto py-3 px-1">
                    {navItems.map((item, idx) => {
                        if (item.type === 'divider') {
                            return (
                                <div key={idx} className="mt-4 mb-2 px-4">
                                    <span className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">
                                        {item.label}
                                    </span>
                                </div>
                            );
                        }

                        // Role check
                        if (item.roles && !item.roles.some(r => isAuthorized(r))) return null;

                        const Icon = item.icon;
                        const isActive = location.pathname === item.path;

                        return (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                onClick={onClose}
                                className={`sidebar-link ${isActive ? 'active' : ''}`}
                            >
                                <Icon size={18} className={isActive ? 'text-gold-400' : ''} />
                                <span>{item.label}</span>
                            </NavLink>
                        );
                    })}
                </nav>

                {/* User Info + Logout */}
                <div className="p-3 border-t border-white/10">
                    <div className="flex items-center gap-3 px-3 py-2">
                        <div className="w-8 h-8 rounded-full bg-gold-500 flex items-center justify-center text-white text-sm font-bold">
                            {user?.name?.charAt(0)?.toUpperCase() || 'A'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm text-white font-medium truncate">{user?.name}</p>
                            <p className="text-[10px] text-gray-400 capitalize">{user?.role}</p>
                        </div>
                        <button
                            onClick={logout}
                            className="text-gray-400 hover:text-red-400 transition-colors"
                            title="Logout"
                        >
                            <MdLogout size={18} />
                        </button>
                    </div>
                </div>
            </aside>
        </>
    );
}
