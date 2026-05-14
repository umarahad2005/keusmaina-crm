import { useCurrency } from '../context/CurrencyContext';

// Always derives PKR from the SAR value at the *current* exchange rate.
// The optional `pkr` prop is ignored — kept only so callers don't break.
// This way old records don't show stale rupee values when the rate moves.
export default function CurrencyDisplay({ sar }) {
    const { formatSAR, formatPKR, convertToPKR } = useCurrency();
    return (
        <div className="currency-tag">
            <span className="currency-sar">{formatSAR(sar || 0)}</span>
            <span className="text-gray-300 mx-1">|</span>
            <span className="currency-pkr">{formatPKR(convertToPKR(sar || 0))}</span>
        </div>
    );
}
