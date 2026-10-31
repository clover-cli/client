# AGENTS.md

Clover Client is a desktop app (React + Vite + Electron) for the `clover` CLI: a Supabase-style UI over your own AWS account or GCP project. It's written in TypeScript.

## Commands

```sh
npm run build   # typecheck, then build dist/ and dist-electron/
npm test        # vitest (build ../cli first: the GCP tests run every command against it)
npm run lint    # oxlint
```

Run all three before you finish.

## Layout

- `src/lib/clover.ts`: one builder per CLI command (`s3`, `gcs`, `rds`, `cloudSql`, ...), the types the CLI prints with `--output json`, and `run()` / `runRaw()`.
- `src/pages/<Screen>.tsx`: one screen per service pair (e.g. `Databases.tsx` is RDS and Cloud SQL). Each takes `gcp` and picks the builders.
- `src/components/ActionModal.tsx`: a form that runs exactly one command and shows it as you fill it in.
- `src/components/ui.tsx`: shared UI: `Button`, `Field`, `Check`, `DataTable`, `Modal`, `CommandPreview`, and more.
- `src/lib/hooks.ts`: `useCli()` runs a read command and reloads it.
- `electron/cli.ts`: runs the CLI (`../cli`, or `CLOVER_CLI`). `electron/session.ts`: credentials, kept in memory and passed as env vars.
- `shared/`: types and formatting used by both the main process and the UI.
- `test/`: `gcp-commands.test.ts` checks every GCP builder against the real CLI. `fake-clover.js` stands in for it in session tests.

## Rules

- The client is an extension of the CLI. It never uses a cloud SDK. Every action is one `clover aws ...` or `clover gcp ...` command.
- A feature goes into the CLI first, then into a builder in `src/lib/clover.ts`, then into a screen.
- Builders use the CLI's own kebab-case option names and `flags()`. Unset options are left out.
- Writes go through `ActionModal`, so the exact command is shown and copyable. Reads go through `useCli()`.
- Deletes are confirmed in the app (`confirmWord`), then run with `--yes`.
- Keep it Supabase-simple: no screens for cloud plumbing (VPCs, subnets, security groups). Solve those in the CLI.
- Every GCP builder the screens use gets an entry in `COMMANDS` in `test/gcp-commands.test.ts`, with each option it can send.
- Don't comment code unless it's absolutely necessary (a non-obvious why, not a what). Never add a header comment at the top of a file describing what it does.

## Commits

Format: `<type>: <what>`, lowercase, one line, no body. One commit per feature or important change.

No AI attribution: no `Co-Authored-By` trailers, no "Generated with" lines, in commits or PRs.

- `feat`: a new feature
- `add`: new screens, actions or deps
- `fix`: a bug fix
- `fix-docs`, `fix-lint`: fix docs or lint warnings
- `docs`: documentation
- `update`: change existing files (docs, tests, readme)
- `remove`, `move`: delete or move files
- `refactor`: restructure without changing behavior
- `ver`: version bump, e.g. `ver: bump to 1.3.0`

Examples: `add: gcp sql update`, `fix: provider-neutral wait message`.

## Adding a CLI command

1. Make sure it exists in `../cli` (`clover <provider> <service> <action> --help`) and rebuild it.
2. Add a builder in `src/lib/clover.ts`, and its output type if a screen reads it.
3. Use it from the screen, in an `ActionModal` for writes.
4. For GCP, add it to `COMMANDS` in `test/gcp-commands.test.ts`.
5. Add it to the table in `CONTRIBUTING.md`.
