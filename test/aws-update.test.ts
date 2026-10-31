import { describe, expect, it, vi } from 'vitest';
import { ec2, type Cmd } from '../src/lib/clover';

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
};

describe.concurrent('every AWS update the client runs is one the CLI accepts', () => {
    it.each(Object.entries(COMMANDS))('clover aws %s', async (_, cmd) => {
        const result = await runCli([...cmd, '--output', 'json'], undefined);
        expect(result.stderr).toContain('No AWS credentials found');
        expect(result.code).toBe(1);
    });
});
