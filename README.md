# Clover Client

A desktop app (React + Vite + Electron) for the [clover CLI](../cli): a Supabase-style UI for
small projects and PoCs, running against **your own AWS account** with no platform in between.

## The rule: the client is an extension of the CLI

The client does nothing the CLI can't do. It never uses the AWS SDK. Every action is **one
`clover aws ...` command** that it runs and reads (`--output json`):

- Every form shows the exact equivalent command as you fill it in, ready to copy into a terminal or script.
- **Activity** lists every command the app ran this session, with exit codes and errors.
- To add something to the client, add it to the CLI first, then add a builder in `src/lib/clover.ts`.

| Screen | CLI |
| --- | --- |
| Table Editor | `clover aws dynamodb list/get/create/delete/scan/put-item/delete-item` |
| Storage | `clover aws s3 list/get/create/update/delete/objects/upload/download/delete-object` |
| Functions | `clover aws lambda list/get/create/update/delete/invoke` |
| Databases | `clover aws rds list/get/create/start/stop/reboot/delete` |
| Compute | `clover aws ec2 list/create/start/stop/reboot/delete` |
| Connect / region | `clover aws whoami` |

## Credentials

The client follows the CLI's model: credentials are the standard `AWS_*` environment variables,
and nothing is written to disk.

- Start the app from a shell with credentials loaded (e.g. after `eval "$(clover aws login)"`) and it uses them.
- Or enter an access key in the app. It's checked with `clover aws whoami` and kept in the main
  process's memory until you disconnect or quit. The UI never gets the secret back.

Each CLI run gets the credentials as environment variables, never as arguments.

## Development

```sh
npm install
npm run dev      # Vite + Electron with hot reload
npm run build    # typecheck, then build dist/ (UI) and dist-electron/ (main + preload)
npm start        # run the built app
npm run lint
```

The CLI comes from `../cli` (`"@clover-cli/cli": "file:../cli"`), so rebuild it
(`npm run build` in `../cli`) after changing it. The app runs its `dist/index.js` with Electron's
bundled Node, so no separate Node install is needed.

To use another CLI, set `CLOVER_CLI`:

```sh
CLOVER_CLI=$(which clover) npm run dev            # a `clover` executable, e.g. from `npm link`
CLOVER_CLI=/path/to/cli/dist/index.js npm run dev  # an entry script
```

## Layout

```
electron/
  main.ts       window, IPC handlers (the renderer can only run `clover aws ...`)
  cli.ts        finds and spawns the CLI (no shell, no stdin), reports activity
  session.ts    in-memory credentials, verified with `clover aws whoami`
  preload.ts    exposes window.clover to the UI (context isolation, sandboxed)
shared/         types and command formatting used by both sides
src/
  lib/clover.ts command builders, one per CLI action, using the CLI's own option names
  components/   ActionModal (form -> command preview -> run), tables, modals
  pages/        one page per service
```
