import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import { useLang } from '../context/LanguageContext';
import { MdMenu, MdCurrencyExchange, MdLanguage, MdArrowBack } from 'react-icons/md';

const pageNames = {
    '/': 'Dashboard',
    '/airlines': 'Airlines Management',
    '/hotels-makkah': 'Hotels — Makkah',
    '/hotels-madinah': 'Hotels — Madinah',
    '/ziyarats': 'Ziyarat Management',
    '/transport': 'Transport Management',
    '/special-services': 'Special Services',
    '/packages': 'Package Maker',
    '/packages/new': 'Create Package',
    '/departures': 'Groups (Departure Batches)',
    '/departures/new': 'New Group',
    '/clients': 'Clients (B2C & B2B)',
    '/visas': 'Visa Tracker',
    '/ledger': 'Receivables — Client Ledger',
    '/suppliers': 'Payables — Supplier Ledger',
    '/expenses': 'Operating Expenses',
    '/accounts': 'Accounts Dashboard',
    '/cash-accounts': 'Cash & Bank Accounts',
    '/reports': 'Reports & Analytics',
    '/currency': 'Currency Settings',
    '/users': 'User Management',
    '/audit-log': 'Audit Log',
};

export default function Topbar({ onMenuClick }) {
    const location = useLocation();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { sarToPkr } = useCurrency();
    const { lang, toggleLang } = useLang();

    const pageName = pageNames[location.pathname] || 'Karwan-e-Usmania CRM';
    // Show Back on every page except the dashboard. window.history.length > 1 means
    // there's an entry to go back to; otherwise we send the user home.
    const showBack = location.pathname !== '/';
    const handleBack = () => {
        if (window.history.length > 1) navigate(-1);
        else navigate('/');
    };

    return (
        <header className="sticky top-0 z-30 bg-white border-b border-gray-100 shadow-sm">
            <div className="flex items-center justify-between px-4 sm:px-6 h-16">
                {/* Left: Hamburger + Back + Page Title */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={onMenuClick}
                        className="lg:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
                        title="Open menu"
                    >
                        <MdMenu size={22} />
                    </button>
                    {showBack && (
                        <button
                            onClick={handleBack}
                            className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-navy-800 transition-colors flex items-center gap-1"
                            title="Go back (or swipe right from screen edge)"
                            aria-label="Go back"
                        >
                            <MdArrowBack size={20} />
                            <span className="hidden sm:inline text-xs font-medium">Back</span>
                        </button>
                    )}
                    <div className="ml-1">
                        <h1 className="text-lg font-heading font-bold text-dark">{pageName}</h1>
                    </div>
                </div>

                {/* Right: Language + Currency + User */}
                <div className="flex items-center gap-3">
                    {/* Language toggle */}
                    <button
                        onClick={toggleLang}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                        title={lang === 'en' ? 'Switch to Urdu' : 'Switch to English'}
                    >
                        <MdLanguage size={16} className="text-navy-800" />
                        <span className="text-xs font-bold text-navy-800">{lang === 'en' ? 'اردو' : 'EN'}</span>
                    </button>

                    {/* Currency rate badge */}
                    <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-navy-50 rounded-lg">
                        <MdCurrencyExchange className="text-navy-800" size={16} />
                        <span className="text-xs font-semibold text-navy-800">
                            1 SAR = <span className="text-gold-600">{sarToPkr}</span> PKR
                        </span>
                    </div>

                    {/* User avatar */}
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-navy-800 to-navy-600 flex items-center justify-center text-white text-xs font-bold shadow-md">
                            {user?.name?.charAt(0)?.toUpperCase() || 'A'}
                        </div>
                        <div className="hidden md:block">
                            <p className="text-sm font-medium text-dark leading-tight">{user?.name}</p>
                            <p className="text-[10px] text-gray-400 capitalize">{user?.role}</p>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
}
