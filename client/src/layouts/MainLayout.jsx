import { useState, useRef, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';

// Distance (px) the user must drag from the left edge before we count it as a
// swipe-back. Kept generous so accidental horizontal drags on tables don't fire.
const SWIPE_THRESHOLD = 70;
const EDGE_ZONE = 28; // touch must start within this many px of the left edge

export default function MainLayout() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [swipeProgress, setSwipeProgress] = useState(0); // 0..1 for the visual indicator
    const navigate = useNavigate();
    const location = useLocation();
    const touchRef = useRef({ startX: 0, startY: 0, active: false });

    const handleBack = () => {
        if (window.history.length > 1) navigate(-1);
        else navigate('/');
    };

    // Edge-swipe-right gesture → go back. Only kicks in when:
    //   • touch begins inside the left-edge zone
    //   • user is not already on dashboard
    //   • sidebar isn't open (then the swipe should close the sidebar instead)
    useEffect(() => {
        const onTouchStart = (e) => {
            if (location.pathname === '/' || sidebarOpen) return;
            const t = e.touches[0];
            if (!t) return;
            if (t.clientX <= EDGE_ZONE) {
                touchRef.current = { startX: t.clientX, startY: t.clientY, active: true };
            }
        };
        const onTouchMove = (e) => {
            if (!touchRef.current.active) return;
            const t = e.touches[0];
            const dx = t.clientX - touchRef.current.startX;
            const dy = t.clientY - touchRef.current.startY;
            // Cancel if it's clearly a vertical scroll
            if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 12) {
                touchRef.current.active = false;
                setSwipeProgress(0);
                return;
            }
            if (dx > 0) setSwipeProgress(Math.min(1, dx / SWIPE_THRESHOLD));
        };
        const onTouchEnd = (e) => {
            if (!touchRef.current.active) return;
            const dx = (e.changedTouches[0]?.clientX || 0) - touchRef.current.startX;
            touchRef.current.active = false;
            setSwipeProgress(0);
            if (dx >= SWIPE_THRESHOLD) handleBack();
        };

        window.addEventListener('touchstart', onTouchStart, { passive: true });
        window.addEventListener('touchmove', onTouchMove, { passive: true });
        window.addEventListener('touchend', onTouchEnd, { passive: true });
        window.addEventListener('touchcancel', onTouchEnd, { passive: true });
        return () => {
            window.removeEventListener('touchstart', onTouchStart);
            window.removeEventListener('touchmove', onTouchMove);
            window.removeEventListener('touchend', onTouchEnd);
            window.removeEventListener('touchcancel', onTouchEnd);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.pathname, sidebarOpen]);

    // Keyboard shortcut for back: Alt+Left (matches browser convention)
    useEffect(() => {
        const onKey = (e) => {
            if (e.altKey && e.key === 'ArrowLeft' && location.pathname !== '/') {
                e.preventDefault();
                handleBack();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.pathname]);

    return (
        <div className="min-h-screen bg-light">
            {/* Sidebar */}
            <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            {/* Visual indicator while user is mid-swipe (mobile only) */}
            {swipeProgress > 0 && (
                <div
                    className="fixed inset-y-0 left-0 z-50 pointer-events-none flex items-center"
                    style={{
                        width: `${Math.round(swipeProgress * 80)}px`,
                        background: `linear-gradient(90deg, rgba(26,44,91,${swipeProgress * 0.18}) 0%, transparent 100%)`
                    }}
                >
                    <div
                        className="ml-2 rounded-full bg-navy-800 text-white shadow-lg flex items-center justify-center"
                        style={{
                            width: 36, height: 36,
                            opacity: swipeProgress,
                            transform: `scale(${0.6 + swipeProgress * 0.4})`
                        }}
                        aria-hidden
                    >
                        ←
                    </div>
                </div>
            )}

            {/* Main content area — the main-content class handles RTL margin via CSS */}
            <div className="main-content lg:ml-64 min-h-screen flex flex-col">
                <Topbar onMenuClick={() => setSidebarOpen(true)} />

                {/* Page content */}
                <main className="flex-1 p-4 sm:p-6 animate-fade-in">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
