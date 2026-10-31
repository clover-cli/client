import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { formatCommand } from '../shared/format';
import type { CliActivity, CliInfo, CliResult, Credentials } from '../shared/types';

/**
 * Runs the clover CLI. This is the only way the client talks to AWS or GCP: every screen in the app is
 * a `clover aws ...` or `clover gcp ...` command, run exactly as it would be from a terminal.
 *
 * Which CLI runs:
 *   - CLOVER_CLI=/path/to/clover        a `clover` executable (e.g. a global `npm link`)
 *   - CLOVER_CLI=/path/to/dist/index.js the CLI's entry script, run with Electron's Node
 *   - otherwise                          the @clover-cli/cli dependency of this app
 */

const require = createRequire(import.meta.url);

/** The same variables the CLI reads (src/credentials.ts in the CLI). */
const CREDENTIAL_ENV_VARS = [
    'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'AWS_REGION', 'AWS_DEFAULT_REGION',
    'GOOGLE_CLOUD_PROJECT', 'GOOGLE_APPLICATION_CREDENTIALS',
];

interface Launcher {
    file: string;
    prefix: string[];
    env: NodeJS.ProcessEnv;
    label: string;
}

function resolveLauncher(): Launcher {
    const override = process.env.CLOVER_CLI;
    if (override && !override.endsWith('.js')) {
        return { file: override, prefix: [], env: {}, label: override };
    }
    const script = override
        ?? path.join(path.dirname(require.resolve('@clover-cli/cli/package.json')), 'dist', 'index.js');
    // ELECTRON_RUN_AS_NODE makes the Electron binary behave as plain Node.js.
    return { file: process.execPath, prefix: [script], env: { ELECTRON_RUN_AS_NODE: '1' }, label: `node ${script}` };
}

const launcher = resolveLauncher();

/**
 * The environment for one CLI run: the app's environment without any AWS or GCP credentials,
 * plus the session's credentials. The CLI reads them from there, as it would in a shell.
 */
function cliEnv(credentials: Credentials | undefined): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env, ...launcher.env };
    for (const name of CREDENTIAL_ENV_VARS) delete env[name];
    if (credentials?.provider === 'gcp') {
        env.GOOGLE_CLOUD_PROJECT = credentials.project;
        if (credentials.keyFile) env.GOOGLE_APPLICATION_CREDENTIALS = credentials.keyFile;
    } else if (credentials) {
        env.AWS_ACCESS_KEY_ID = credentials.accessKeyId;
        env.AWS_SECRET_ACCESS_KEY = credentials.secretAccessKey;
        if (credentials.sessionToken) env.AWS_SESSION_TOKEN = credentials.sessionToken;
        env.AWS_REGION = credentials.region;
    }
    return env;
}

let nextId = 1;
const running = new Set<ChildProcess>();
let activityListener: (activity: CliActivity) => void = () => {};

/** Receives every command as it starts and finishes (shown in the app's activity panel). */
export function onActivity(listener: (activity: CliActivity) => void): void {
    activityListener = listener;
}

/** Stops any command still running, e.g. when the app quits. */
export function killAll(): void {
    for (const child of running) child.kill();
}

export function runCli(args: string[], credentials: Credentials | undefined): Promise<CliResult> {
    const id = nextId++;
    const command = formatCommand(args);
    const startedAt = Date.now();
    activityListener({ id, command, status: 'running', startedAt });

    return new Promise((resolve) => {
        // No shell: arguments are passed as-is, so nothing in them is ever interpreted.
        // No stdin: the CLI never waits on a prompt (deletes are confirmed in the app and sent with --yes).
        const child = spawn(launcher.file, [...launcher.prefix, ...args], {
            env: cliEnv(credentials),
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        });
        running.add(child);

        let stdout = '';
        let stderr = '';
        child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk; });
        child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk; });

        const finish = (code: number) => {
            running.delete(child);
            const durationMs = Date.now() - startedAt;
            let json: unknown;
            const text = stdout.trim();
            if (text) {
                try { json = JSON.parse(text); } catch { /* not JSON: a plain-text command like whoami */ }
            }
            activityListener({
                id, command, status: code === 0 ? 'ok' : 'error', startedAt, durationMs, code,
                stderr: stderr.trim() || undefined,
            });
            resolve({ id, command, code, stdout, stderr, json, durationMs });
        };

        child.on('error', (err) => {
            stderr += `Could not start the clover CLI (${launcher.label}): ${err.message}`;
            finish(127);
        });
        child.on('close', (code) => finish(code ?? 1));
    });
}

export async function cliInfo(): Promise<CliInfo> {
    const result = await runCli(['--version'], undefined);
    return result.code === 0
        ? { location: launcher.label, version: result.stdout.trim() }
        : { location: launcher.label, error: result.stderr.trim() };
}
