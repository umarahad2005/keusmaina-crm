import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CurrencyProvider } from './context/CurrencyContext';
import { LanguageProvider } from './context/LanguageContext';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Placeholder from './pages/Placeholder';

// Module 1
import Airlines from './pages/data/Airlines';
import HotelsMakkah from './pages/data/HotelsMakkah';
import HotelsMadinah from './pages/data/HotelsMadinah';
import Ziyarats from './pages/data/Ziyarats';
import Transport from './pages/data/Transport';
import SpecialServices from './pages/data/SpecialServices';
import CurrencySettings from './pages/data/CurrencySettings';

// Module 2
import PackageList from './pages/packages/PackageList';
import PackageWizard from './pages/packages/PackageWizard';
import PackageDetail from './pages/packages/PackageDetail';
import Manifest from './pages/packages/Manifest';
import ClientList from './pages/clients/ClientList';
import ClientProfile from './pages/clients/ClientProfile';

// Visa workflow
import VisaTracker from './pages/visas/VisaTracker';

// Departures
import DepartureList from './pages/departures/DepartureList';
import DepartureForm from './pages/departures/DepartureForm';
import DepartureDetail from './pages/departures/DepartureDetail';
import DepartureManifest from './pages/departures/DepartureManifest';

// Suppliers
import SupplierList from './pages/suppliers/SupplierList';
import SupplierDetail from './pages/suppliers/SupplierDetail';

// Expenses
import Expenses from './pages/expenses/Expenses';

// Print docs
import Voucher from './pages/prints/Voucher';
import Invoice from './pages/prints/Invoice';
import Itinerary from './pages/prints/Itinerary';
import Receipt from './pages/prints/Receipt';

// Module 3
import Ledger from './pages/ledger/Ledger';
import ClientLedgerDetail from './pages/ledger/ClientLedgerDetail';
import LedgerStatement from './pages/prints/LedgerStatement';
import AccountsDashboard from './pages/accounts/AccountsDashboard';
import CashAccountList from './pages/accounts/CashAccountList';
import CashAccountDetail from './pages/accounts/CashAccountDetail';

// Module 4
import Reports from './pages/reports/Reports';

// Admin
import AuditLog from './pages/AuditLog';
import UserManagement from './pages/users/UserManagement';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-light">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-navy-800 border-t-gold-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute><CurrencyProvider><LanguageProvider><MainLayout /></LanguageProvider></CurrencyProvider></ProtectedRoute>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/airlines" element={<Airlines />} />
        <Route path="/hotels-makkah" element={<HotelsMakkah />} />
        <Route path="/hotels-madinah" element={<HotelsMadinah />} />
        <Route path="/ziyarats" element={<Ziyarats />} />
        <Route path="/transport" element={<Transport />} />
        <Route path="/special-services" element={<SpecialServices />} />
        <Route path="/currency" element={<CurrencySettings />} />
        <Route path="/packages" element={<PackageList />} />
        <Route path="/packages/new" element={<PackageWizard />} />
        <Route path="/packages/view/:id" element={<PackageDetail />} />
        <Route path="/packages/view/:id/manifest" element={<Manifest />} />
        <Route path="/packages/edit/:id" element={<PackageWizard mode="edit" />} />
        <Route path="/packages/duplicate/:id" element={<PackageWizard mode="duplicate" />} />
        <Route path="/clients" element={<ClientList />} />
        <Route path="/clients/view/:clientType/:id" element={<ClientProfile />} />
        <Route path="/visas" element={<VisaTracker />} />
        <Route path="/departures" element={<DepartureList />} />
        <Route path="/departures/new" element={<DepartureForm />} />
        <Route path="/departures/edit/:id" element={<DepartureForm />} />
        <Route path="/departures/view/:id" element={<DepartureDetail />} />
        <Route path="/departures/view/:id/manifest" element={<DepartureManifest />} />
        <Route path="/suppliers" element={<SupplierList />} />
        <Route path="/suppliers/view/:id" element={<SupplierDetail />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/packages/view/:id/voucher" element={<Voucher />} />
        <Route path="/packages/view/:id/invoice" element={<Invoice />} />
        <Route path="/packages/view/:id/itinerary" element={<Itinerary />} />
        <Route path="/ledger/receipt/:entryId" element={<Receipt />} />
        <Route path="/ledger" element={<Ledger />} />
        <Route path="/ledger/view/:clientType/:id" element={<ClientLedgerDetail />} />
        <Route path="/print/ledger-statement/:kind/:id" element={<LedgerStatement />} />
        <Route path="/accounts" element={<AccountsDashboard />} />
        <Route path="/cash-accounts" element={<CashAccountList />} />
        <Route path="/cash-accounts/view/:id" element={<CashAccountDetail />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/audit-log" element={<AuditLog />} />
        <Route path="/users" element={<UserManagement />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <Toaster position="top-right" toastOptions={{
          duration: 3000,
          style: { borderRadius: '12px', padding: '14px 20px', fontSize: '14px' },
          success: { style: { background: '#2E7D32', color: '#fff' }, iconTheme: { primary: '#fff', secondary: '#2E7D32' } },
          error: { style: { background: '#dc2626', color: '#fff' }, iconTheme: { primary: '#fff', secondary: '#dc2626' } },
        }} />
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}

export default App;
