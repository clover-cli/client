import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The CLI is chosen when electron/cli.ts loads, so point it at the fake before importing.
vi.stubEnv('CLOVER_CLI', fileURLToPath(new URL('./fake-clover.js', import.meta.url)));
const { runCli } = await import('../electron/cli');
const { connect, credentialsFromEnv, currentSession, disconnect, setRegion } = await import('../electron/session');

afterEach(() => { disconnect(); });

describe('credentialsFromEnv', () => {
    it('reads the GCP project and key file the CLI reads', () => {
        expect(credentialsFromEnv({ GOOGLE_CLOUD_PROJECT: 'p1', GOOGLE_APPLICATION_CREDENTIALS: '/k.json' }))
            .toEqual({ provider: 'gcp', project: 'p1', keyFile: '/k.json' });
        expect(credentialsFromEnv({ GOOGLE_CLOUD_PROJECT: 'p1', GOOGLE_APPLICATION_CREDENTIALS: '' }))
            .toEqual({ provider: 'gcp', project: 'p1', keyFile: undefined });
    });

    it('prefers AWS when both are set, and needs a project for GCP', () => {
        expect(credentialsFromEnv({ GOOGLE_CLOUD_PROJECT: 'p1', AWS_ACCESS_KEY_ID: 'a', AWS_SECRET_ACCESS_KEY: 's' })?.provider).toBe('aws');
        expect(credentialsFromEnv({ GOOGLE_APPLICATION_CREDENTIALS: '/k.json' })).toBeUndefined();
    });
});

describe('connect to GCP', () => {
    it('verifies application default credentials with clover gcp whoami', async () => {
        const session = await connect({ provider: 'gcp', project: ' my-project ' }, 'app');
        expect(session).toEqual({
            connected: true, provider: 'gcp', source: 'app', accessKeyHint: 'application default credentials',
            identity: { arn: 'application default credentials', account: 'my-project', region: 'us-central1' },
        });
    });

    it('shows the service account and key file', async () => {
        const session = await connect({ provider: 'gcp', project: 'my-project', keyFile: '/keys/sa.json' }, 'env');
        expect(session.identity?.arn).toBe('clover@my-project.iam.gserviceaccount.com');
        expect(session.accessKeyHint).toBe('/keys/sa.json');
    });

    it('needs a project', async () => {
        await expect(connect({ provider: 'gcp', project: '  ' }, 'app')).rejects.toThrow('A project ID is required.');
    });

    it("throws the CLI's error and keeps the previous session when the credentials are rejected", async () => {
        await connect({ provider: 'gcp', project: 'my-project' }, 'app');
        await expect(connect({ provider: 'gcp', project: 'denied' }, 'app')).rejects.toThrow('Could not load the default credentials.');
        expect(currentSession().identity?.account).toBe('my-project');
    });

    it('has no AWS region to change', async () => {
        await connect({ provider: 'gcp', project: 'my-project' }, 'app');
        await expect(setRegion('us-west-2')).rejects.toThrow('Not connected to AWS.');
    });
});

describe('the environment of a GCP command', () => {
    it("has only the session's GCP variables, none from the app's own environment", async () => {
        vi.stubEnv('AWS_ACCESS_KEY_ID', 'leaked');
        vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'leaked');
        vi.stubEnv('GOOGLE_APPLICATION_CREDENTIALS', '/leaked.json');

        expect((await runCli(['gcp', 'env'], { provider: 'gcp', project: 'p1' })).json).toEqual({ GOOGLE_CLOUD_PROJECT: 'p1' });
        expect((await runCli(['gcp', 'env'], { provider: 'gcp', project: 'p1', keyFile: '/k.json' })).json)
            .toEqual({ GOOGLE_CLOUD_PROJECT: 'p1', GOOGLE_APPLICATION_CREDENTIALS: '/k.json' });
    });
});
