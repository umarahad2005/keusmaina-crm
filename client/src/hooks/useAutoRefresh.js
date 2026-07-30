import { useEffect, useRef } from 'react';

// Keeps a screen in step with the server while it stays open.
//
// This CRM is used by several roles at once — sales sells a package, accounts
// posts the payment, operations builds the manifest — so a list left open goes
// stale within minutes. This re-fetches on a timer and whenever the tab regains
// focus, which is when a stale screen is about to be acted on.
//
// Rules that keep it from being a nuisance:
//   - nothing runs while the tab is hidden (no background load, no wasted
//     Render free-tier requests)
//   - a `minGapMs` floor stops focus + visibilitychange double-firing on the
//     same tab switch
//   - `enabled: false` pauses it, which callers use while a modal is open so
//     the list can't shuffle under a form someone is filling in
//
// The callback should be a SILENT refetch — one that doesn't flip a full-page
// loading flag or raise error toasts, or the screen will blank every interval.

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_MIN_GAP_MS = 5_000;

export default function useAutoRefresh(refetch, options = {}) {
    const {
        enabled = true,
        intervalMs = DEFAULT_INTERVAL_MS,
        minGapMs = DEFAULT_MIN_GAP_MS,
    } = options;

    // Hold the callback in a ref so a new closure each render doesn't restart
    // the timer — otherwise the interval would never actually elapse. The
    // assignment goes in an effect rather than the render body so we never
    // mutate a ref while rendering.
    const refetchRef = useRef(refetch);
    useEffect(() => { refetchRef.current = refetch; }, [refetch]);

    const lastRunAt = useRef(0);

    useEffect(() => {
        if (!enabled) return undefined;

        let timer = null;

        const run = () => {
            if (document.visibilityState !== 'visible') return;
            const now = Date.now();
            if (now - lastRunAt.current < minGapMs) return;
            lastRunAt.current = now;
            refetchRef.current?.();
        };

        const start = () => {
            if (timer === null) timer = setInterval(run, intervalMs);
        };
        const stop = () => {
            if (timer !== null) { clearInterval(timer); timer = null; }
        };

        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') { run(); start(); }
            else stop();
        };

        start();
        window.addEventListener('focus', run);
        document.addEventListener('visibilitychange', onVisibilityChange);

        return () => {
            stop();
            window.removeEventListener('focus', run);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, [enabled, intervalMs, minGapMs]);
}
