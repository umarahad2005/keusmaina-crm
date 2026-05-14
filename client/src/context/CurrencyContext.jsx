import { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';

const CurrencyContext = createContext(null);

export function CurrencyProvider({ children }) {
    const [sarToPkr, setSarToPkr] = useState(75.0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchRate();
    }, []);

    const fetchRate = async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                setLoading(false);
                return;
            }
            const res = await api.get('/currency');
            if (res.data.success) {
                setSarToPkr(res.data.data.sarToPkr);
            }
        } catch (error) {
            console.log('Currency fetch skipped (not logged in yet)');
        } finally {
            setLoading(false);
        }
    };

    const convertToPKR = (sarAmount) => {
        return Math.round(sarAmount * sarToPkr * 100) / 100;
    };

    const formatSAR = (amount) => {
        return `SAR ${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    };

    const formatPKR = (amount) => {
        return `PKR ${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    };

    return (
        <CurrencyContext.Provider value={{ sarToPkr, setSarToPkr, convertToPKR, formatSAR, formatPKR, fetchRate }}>
            {children}
        </CurrencyContext.Provider>
    );
}

export function useCurrency() {
    const context = useContext(CurrencyContext);
    if (!context) throw new Error('useCurrency must be used within CurrencyProvider');
    return context;
}

export default CurrencyContext;
