import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { projects, type Project } from '../src/lib/clover';

// The real CLI (build it first), not a CLOVER_CLI override.
vi.stubEnv('CLOVER_CLI', undefined);
const { runCli } = await import('../electron/cli');

// Never the real ~/.config/clover. Stubbed before each test, since vitest undoes stubs after each one.
const store = mkdtempSync(join(tmpdir(), 'clover-projects-'));
beforeEach(() => { vi.stubEnv('XDG_CONFIG_HOME', store); });

const json = async <T>(cmd: string[]): Promise<T> => {
    const result = await runCli([...cmd, '--output', 'json'], undefined);
    expect(result.code, result.stderr).toBe(0);
    return JSON.parse(result.stdout) as T;
};
const current = async () => (await json<Project[]>(projects.list())).find((p) => p.current)?.name;

describe('projects', () => {
    it('are created, used, cleared and deleted with the CLI', async () => {
        await json(projects.create('web-app'));
        expect((await json<Project[]>(projects.list())).map((p) => p.name)).toEqual(['web-app']);

        expect((await runCli(projects.use('web-app'), undefined)).code).toBe(0);
        expect(await current()).toBe('web-app');
        expect((await runCli(projects.use(null), undefined)).code).toBe(0);
        expect(await current()).toBeUndefined();

        expect((await runCli(projects.delete('web-app'), undefined)).code).toBe(0);
        expect(await json<Project[]>(projects.list())).toEqual([]);
    });

    it.each([['add', projects.add('api', ['arn:aws:s3:::b'])], ['overview', projects.overview()]])(
        'project %s is a command the CLI accepts', async (_, cmd) => {
            if (!(await json<Project[]>(projects.list())).some((p) => p.name === 'api')) await json(projects.create('api'));
            // Without credentials, a command that parses fails before it calls AWS.
            const result = await runCli([...cmd, '--output', 'json'], undefined);
            expect(result.stderr).toContain('No AWS credentials found');
        });
});
