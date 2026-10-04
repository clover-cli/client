import type { CliResult } from '../../shared/types';

/**
 * Every action in the client is one clover CLI command. The builders here return the command's
 * arguments (without `--output json`, which `run` adds), so the UI can show and copy the exact
 * command you would type in a terminal to do the same thing.
 *
 * Option names are the CLI's own (kebab-case), so each builder maps 1:1 to `clover aws ... --help`.
 */

export type Cmd = string[];

type FlagValue = string | number | boolean | undefined | null | readonly (string | number)[];

/**
 * { versioning: true, tags: ['env=dev'], limit: 10 } -> ['--versioning', '--tags', 'env=dev', '--limit', '10']
 * true -> --flag, false -> --no-flag, undefined/null/'' -> omitted, arrays repeat the flag.
 */
export function flags(options: Record<string, FlagValue>): string[] {
    const out: string[] = [];
    for (const [name, value] of Object.entries(options)) {
        if (value === undefined || value === null || value === '') continue;
        if (value === true) out.push(`--${name}`);
        else if (value === false) out.push(`--no-${name}`);
        else if (Array.isArray(value)) for (const v of value) out.push(`--${name}`, String(v));
        else out.push(`--${name}`, String(value));
    }
    return out;
}

/** "a=b\nc=d" (one per line, blank lines ignored) -> ['a=b', 'c=d'] */
export function lines(text: string): string[] {
    return text.split('\n').map((l) => l.trim()).filter(Boolean);
}

export class CliError extends Error {
    readonly result: CliResult;
    constructor(result: CliResult) {
        const lastLines = result.stderr.trim().split('\n').slice(-3).join('\n');
        super(lastLines || `${result.command} exited with code ${result.code}`);
        this.result = result;
    }
}

/** Runs a command and returns the raw result, whatever the exit code. */
export function runRaw(cmd: Cmd, { json = true } = {}): Promise<CliResult> {
    return window.clover.cli.run(json ? [...cmd, '--output', 'json'] : cmd);
}

/** Runs a command with `--output json` and returns what it printed, parsed. Throws CliError on failure. */
export async function run<T = unknown>(cmd: Cmd): Promise<T> {
    const result = await runRaw(cmd);
    if (result.code !== 0) throw new CliError(result);
    return result.json as T;
}

// ---- What the CLI prints with --output json (the *Summary types in the CLI's src/provider/aws-services) ----

export type Tags = Record<string, string>;

/** `versioning` is S3's 'Enabled' / 'Suspended', or GCP's true / false. GCP has `location` where S3 has `region`. */
export interface Bucket {
    name: string; region?: string; location?: string; storageClass?: string; versioning?: string | boolean;
    created?: string; tags?: Tags; labels?: Tags;
}
export interface S3Object { key: string; size?: number; modified?: string }

export interface Table {
    name: string; status?: string; partitionKey?: string; sortKey?: string; billing?: string;
    readCapacity?: number; writeCapacity?: number; items?: number; sizeBytes?: number;
    deletionProtection?: boolean; ttlAttribute?: string; arn?: string;
}
export type Item = Record<string, unknown>;
/** What `clover gcp firestore list/get` prints. */
export interface FirestoreDatabase { name: string; location?: string; type?: string; deletionProtection?: boolean; pointInTimeRecovery?: boolean; created?: string }

/** An RDS database, or a Cloud SQL instance (which has `tier`, `activation`, `ip`, `connectionName`...). */
export interface Database {
    id: string; engine?: string; version?: string; class?: string; status?: string; storageGb?: number;
    endpoint?: string; port?: number; username?: string; database?: string; multiAz?: boolean;
    public?: boolean; deletionProtection?: boolean; passwordSecret?: string; arn?: string;
    tier?: string; activation?: string; ip?: string; connectionName?: string; region?: string; labels?: Tags;
}

/** A Lambda function, or a Cloud Function (which has `memory` like "256M", `updated`, `entryPoint`, `uri`...). */
export interface LambdaFunction {
    name: string; runtime?: string; handler?: string; memoryMb?: number; timeoutSec?: number;
    architecture?: string; state?: string; lastUpdate?: string; modified?: string; role?: string;
    environment?: Record<string, string>; arn?: string;
    memory?: string; updated?: string; entryPoint?: string; serviceAccount?: string; uri?: string; labels?: Tags;
}
export interface InvokeResult { statusCode?: number; error?: string; payload: unknown; logs?: string }

