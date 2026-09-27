/**
 * Types shared by the Electron main process and the React renderer.
 * Everything the renderer can do goes through `window.clover` (see electron/preload.ts),
 * and every AWS operation is a run of the clover CLI.
 */

export interface AwsCredentials {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    region: string;
}

/** Parsed from `clover aws whoami`. */
export interface Identity {
    arn: string;
    account: string;
    region: string;
}

export interface Session {
    connected: boolean;
    identity?: Identity;
    /** 'env': inherited from the environment the app was started from. 'app': entered in the app. */
    source?: 'env' | 'app';
    /** Masked access key id, e.g. ****************WXYZ. The secret never leaves the main process. */
    accessKeyHint?: string;
}

export interface CliInfo {
    /** How the CLI is launched, e.g. "/path/to/clover" or "electron /path/to/dist/index.js". */
    location: string;
    version?: string;
    error?: string;
}

export interface CliResult {
    id: number;
    /** The full command as it ran, e.g. "clover aws s3 list --output json". */
    command: string;
    code: number;
    stdout: string;
    stderr: string;
    /** stdout parsed as JSON, when it is JSON. */
    json?: unknown;
    durationMs: number;
}

export interface CliActivity {
    id: number;
    command: string;
    status: 'running' | 'ok' | 'error';
    startedAt: number;
    durationMs?: number;
    code?: number;
    stderr?: string;
}

export interface OpenDialogOptions {
    title?: string;
    /** Pick a folder instead of a file (e.g. Lambda code, which the CLI zips for you). */
    directory?: boolean;
}

export interface CloverBridge {
    session: {
        get(): Promise<Session>;
        connect(credentials: AwsCredentials): Promise<Session>;
        setRegion(region: string): Promise<Session>;
        disconnect(): Promise<Session>;
    };
    cli: {
        info(): Promise<CliInfo>;
        run(args: string[]): Promise<CliResult>;
        onActivity(listener: (activity: CliActivity) => void): () => void;
    };
    dialog: {
        openPath(options?: OpenDialogOptions): Promise<string | undefined>;
        savePath(defaultName: string): Promise<string | undefined>;
    };
}
