import { describe, expect, it, vi } from 'vitest';
import { ec2, rds } from '../src/lib/clover';

// The real CLI: the @clover-cli/cli dependency (build it first), not a CLOVER_CLI override.
vi.stubEnv('CLOVER_CLI', undefined);
const { runCli } = await import('../electron/cli');

describe.concurrent('the summaries are commands the CLI accepts', () => {
    it.each([['ec2', ec2.summary()], ['rds', rds.summary()]])('clover aws %s summary', async (_, cmd) => {
        // Without credentials, a command that parses fails before it calls AWS.
        const result = await runCli([...cmd, '--output', 'json'], undefined);
        expect(result.stderr).toContain('No AWS credentials found');
        expect(result.code).toBe(1);
    });
});