export interface AttachedPolicy { name: string; type: 'aws-managed' | 'customer-managed' | 'inline'; via: string; arn?: string }
/** What `clover aws|gcp iam check` prints: IAM actions on AWS, permissions on GCP. */
export interface CommandCheck { service: string; command: string; allowed: boolean; actions?: string[]; permissions?: string[]; missing: string[] }
/** What `clover gcp iam policies` prints: the project roles granted directly. */
export interface GcpRole { role: string }

export interface Instance {
    id: string; name?: string; type?: string; state?: string; az?: string; publicIp?: string;
    privateIp?: string; imageId?: string; keyName?: string; launched?: string; tags?: Tags;
}

/** What `clover gcp compute list` prints. */
export interface GceInstance {
    name: string; zone?: string; machineType?: string; status?: string; publicIp?: string; privateIp?: string;
    created?: string; labels?: Tags;
}

// ---- Commands ----

/** Deletes are confirmed in the app, then run with --yes (the CLI requires it without a terminal). */
const YES = '--yes';

export const s3 = {
    list: (): Cmd => ['aws', 's3', 'list'],
    get: (bucket: string): Cmd => ['aws', 's3', 'get', bucket],
    create: (bucket: string, o: { region?: string; versioning?: boolean; tags?: string[] }): Cmd =>
        ['aws', 's3', 'create', bucket, ...flags(o)],
    update: (bucket: string, o: { versioning?: boolean; tags?: string[]; 'remove-tags'?: string[] }): Cmd =>
        ['aws', 's3', 'update', bucket, ...flags(o)],
    delete: (bucket: string, o: { force?: boolean }): Cmd => ['aws', 's3', 'delete', bucket, ...flags(o), YES],
    objects: (bucket: string, o: { prefix?: string; limit?: number }): Cmd => ['aws', 's3', 'objects', bucket, ...flags(o)],
    upload: (bucket: string, file: string, o: { key?: string; 'content-type'?: string }): Cmd =>
        ['aws', 's3', 'upload', bucket, file, ...flags(o)],
    download: (bucket: string, key: string, file: string): Cmd => ['aws', 's3', 'download', bucket, key, '--file', file],
    deleteObject: (bucket: string, key: string): Cmd => ['aws', 's3', 'delete-object', bucket, key, YES],
};

/** clover gcp storage: the same actions as s3, with labels instead of tags. */
export const gcs = {
    list: (): Cmd => ['gcp', 'storage', 'list'],
    get: (bucket: string): Cmd => ['gcp', 'storage', 'get', bucket],
    create: (bucket: string, o: { region?: string; versioning?: boolean; labels?: string[] }): Cmd =>
        ['gcp', 'storage', 'create', bucket, ...flags(o)],
    update: (bucket: string, o: { versioning?: boolean; labels?: string[]; 'remove-labels'?: string[] }): Cmd =>
        ['gcp', 'storage', 'update', bucket, ...flags(o)],
    delete: (bucket: string, o: { force?: boolean }): Cmd => ['gcp', 'storage', 'delete', bucket, ...flags(o), YES],
    objects: (bucket: string, o: { prefix?: string }): Cmd => ['gcp', 'storage', 'objects', bucket, ...flags(o)],
    upload: (bucket: string, file: string, o: { key?: string; 'content-type'?: string }): Cmd =>
        ['gcp', 'storage', 'upload', bucket, file, ...flags(o)],
    download: (bucket: string, key: string, file: string): Cmd => ['gcp', 'storage', 'download', bucket, key, '--file', file],
    deleteObject: (bucket: string, key: string): Cmd => ['gcp', 'storage', 'delete-object', bucket, key, YES],
};

