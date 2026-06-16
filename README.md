# Airglow app catalog

The official catalog of installable [Airglow](https://airglow.dev) apps. Each
top-level directory with a `manifest.json` is one app; `catalog.json` is the
machine-readable index the extension's **Catalog** tab and the cloud
(`/api/catalog`, `/catalog`) read.

Users install an app from the extension (Dashboard → Catalog). The Airglow daemon
fetches that app's directory into the user's `~/.airglow/apps/<id>` workspace and
runs `bun install`. Apps are versioned by `manifest.version`; the extension
surfaces an update when a newer version ships here and flags locally-modified
installs.

## Layout

```
airglow-catalog/
├── catalog.json          # generated index (id, name, version, description)
├── shared/               # theme + components, imported via the @shared alias
├── airglow.d.ts          # the airglow.* SDK types
├── scripts/
│   ├── build-catalog.mjs # regenerates catalog.json from manifests
│   └── validate.mjs      # self-sufficiency check (manifest + deps + bundles)
├── hooks/pre-commit      # runs validate.mjs before every commit
└── <app-id>/             # one app: manifest.json + ui/ + userscripts/ + server/ + package.json
```

Apps live at the **workspace root** (not under `apps/`) and import shared code with
the **`@shared` alias** (`import { AppPage } from '@shared/components'`,
`@import "@shared/theme/tailwind-theme.css"`) — never relative `../../shared`
paths. The alias resolves identically here and inside an installed `~/.airglow`
workspace, so paths work in dev and production regardless of install depth.

## Dependencies

The workspace provides a **baseline** every app can use without declaring it:
`react`, `react-dom`, `tailwindcss`, `lucide-react`. An app's `package.json`
declares only its **extras** (e.g. `marked`, `@anthropic-ai/sdk`, `clsx`). On
install the daemon runs `bun install` inside `apps/<id>`, so extras land in the
app's own `node_modules` while the baseline resolves from the workspace root.

A `Could not resolve "<pkg>"` bundle error means the app imports `<pkg>` without
declaring it — add it to the app's `package.json`.

## Develop an app

```bash
git clone https://github.com/airglow-inc/airglow-catalog
cd airglow-catalog && bun install
```

Point your Airglow daemon at this checkout so it serves the apps live (bundles,
hot-reload, browser bridge):

```bash
# from the host repo (airglow-sdk/host):
bun run src/main.ts daemon --workspace /path/to/airglow-catalog
```

Now edit `<app-id>/` and test in the browser (see the app developer guide in the
workspace `docs/`). Build the app's UI (`ui/App.tsx`), userscripts
(`userscripts/*.ts`), optional `server/*.ts`, and `manifest.json`. Declare any
extra dependency with `cd <app-id> && bun add <pkg>`.

## Validate

```bash
npm run validate            # all apps
bun scripts/validate.mjs <app-id>   # one app
```

For each app this checks: manifest is valid (id matches the dir, has name +
version), declared deps install, and `ui/App.tsx` + every userscript + startup
**bundle clean** — surfacing compile errors and missing libraries before they
ever reach a user. The same check runs automatically as a **pre-commit hook**
(`hooks/pre-commit`, enabled by the `prepare` script on `bun install`), so a
broken app can't be committed.

## Publish a new app or version

1. Add or edit the app directory; `npm run validate` until it passes.
2. `npm run build-index` — regenerates `catalog.json`.
3. Commit (the pre-commit hook re-validates) and push.

The cloud reads `catalog.json` (raw, on `main`) and serves it at
`api.airglow.dev/api/catalog`; the extension's Catalog tab picks up the change on
its next load. Bumping `manifest.version` is what makes installed copies show
"Update available".

## Promote a local app

Built an app in your own `~/.airglow/apps/<id>` workspace and want to ship it?
Copy the directory here, run `npm run validate`, `npm run build-index`, commit,
push.
