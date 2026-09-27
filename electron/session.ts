import type { AwsCredentials, Identity, Session } from '../shared/types';
import { runCli } from './cli';

/**
 * The AWS credentials for this session.
 *
 * Like the CLI, the client never writes credentials to disk. They come from the environment the app
 * was started from (the same AWS_* variables the CLI reads), or are entered in the app, and they
 * live in this process's memory until the app quits or you disconnect. The renderer never
 * gets them back.
 */

const DEFAULT_REGION = 'us-east-1';

let credentials: AwsCredentials | undefined;
let session: Session = { connected: false };

export function currentCredentials(): AwsCredentials | undefined {
    return credentials;
}

export function currentSession(): Session {
    return session;
}

/** Reads the credentials the way the CLI does (readAwsEnv in the CLI's src/credentials.ts). */
export function credentialsFromEnv(env: NodeJS.ProcessEnv = process.env): AwsCredentials | undefined {
    if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) return undefined;
    return {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        sessionToken: env.AWS_SESSION_TOKEN || undefined,
        region: env.AWS_REGION || env.AWS_DEFAULT_REGION || DEFAULT_REGION,
    };
}

/** `clover aws whoami` prints: "<arn> (account <id>, region <region>)" */
function parseWhoami(stdout: string): Identity | undefined {
    const match = /^(\S+) \(account (\S+), region (\S+)\)$/.exec(stdout.trim());
    return match ? { arn: match[1], account: match[2], region: match[3] } : undefined;
}

function mask(value: string): string {
    return value.length <= 4 ? '****' : '*'.repeat(value.length - 4) + value.slice(-4);
}

/**
 * Verifies the credentials with `clover aws whoami` and, when AWS accepts them, makes them the
 * session's. On failure the previous session is kept and the CLI's error is thrown.
 */
export async function connect(next: AwsCredentials, source: 'env' | 'app'): Promise<Session> {
    const trimmed: AwsCredentials = {
        accessKeyId: next.accessKeyId.trim(),
        secretAccessKey: next.secretAccessKey.trim(),
        sessionToken: next.sessionToken?.trim() || undefined,
        region: next.region.trim() || DEFAULT_REGION,
    };
    if (!trimmed.accessKeyId || !trimmed.secretAccessKey) {
        throw new Error('Access Key ID and Secret Access Key are required.');
    }

    const result = await runCli(['aws', 'whoami'], trimmed);
    const identity = result.code === 0 ? parseWhoami(result.stdout) : undefined;
    if (!identity) {
        throw new Error(result.stderr.trim() || result.stdout.trim() || 'clover aws whoami failed.');
    }

    credentials = trimmed;
    session = { connected: true, identity, source, accessKeyHint: mask(trimmed.accessKeyId) };
    return session;
}

/** Same credentials, another region: verified again, as `AWS_REGION=<region> clover aws whoami` would. */
export async function setRegion(region: string): Promise<Session> {
    if (!credentials || !session.source) throw new Error('Not connected.');
    return connect({ ...credentials, region }, session.source);
}

/** Forgets the credentials, like `eval "$(clover aws logout)"` in a shell. */
export function disconnect(): Session {
    credentials = undefined;
    session = { connected: false };
    return session;
}
