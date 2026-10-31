import { describe, expect, it, vi } from 'vitest';
import { cost } from '../src/lib/clover';

// The real CLI: the @clover-cli/cli dependency (build it first), not a CLOVER_CLI override.
vi.stubEnv('CLOVER_CLI', undefined);
const { runCli } = await import('../electron/cli');

describe('clover aws cost monthly', () => {
    it('is a command the CLI accepts, with --months', async () => {
        // Without credentials, a command that parses fails before it calls AWS.
        const result = await runCli([...cost.monthly({ months: 12 }), '--output', 'json'], undefined);
        expect(result.stderr).toContain('No AWS credentials found');
        expect(result.code).toBe(1);
    });
});
