import { createContext, useContext, useState, useEffect } from 'react';
import en from '../i18n/en.json';
import ur from '../i18n/ur.json';

const translations = { en, ur };
const LanguageContext = createContext();

export function LanguageProvider({ children }) {
    const [lang, setLang] = useState(() => localStorage.getItem('crm_lang') || 'en');

    useEffect(() => {
        localStorage.setItem('crm_lang', lang);
        // Apply RTL for Urdu
        document.documentElement.dir = lang === 'ur' ? 'rtl' : 'ltr';
        document.documentElement.lang = lang;
        // Add/remove RTL class for CSS
        if (lang === 'ur') {
            document.body.classList.add('rtl');
        } else {
            document.body.classList.remove('rtl');
        }
    }, [lang]);

    const t = (path) => {
        const keys = path.split('.');
        let value = translations[lang];
        for (const key of keys) {
            value = value?.[key];
        }
        return value || path;
    };

    const toggleLang = () => setLang(l => l === 'en' ? 'ur' : 'en');

    return (
        <LanguageContext.Provider value={{ lang, setLang, toggleLang, t, isRTL: lang === 'ur' }}>
            {children}
        </LanguageContext.Provider>
    );
}

export const useLang = () => useContext(LanguageContext);
