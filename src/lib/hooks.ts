import { useCallback, useEffect, useState } from 'react';
import { run, type Cmd } from './clover';

export interface Query<T> {
    data: T | undefined;
    error: string | undefined;
    loading: boolean;
    reload: () => void;
}

/**
 * Runs a read command (list/get/scan/...) and re-runs it when `key` changes or on reload().
 * Pass `null` to run nothing (e.g. while no bucket is selected).
 */
export function useCli<T>(cmd: Cmd | null): Query<T> {
    const key = cmd ? JSON.stringify(cmd) : null;
    const [state, setState] = useState<{ key: string | null; data?: T; error?: string; loading: boolean }>({ key, loading: !!cmd });
    const [tick, setTick] = useState(0);

    useEffect(() => {
        if (!key) {
            setState({ key, loading: false });
            return;
        }
        let current = true;
        // A reload keeps showing the old data while it runs; another command starts empty.
        setState((s) => ({ key, data: s.key === key ? s.data : undefined, loading: true }));
        run<T>(JSON.parse(key) as Cmd).then(
            (data) => { if (current) setState({ key, data, loading: false }); },
            (err: Error) => { if (current) setState({ key, error: err.message, loading: false }); },
        );
        return () => { current = false; };
    }, [key, tick]);

    const reload = useCallback(() => setTick((t) => t + 1), []);
    const stale = state.key !== key;
    return { data: stale ? undefined : state.data, error: stale ? undefined : state.error, loading: stale ? !!key : state.loading, reload };
}
