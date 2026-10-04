import { describe, expect, it, vi } from 'vitest';
import { cloudFunctions, cloudSql, firestore, gce, gcpIam, gcs, type Cmd } from '../src/lib/clover';

// The real CLI: the @clover-cli/cli dependency (build it first), not a CLOVER_CLI override.
vi.stubEnv('CLOVER_CLI', undefined);
const { runCli } = await import('../electron/cli');

/**
 * Every `clover gcp` command the screens run, with each option they can send. The CLI is strict, so
 * an option it doesn't know fails the parse; without credentials, a command that parses fails with
 * "No GCP project found" instead, before it calls GCP.
 */
const COMMANDS: Record<string, Cmd> = {
    'storage list': gcs.list(),
    'storage get': gcs.get('b'),
    'storage create': gcs.create('b', { region: 'europe-west1', versioning: true, labels: ['env=dev'] }),
    'storage update': gcs.update('b', { versioning: false, labels: ['env=prod'], 'remove-labels': ['old'] }),
    'storage delete': gcs.delete('b', { force: true }),
    'storage objects': gcs.objects('b', { prefix: 'img/' }),
    'storage upload': gcs.upload('b', 'package.json', { key: 'img/a.json', 'content-type': 'application/json' }),
    'storage download': gcs.download('b', 'img/a.json', 'a.json'),
    'storage delete-object': gcs.deleteObject('b', 'img/a.json'),

    'functions list': cloudFunctions.list(),
    'functions get': cloudFunctions.get('hello'),
    'functions create': cloudFunctions.create('hello', {
        source: 'test', runtime: 'nodejs22', 'entry-point': 'main', memory: 256, timeout: 60, env: ['A=1'], wait: true,
    }),
    'functions update': cloudFunctions.update('hello', { source: 'test', env: ['A=2'], 'remove-env': ['B'], wait: true }),
    'functions delete': cloudFunctions.delete('hello'),
    'functions invoke': cloudFunctions.invoke('hello', { payload: '{"name":"Ada"}' }),

    'sql list': cloudSql.list(),
    'sql get': cloudSql.get('db'),
    'sql create': cloudSql.create('db', {
        'database-version': 'POSTGRES_16', tier: 'db-f1-micro', storage: 10, password: 'pw', public: true,
        'deletion-protection': true, labels: ['env=dev'], wait: true,
    }),
    'sql start': cloudSql.start('db'),
    'sql stop': cloudSql.stop('db'),
    'sql reboot': cloudSql.reboot('db'),
    'sql delete': cloudSql.delete('db', { force: true }),

    'compute list': gce.list(),
    'compute create': gce.create({
        name: 'web', 'machine-type': 'e2-micro', image: 'debian-12', 'disk-size': 20, 'startup-script': 'echo hi',
        'public-ip': false, labels: ['env=dev'], wait: true,
    }),
    'compute start': gce.start('web', 'us-central1-a'),
    'compute stop': gce.stop('web', 'us-central1-a'),
    'compute reboot': gce.reboot('web', 'us-central1-a'),
    'compute delete': gce.delete('web', 'us-central1-a', { force: true }),

    'firestore list': firestore.list(),
    'firestore get': firestore.get('default'),
    'firestore create': firestore.create('default', { region: 'nam5', 'deletion-protection': true, wait: true }),
    'firestore delete': firestore.delete('default', { force: true }),
    'firestore scan': firestore.scan('default', { collection: 'users', limit: 0 }),
    'firestore put-item': firestore.putItem('default', 'users', '1', '{"name":"Ada"}'),
    'firestore delete-item': firestore.deleteItem('default', 'users', '1'),

    'iam policies': gcpIam.policies(),
    'iam check': gcpIam.check(),
};

describe.concurrent('every GCP command the client runs is one the CLI accepts', () => {
    it.each(Object.entries(COMMANDS))('clover gcp %s', async (_, cmd) => {
        // As run() sends it, and without credentials: runCli drops GOOGLE_* from the environment.
        const result = await runCli([...cmd, '--output', 'json'], undefined);
        expect(result.stderr).toContain('No GCP project found');
        expect(result.code).toBe(1);
    });

    // Shown on Overview to copy into a terminal, and run as is.
    it.each([['whoami'], ['list-resources']])('clover gcp %s', async (command) => {
        expect((await runCli(['gcp', command], undefined)).stderr).toContain('No GCP project found');
    });
});

describe('GCP commands', () => {
    it('confirm deletes with --yes, since the CLI has no terminal to ask in', () => {
        const deletes = Object.entries(COMMANDS).filter(([name]) => /delete(-object)?$/.test(name) && !name.endsWith('delete-item'));
        expect(deletes.length).toBeGreaterThan(0);
        for (const [, cmd] of deletes) expect(cmd).toContain('--yes');
    });

    it('act on a Compute Engine instance in its own zone', () => {
        expect(gce.stop('web', 'europe-west1-b')).toEqual(['gcp', 'compute', 'stop', 'web', '--zone', 'europe-west1-b']);
    });

    it('leave out options that are not set', () => {
        expect(gcs.create('b', { region: '', versioning: undefined, labels: [] })).toEqual(['gcp', 'storage', 'create', 'b']);
    });
});
