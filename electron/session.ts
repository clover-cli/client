import type { Credentials, Identity, Session } from '../shared/types';
import { runCli } from './cli';

/**
 * The credentials for this session: AWS or GCP, one at a time.
 *
 * Like the CLI, the client never writes credentials to disk. They come from the environment the app
 * was started from (the same AWS_* / GOOGLE_* variables the CLI reads), or are entered in the app, and
 * they live in this process's memory until the app quits or you disconnect. The renderer never
 * gets them back.
 */

const DEFAULT_REGION = 'us-east-1';
/** GCP commands take --region, defaulting to this (DEFAULT_GCP_REGION in the CLI). */
const GCP_REGION = 'us-central1';

let credentials: Credentials | undefined;
let session: Session = { connected: false };

export function currentCredentials(): Credentials | undefined {
    return credentials;
}

export function currentSession(): Session {
    return session;
}

/** Reads the credentials the way the CLI does (readAwsEnv / readGcpEnv in the CLI's src/credentials.ts). AWS first. */
export function credentialsFromEnv(env: NodeJS.ProcessEnv = process.env): Credentials | undefined {
    if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
        return {
            provider: 'aws',
            accessKeyId: env.AWS_ACCESS_KEY_ID,
            secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
            sessionToken: env.AWS_SESSION_TOKEN || undefined,
            region: env.AWS_REGION || env.AWS_DEFAULT_REGION || DEFAULT_REGION,
        };
    }
    if (env.GOOGLE_CLOUD_PROJECT) {
        return { provider: 'gcp', project: env.GOOGLE_CLOUD_PROJECT, keyFile: env.GOOGLE_APPLICATION_CREDENTIALS || undefined };
    }
    return undefined;
}

/**
 * `clover aws whoami` prints: "<arn> (account <id>, region <region>)"
 * `clover gcp whoami` prints: "<email or 'application default credentials'> (project <id>)"
 */
function parseWhoami(stdout: string): Identity | undefined {
    const aws = /^(\S+) \(account (\S+), region (\S+)\)$/.exec(stdout.trim());
    if (aws) return { arn: aws[1], account: aws[2], region: aws[3] };
    const gcp = /^(.+) \(project (\S+)\)$/.exec(stdout.trim());
    return gcp ? { arn: gcp[1], account: gcp[2], region: GCP_REGION } : undefined;
}

function mask(value: string): string {
    return value.length <= 4 ? '****' : '*'.repeat(value.length - 4) + value.slice(-4);
}

function clean(next: Credentials): Credentials {
    if (next.provider === 'gcp') {
        const project = next.project.trim();
        if (!project) throw new Error('A project ID is required.');
        return { provider: 'gcp', project, keyFile: next.keyFile?.trim() || undefined };
    }
    const accessKeyId = next.accessKeyId.trim();
    const secretAccessKey = next.secretAccessKey.trim();
    if (!accessKeyId || !secretAccessKey) {
        throw new Error('Access Key ID and Secret Access Key are required.');
    }
    return {
        provider: 'aws', accessKeyId, secretAccessKey,
        sessionToken: next.sessionToken?.trim() || undefined,
        region: next.region.trim() || DEFAULT_REGION,
    };
}

/**
 * Verifies the credentials with `clover aws whoami` / `clover gcp whoami` and, when they're accepted,
 * makes them the session's. On failure the previous session is kept and the CLI's error is thrown.
 */
export async function connect(next: Credentials, source: 'env' | 'app'): Promise<Session> {
    const trimmed = clean(next);
    const result = await runCli([trimmed.provider, 'whoami'], trimmed);
    const identity = result.code === 0 ? parseWhoami(result.stdout) : undefined;
    if (!identity) {
        throw new Error(result.stderr.trim() || result.stdout.trim() || `clover ${trimmed.provider} whoami failed.`);
    }

    credentials = trimmed;
    const accessKeyHint = trimmed.provider === 'aws' ? mask(trimmed.accessKeyId) : trimmed.keyFile ?? 'application default credentials';
    session = { connected: true, provider: trimmed.provider, identity, source, accessKeyHint };
    return session;
}

/** Same AWS credentials, another region: verified again, as `AWS_REGION=<region> clover aws whoami` would. */
export async function setRegion(region: string): Promise<Session> {
    if (credentials?.provider !== 'aws' || !session.source) throw new Error('Not connected to AWS.');
    return connect({ ...credentials, region }, session.source);
}

/** Forgets the credentials, like `eval "$(clover aws logout)"` in a shell. */
export function disconnect(): Session {
    credentials = undefined;
    session = { connected: false };
    return session;
}
