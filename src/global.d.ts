import type { CloverBridge } from '../shared/types';

declare global {
    interface Window {
        /** Exposed by electron/preload.ts. */
        clover: CloverBridge;
    }
}
