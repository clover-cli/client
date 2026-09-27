import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { CliActivity, CloverBridge } from '../shared/types';

/** Unwraps "Error invoking remote method 'x': Error: message" into just the message. */
async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
    try {
        return await ipcRenderer.invoke(channel, ...args) as T;
    } catch (err) {
        const message = (err as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
        throw new Error(message, { cause: err });
    }
}

const bridge: CloverBridge = {
    session: {
        get: () => invoke('session:get'),
        connect: (credentials) => invoke('session:connect', credentials),
        setRegion: (region) => invoke('session:setRegion', region),
        disconnect: () => invoke('session:disconnect'),
    },
    cli: {
        info: () => invoke('cli:info'),
        run: (args) => invoke('cli:run', args),
        onActivity: (listener) => {
            const handler = (_event: IpcRendererEvent, activity: CliActivity) => listener(activity);
            ipcRenderer.on('cli:activity', handler);
            return () => { ipcRenderer.removeListener('cli:activity', handler); };
        },
    },
    dialog: {
        openPath: (options) => invoke('dialog:openPath', options),
        savePath: (defaultName) => invoke('dialog:savePath', defaultName),
    },
};

contextBridge.exposeInMainWorld('clover', bridge);