export const dynamodb = {
    list: (): Cmd => ['aws', 'dynamodb', 'list'],
    get: (table: string): Cmd => ['aws', 'dynamodb', 'get', table],
    create: (table: string, o: {
        'partition-key': string; 'sort-key'?: string; billing?: string; 'read-capacity'?: number; 'write-capacity'?: number;
        'ttl-attribute'?: string; 'deletion-protection'?: boolean; tags?: string[]; wait?: boolean;
    }): Cmd => ['aws', 'dynamodb', 'create', table, ...flags(o)],
    delete: (table: string, o: { force?: boolean }): Cmd => ['aws', 'dynamodb', 'delete', table, ...flags(o), YES],
    scan: (table: string, o: { limit?: number }): Cmd => ['aws', 'dynamodb', 'scan', table, ...flags(o)],
    putItem: (table: string, item: string): Cmd => ['aws', 'dynamodb', 'put-item', table, '--item', item],
    deleteItem: (table: string, key: Item): Cmd => ['aws', 'dynamodb', 'delete-item', table, '--key', JSON.stringify(key)],
};

/** clover gcp firestore: databases, and JSON documents in collections (`default` is the (default) database). */
export const firestore = {
    list: (): Cmd => ['gcp', 'firestore', 'list'],
    get: (db: string): Cmd => ['gcp', 'firestore', 'get', db],
    create: (db: string, o: { region?: string; 'deletion-protection'?: boolean; wait?: boolean }): Cmd =>
        ['gcp', 'firestore', 'create', db, ...flags(o)],
    delete: (db: string, o: { force?: boolean }): Cmd => ['gcp', 'firestore', 'delete', db, ...flags(o), YES],
    scan: (db: string, o: { collection: string; limit?: number }): Cmd => ['gcp', 'firestore', 'scan', db, ...flags(o)],
    putItem: (db: string, collection: string, id: string, item: string): Cmd =>
        ['gcp', 'firestore', 'put-item', db, '--collection', collection, '--id', id, '--item', item],
    deleteItem: (db: string, collection: string, id: string): Cmd =>
        ['gcp', 'firestore', 'delete-item', db, '--collection', collection, '--id', id],
};

export const rds = {
    list: (): Cmd => ['aws', 'rds', 'list'],
    get: (id: string): Cmd => ['aws', 'rds', 'get', id],
    create: (id: string, o: {
        engine?: string; 'engine-version'?: string; 'instance-class'?: string; storage?: number; username?: string;
        password?: string; database?: string; public?: boolean; 'multi-az'?: boolean; 'backup-retention'?: number;
        'deletion-protection'?: boolean; tags?: string[]; wait?: boolean;
    }): Cmd => ['aws', 'rds', 'create', id, ...flags(o)],
    start: (id: string): Cmd => ['aws', 'rds', 'start', id],
    stop: (id: string): Cmd => ['aws', 'rds', 'stop', id],
    reboot: (id: string): Cmd => ['aws', 'rds', 'reboot', id],
    delete: (id: string, o: { 'final-snapshot'?: string; force?: boolean }): Cmd =>
        ['aws', 'rds', 'delete', id, ...flags(o), YES],
};

/** clover gcp sql: Cloud SQL instances. */
export const cloudSql = {
    list: (): Cmd => ['gcp', 'sql', 'list'],
    get: (id: string): Cmd => ['gcp', 'sql', 'get', id],
    create: (id: string, o: {
        'database-version'?: string; tier?: string; storage?: number; password: string; public?: boolean;
        'deletion-protection'?: boolean; labels?: string[]; wait?: boolean;
    }): Cmd => ['gcp', 'sql', 'create', id, ...flags(o)],
    start: (id: string): Cmd => ['gcp', 'sql', 'start', id],
    stop: (id: string): Cmd => ['gcp', 'sql', 'stop', id],
    reboot: (id: string): Cmd => ['gcp', 'sql', 'reboot', id],
    delete: (id: string, o: { force?: boolean }): Cmd => ['gcp', 'sql', 'delete', id, ...flags(o), YES],
};

