import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, session as electronSession, shell } from 'electron';
import type { Credentials, OpenDialogOptions } from '../shared/types';
import { cliInfo, killAll, onActivity, runCli } from './cli';
import { connect, credentialsFromEnv, currentCredentials, currentSession, disconnect, setRegion } from './session';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.join(__dirname, '..');
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

let win: BrowserWindow | null = null;

function createWindow() {
    win = new BrowserWindow({
        width: 1320,
        height: 860,
        minWidth: 960,
        minHeight: 600,
        title: 'Clover',
        backgroundColor: '#121212',
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    // The UI never navigates away or opens windows; external links go to the browser.
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https://')) void shell.openExternal(url);
        return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (event) => event.preventDefault());

    if (DEV_SERVER_URL) {
        void win.loadURL(DEV_SERVER_URL);
    } else {
        void win.loadFile(path.join(APP_ROOT, 'dist', 'index.html'));
    }
}

/**
 * The renderer may only run `clover aws ...` and `clover gcp ...` commands. Credentials belong to the
 * session (connect/disconnect), so `login` and `logout` are not run from here.
 */
function checkArgs(args: unknown): string[] {
    if (!Array.isArray(args) || !args.every((a): a is string => typeof a === 'string')) {
        throw new Error('CLI arguments must be a list of strings.');
    }
    if ((args[0] !== 'aws' && args[0] !== 'gcp') || args[1] === 'login' || args[1] === 'logout') {
        throw new Error(`Not a command the client runs: clover ${args.join(' ')}`);
    }
    return args;
}

function registerIpc() {
    onActivity((activity) => win?.webContents.send('cli:activity', activity));

    ipcMain.handle('session:get', () => currentSession());
    ipcMain.handle('session:connect', (_e, credentials: Credentials) => connect(credentials, 'app'));
    ipcMain.handle('session:setRegion', (_e, region: string) => setRegion(String(region)));
    ipcMain.handle('session:disconnect', () => disconnect());

    ipcMain.handle('cli:info', () => cliInfo());
    ipcMain.handle('cli:run', (_e, args: unknown) => runCli(checkArgs(args), currentCredentials()));

    ipcMain.handle('dialog:openPath', async (_e, options: OpenDialogOptions = {}) => {
        const result = await dialog.showOpenDialog(win!, {
            title: options.title,
            properties: [options.directory ? 'openDirectory' : 'openFile'],
        });
        return result.canceled ? undefined : result.filePaths[0];
    });
    ipcMain.handle('dialog:savePath', async (_e, defaultName: string) => {
        const result = await dialog.showSaveDialog(win!, {
            defaultPath: path.join(app.getPath('downloads'), path.basename(String(defaultName))),
        });
        return result.canceled ? undefined : result.filePath;
    });
}

app.whenReady().then(async () => {
    if (!DEV_SERVER_URL) {
        electronSession.defaultSession.webRequest.onHeadersReceived((details, callback) => {
            callback({
                responseHeaders: {
                    ...details.responseHeaders,
                    'Content-Security-Policy': ["default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"],
                },
            });
        });
    }

    registerIpc();

    // Started from a shell that already has credentials (e.g. after `eval "$(clover aws login)"` or `clover gcp login`)?
    // Use them, exactly like the CLI would.
    const fromEnv = credentialsFromEnv();
    if (fromEnv) {
        await connect(fromEnv, 'env').catch((err: Error) => console.error(`${fromEnv.provider.toUpperCase()} credentials from the environment were rejected: ${err.message}`));
    }

    createWindow();
});

app.on('before-quit', killAll);

app.on('window-all-closed', () => {
    app.quit();
});
