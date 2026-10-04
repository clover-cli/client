# How to Contribute

## The rule: the client is an extension of the CLI

The client does nothing the CLI can't do. It never uses a cloud SDK. Every action is **one
`clover aws ...` or `clover gcp ...` command** that it runs and reads (`--output json`):

- Every form shows the exact equivalent command as you fill it in, ready to copy into a terminal or script.
- **Activity** lists every command the app ran this session, with exit codes and errors.
- To add something to the client, add it to the CLI first, then add a builder in `src/lib/clover.ts`.

| Screen | AWS | GCP |
| --- | --- | --- |
| Table Editor | `clover aws dynamodb list/get/create/delete/scan/put-item/delete-item` | `clover gcp firestore list/get/create/delete/scan/put-item/delete-item` |
| Storage | `clover aws s3 list/get/create/update/delete/objects/upload/download/delete-object` | `clover gcp storage` (same actions) |
| Functions | `clover aws lambda list/get/create/update/delete/invoke` | `clover gcp functions` (same actions) |
| Databases | `clover aws rds list/get/create/start/stop/reboot/delete` | `clover gcp sql` (same actions) |
| Compute | `clover aws ec2 list/create/start/stop/reboot/delete` | `clover gcp compute` (same actions) |
| Permissions | `clover aws iam policies/check` | `clover gcp iam policies/check` |
| Connect / region | `clover aws whoami` | `clover gcp whoami` |

## Development

```sh
npm install
npm run dev      # Vite + Electron with hot reload
npm run build    # typecheck, then build dist/ (UI) and dist-electron/ (main + preload)
npm start        # run the built app
npm run lint
npm test         # build the CLI first: the GCP tests check every command against it
```

The CLI comes from `../cli` (`"@clover-cli/cli": "file:../cli"`), so rebuild it
(`npm run build` in `../cli`) after changing it. The app runs its `dist/index.js` with Electron's
bundled Node, so no separate Node install is needed.

To use another CLI, set `CLOVER_CLI`:

```sh
CLOVER_CLI=$(which clover) npm run dev            # a `clover` executable, e.g. from `npm link`
CLOVER_CLI=/path/to/cli/dist/index.js npm run dev  # an entry script
```

## Credentials

The client follows the CLI's model: credentials are the standard `AWS_*` environment variables, or
`GOOGLE_CLOUD_PROJECT` (plus an optional `GOOGLE_APPLICATION_CREDENTIALS` key file) for GCP, and
nothing is written to disk. One provider is connected at a time.

- Start the app from a shell with credentials loaded (e.g. after `eval "$(clover aws login)"` or
  `eval "$(clover gcp login)"`) and it uses them. AWS wins when both are set.
- Or enter an access key, or a GCP project, in the app. It's checked with `clover aws whoami` /
  `clover gcp whoami` and kept in the main process's memory until you disconnect or quit. The UI never
  gets the secret back.

Each CLI run gets the credentials as environment variables, never as arguments.

