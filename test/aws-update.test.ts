import { describe, expect, it, vi } from 'vitest';
import { dynamodb, ec2, rds, type Cmd } from '../src/lib/clover';

// The real CLI: the @clover-cli/cli dependency (build it first), not a CLOVER_CLI override.
vi.stubEnv('CLOVER_CLI', undefined);
const { runCli } = await import('../electron/cli');

/**
 * The `clover aws ... update` commands the edit forms run, with each option they can send. An
 * option the CLI doesn't know fails the parse; without credentials, one that parses fails with
 * "No AWS credentials found" instead, before it calls AWS.
 */
const COMMANDS: Record<string, Cmd> = {
    'ec2 update': ec2.update('i-123', {
        'instance-type': 't3.small', restart: true, name: 'web', tags: ['env=prod'], 'remove-tags': ['old'], 'termination-protection': false,
    }),
    'rds update': rds.update('db', {
        'instance-class': 'db.t3.small', storage: 40, password: 'pw', 'backup-retention': 7, 'multi-az': true, public: false,
        'deletion-protection': true, 'apply-immediately': true, tags: ['env=prod'], wait: true,
    }),
    'dynamodb update': dynamodb.update('users', {
        billing: 'provisioned', 'read-capacity': 10, 'write-capacity': 5, 'ttl-attribute': 'expiresAt',
        'deletion-protection': true, tags: ['env=prod'], wait: true,
    }),
    'dynamodb update (TTL off)': dynamodb.update('users', { 'ttl-attribute': '' }),
};

describe('dynamodb update', () => {
    it('sends an empty --ttl-attribute to turn TTL off, and leaves it out when unset', () => {
        expect(dynamodb.update('t', { 'ttl-attribute': '' })).toEqual(['aws', 'dynamodb', 'update', 't', '--ttl-attribute', '']);
        expect(dynamodb.update('t', {})).toEqual(['aws', 'dynamodb', 'update', 't']);
    });
});

describe.concurrent('every AWS update the client runs is one the CLI accepts', () => {
    it.each(Object.entries(COMMANDS))('clover aws %s', async (_, cmd) => {
        const result = await runCli([...cmd, '--output', 'json'], undefined);
        expect(result.stderr).toContain('No AWS credentials found');
        expect(result.code).toBe(1);
    });
});