export const lambda = {
    list: (): Cmd => ['aws', 'lambda', 'list'],
    get: (name: string): Cmd => ['aws', 'lambda', 'get', name],
    create: (name: string, o: {
        code: string; role: string; runtime?: string; handler?: string; memory?: number; timeout?: number;
        architecture?: string; description?: string; env?: string[]; tags?: string[]; wait?: boolean;
    }): Cmd => ['aws', 'lambda', 'create', name, ...flags(o)],
    update: (name: string, o: {
        code?: string; runtime?: string; handler?: string; memory?: number; timeout?: number;
        env?: string[]; 'remove-env'?: string[]; wait?: boolean;
    }): Cmd => ['aws', 'lambda', 'update', name, ...flags(o)],
    delete: (name: string): Cmd => ['aws', 'lambda', 'delete', name, YES],
    invoke: (name: string, o: { payload?: string; logs?: boolean }): Cmd => ['aws', 'lambda', 'invoke', name, ...flags(o)],
};

/** clover gcp functions: Cloud Functions (2nd gen) in the CLI's default region. */
export const cloudFunctions = {
    list: (): Cmd => ['gcp', 'functions', 'list'],
    get: (name: string): Cmd => ['gcp', 'functions', 'get', name],
    create: (name: string, o: {
        source: string; runtime?: string; 'entry-point'?: string; memory?: number; timeout?: number;
        description?: string; env?: string[]; labels?: string[]; wait?: boolean;
    }): Cmd => ['gcp', 'functions', 'create', name, ...flags(o)],
    update: (name: string, o: {
        source?: string; runtime?: string; 'entry-point'?: string; memory?: number; timeout?: number;
        env?: string[]; 'remove-env'?: string[]; wait?: boolean;
    }): Cmd => ['gcp', 'functions', 'update', name, ...flags(o)],
    delete: (name: string): Cmd => ['gcp', 'functions', 'delete', name, YES],
    invoke: (name: string, o: { payload?: string }): Cmd => ['gcp', 'functions', 'invoke', name, ...flags(o)],
};

export const ec2 = {
    list: (): Cmd => ['aws', 'ec2', 'list'],
    get: (id: string): Cmd => ['aws', 'ec2', 'get', id],
    create: (o: {
        image?: string; 'instance-type'?: string; count?: number; name?: string; 'key-name'?: string;
        'volume-size'?: number; 'public-ip'?: boolean; 'user-data'?: string; tags?: string[]; wait?: boolean;
    }): Cmd => ['aws', 'ec2', 'create', ...flags(o)],
    start: (id: string): Cmd => ['aws', 'ec2', 'start', id],
    stop: (id: string): Cmd => ['aws', 'ec2', 'stop', id],
    reboot: (id: string): Cmd => ['aws', 'ec2', 'reboot', id],
    delete: (id: string, o: { force?: boolean }): Cmd => ['aws', 'ec2', 'delete', id, ...flags(o), YES],
};

/** clover gcp compute: instances are addressed by name and --zone. */
export const gce = {
    list: (): Cmd => ['gcp', 'compute', 'list'],
    create: (o: {
        name?: string; 'machine-type'?: string; image?: string; 'disk-size'?: number; 'startup-script'?: string;
        'public-ip'?: boolean; labels?: string[]; wait?: boolean;
    }): Cmd => ['gcp', 'compute', 'create', ...flags(o)],
    start: (name: string, zone: string): Cmd => ['gcp', 'compute', 'start', name, '--zone', zone],
    stop: (name: string, zone: string): Cmd => ['gcp', 'compute', 'stop', name, '--zone', zone],
    reboot: (name: string, zone: string): Cmd => ['gcp', 'compute', 'reboot', name, '--zone', zone],
    delete: (name: string, zone: string, o: { force?: boolean }): Cmd => ['gcp', 'compute', 'delete', name, '--zone', zone, ...flags(o), YES],
};

export const iam = {
    policies: (): Cmd => ['aws', 'iam', 'policies'],
    check: (): Cmd => ['aws', 'iam', 'check'],
};

export const gcpIam = {
    policies: (): Cmd => ['gcp', 'iam', 'policies'],
    check: (): Cmd => ['gcp', 'iam', 'check'],
};

export const REGIONS = [
    'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'ca-central-1', 'sa-east-1',
    'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-north-1', 'eu-south-1',
    'ap-south-1', 'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2', 'ap-northeast-3',
    'me-central-1', 'af-south-1',
];
