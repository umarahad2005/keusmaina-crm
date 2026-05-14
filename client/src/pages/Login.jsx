import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MdEmail, MdLock, MdVisibility, MdVisibilityOff } from 'react-icons/md';

export default function Login() {
    const { user, login, loading } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // If already logged in, redirect
    if (!loading && user) {
        return <Navigate to="/" replace />;
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!email || !password) return;
        setSubmitting(true);
        const success = await login(email, password);
        if (!success) setSubmitting(false);
    };

    return (
        <div className="min-h-screen bg-gradient-islamic flex items-center justify-center p-4">
            {/* Decorative elements */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 left-0 w-96 h-96 bg-gold-500/5 rounded-full -translate-x-1/2 -translate-y-1/2" />
                <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-gold-500/5 rounded-full translate-x-1/3 translate-y-1/3" />
            </div>

            <div className="w-full max-w-md relative">
                {/* Logo Card */}
                <div className="text-center mb-8 animate-fade-in">
                    <img
                        src="/assets/karwan-e-usmania-logo.png"
                        alt="Karwan-e-Usmania"
                        className="w-32 h-32 mx-auto mb-4 rounded-2xl bg-white/95 p-3 shadow-2xl object-contain"
                    />
                    <h1 className="text-3xl font-heading font-bold text-white mb-1">
                        Karwan-e-Usmania
                    </h1>
                    <p className="text-gold-400 text-sm font-medium tracking-wide">
                        Hajj & Umrah CRM System
                    </p>
                    <div className="divider-gold w-32 mx-auto mt-4" />
                </div>

                {/* Login Form */}
                <form
                    onSubmit={handleSubmit}
                    className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 animate-slide-up"
                >
                    <h2 className="text-xl font-heading font-bold text-dark text-center mb-6">
                        Sign In to Your Account
                    </h2>

                    {/* Email */}
                    <div className="mb-4">
                        <label className="label" htmlFor="email">Email Address</label>
                        <div className="relative">
                            <MdEmail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="input pl-10"
                                placeholder="admin@keusmania.com"
                                required
                                autoFocus
                            />
                        </div>
                    </div>

                    {/* Password */}
                    <div className="mb-6">
                        <label className="label" htmlFor="password">Password</label>
                        <div className="relative">
                            <MdLock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="input pl-10 pr-10"
                                placeholder="Enter your password"
                                required
                            />
                            <button
                                type="button"
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                onClick={() => setShowPassword(!showPassword)}
                            >
                                {showPassword ? <MdVisibilityOff size={18} /> : <MdVisibility size={18} />}
                            </button>
                        </div>
                    </div>

                    {/* Submit */}
                    <button
                        type="submit"
                        disabled={submitting}
                        className="btn-gold w-full text-base py-3 font-semibold"
                    >
                        {submitting ? (
                            <span className="flex items-center justify-center gap-2">
                                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Signing in...
                            </span>
                        ) : (
                            'Sign In'
                        )}
                    </button>

                    {/* Demo credentials hint */}
                    <div className="mt-6 p-3 bg-navy-50 rounded-lg">
                        <p className="text-xs text-navy-800 text-center">
                            <span className="font-semibold">Default Admin:</span> admin@keusmania.com / admin123
                        </p>
                    </div>
                </form>

                {/* Footer */}
                <p className="text-center text-gray-400 text-xs mt-6">
                    © 2026 Karwan-e-Usmania — Lahore, Pakistan
                </p>
            </div>
        </div>
    );
}
