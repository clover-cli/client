import { describe, expect, it, vi } from 'vitest';
import { ec2 } from '../src/lib/clover';

// The real CLI: the @clover-cli/cli dependency (build it first), not a CLOVER_CLI override.
vi.stubEnv('CLOVER_CLI', undefined);
const { runCli } = await import('../electron/cli');

describe('clover aws ec2 list filters', () => {
    it('are options the CLI accepts', async () => {
        // Without credentials, a command that parses fails before it calls AWS.
        const result = await runCli([...ec2.list({ state: ['running', 'stopped'], tag: ['env=dev'] }), '--output', 'json'], undefined);
        expect(result.stderr).toContain('No AWS credentials found');
        expect(result.code).toBe(1);
    });

    it('are left out when unset', () => {
        expect(ec2.list()).toEqual(['aws', 'ec2', 'list']);
        expect(ec2.list({ state: [], tag: [] })).toEqual(['aws', 'ec2', 'list']);
    });
});
