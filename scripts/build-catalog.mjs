// Regenerate catalog.json (schema 2) AND prebuild each cloud-capable app into
// static bundles under dist/<id>/ — the exact assets the cloud serves to the
// daemonless extension tier:
//   dist/<id>/us/<userscript file>.iife.js   (+ startup as .esm.js)
//   dist/<id>/ui.html                        (self-contained UI page)
//
// Bundling reuses the host's bundler (`airglow internal-build` — the same
// Bun.build path the daemon serves from) so published output is byte-identical
// to daemon dev output. Requires bun and a sibling ../airglow-sdk checkout.
//
// Apps with a server/ dir are daemon-only: indexed with requiresHost=true and
// not prebuilt. Run: `bun run build-index` (or `bun scripts/build-catalog.mjs`).
import {
  readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, realpathSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sdkRoot = join(root, '..', 'airglow-sdk');
const SKIP = new Set(['shared', 'scripts', 'node_modules', 'hooks', 'dist']);

// Card media (scripts/compress-media.sh output) is served straight from the
// repo's main branch. Override the base for local testing of unpushed media.
const MEDIA_BASE = process.env.AIRGLOW_CATALOG_MEDIA_BASE
  ?? 'https://raw.githubusercontent.com/airglow-inc/airglow-catalog/main';

// Prebuilt ui.html may be served from the Blob store origin, where relative
// font paths would 404 — point at the fonts uploaded by upload-bundles.mjs.
const FONTS_BASE = 'https://c0buutvb5hrtz9yo.public.blob.vercel-storage.com/apps/_fonts';

if (!existsSync(join(sdkRoot, 'host', 'src', 'main.ts'))) {
  console.error(`airglow-sdk checkout not found at ${sdkRoot} — needed for the bundler`);
  process.exit(1);
}
const { buildSdkCode } = await import(join(sdkRoot, 'sdk', 'airglow-sdk.ts'));
const { composeUiHtml } = await import(join(sdkRoot, 'host', 'src', 'daemon', 'ui-html.ts'));

// Same fresh-subprocess-per-entry rule as validate.mjs (Bun caches negative
// module resolutions per process), going through the host's internal-build so
// loaders/react-dedupe match the daemon exactly.
function bundle(entrypoint, format) {
  const r = Bun.spawnSync(['bun', join(sdkRoot, 'host', 'src', 'main.ts'), 'internal-build'], {
    cwd: root,
    stdin: Buffer.from(JSON.stringify({ entrypoint, format })),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const lines = r.stdout.toString().trim().split('\n');
  let out = null;
  try { out = JSON.parse(lines[lines.length - 1]); } catch {}
  if (!out?.ok) {
    throw new Error(`bundle ${entrypoint} (${format}) failed:\n${(out?.stderr ?? r.stderr.toString()).slice(0, 800)}`);
  }
  return out.code;
}

// Mirrors the daemon's runTailwind (apps.ts): @shared/ alias resolved by
// rewrite, CLI run under bun (BUN_BE_BUN) so no node dependency.
function runTailwind(cssPath) {
  const bin = join(root, 'node_modules', '.bin', 'tailwindcss');
  if (!existsSync(bin)) throw new Error('tailwindcss not installed — run `bun install`');
  let inputPath = cssPath;
  let tempPath = '';
  const css = readFileSync(cssPath, 'utf8');
  if (css.includes('@shared/')) {
    tempPath = join(dirname(cssPath), '.airglow-resolved.css');
    writeFileSync(tempPath, css.replaceAll('@shared/', join(root, 'shared') + '/'));
    inputPath = tempPath;
  }
  try {
    const r = Bun.spawnSync(['bun', realpathSync(bin), '-i', inputPath, '--minify'], {
      cwd: root,
      env: { ...process.env, BUN_BE_BUN: '1' },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (r.exitCode !== 0) throw new Error(`tailwind failed for ${cssPath}:\n${r.stderr.toString().slice(0, 400)}`);
    return r.stdout.toString();
  } finally {
    if (tempPath) rmSync(tempPath, { force: true });
  }
}

function prebuild(appId, dir, m) {
  const outDir = join(root, 'dist', appId);
  rmSync(outDir, { recursive: true, force: true });
  const outputs = new Map(); // key → text, hashed into _hash

  const emit = (key, text) => {
    const path = join(outDir, key);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
    outputs.set(key, text);
  };

  // Userscripts (iife) + startup (esm) — key shape must match the cloud route.
  for (const u of m.userscripts ?? []) {
    emit(`us/${u.file}.iife.js`, bundle(join(dir, u.file), 'iife'));
  }
  if (m.startup) emit(`us/${m.startup}.esm.js`, bundle(join(dir, m.startup), 'esm'));

  // UI page — app's own ui/App.* or the shared default page.
  const uiEntry = ['App.tsx', 'App.ts', 'App.jsx', 'App.js']
    .map((f) => join(dir, 'ui', f)).find(existsSync);
  const entryPath = uiEntry ?? join(root, 'shared', 'default-ui', 'index.tsx');
  const cssPath = uiEntry ? join(dir, 'ui', 'globals.css') : join(root, 'shared', 'default-ui', 'globals.css');
  let css = existsSync(cssPath) ? runTailwind(cssPath) : '';
  if (!css && existsSync(join(root, 'shared', 'theme', 'tokens.css'))) {
    css = readFileSync(join(root, 'shared', 'theme', 'tokens.css'), 'utf8');
  }
  emit('ui.html', composeUiHtml({
    appId,
    sdkCode: buildSdkCode(appId, 'app_ui'),
    appCode: bundle(entryPath, 'iife'),
    css,
    appIdInject: !uiEntry,
    fontsBase: FONTS_BASE,
  }));

  const hash = createHash('md5');
  for (const key of [...outputs.keys()].sort()) hash.update(key).update(outputs.get(key));
  return hash.digest('hex').slice(0, 12);
}

const apps = [];
const built = [];

for (const entry of readdirSync(root, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name.startsWith('.') || SKIP.has(entry.name)) continue;
  const dir = join(root, entry.name);
  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) continue;
  const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (m.visibility === 'hidden') continue;
  const matches = [...new Set(
    (m.userscripts ?? []).flatMap((u) => (Array.isArray(u.matches) ? u.matches : [])),
  )];
  const requiresHost = existsSync(join(dir, 'server')) || (m.serverFunctions?.length > 0);

  // Optional card media, by convention (JSON.stringify drops absent keys).
  const media = {};
  if (existsSync(join(dir, 'media', 'preview.mp4'))) media.video = `${MEDIA_BASE}/${entry.name}/media/preview.mp4`;
  if (existsSync(join(dir, 'media', 'thumbnail.jpg'))) media.thumbnail = `${MEDIA_BASE}/${entry.name}/media/thumbnail.jpg`;

  const app = {
    id: m.id ?? entry.name,
    name: m.name ?? entry.name,
    version: m.version ?? '0.0.0',
    description: m.description ?? '',
    media: Object.keys(media).length ? media : undefined,
    matches,
    requiresHost,
    manifest: null,
  };

  if (!requiresHost) {
    const _hash = prebuild(app.id, dir, m);
    app.manifest = { ...m, _hash, _hasUi: true, _serverFunctions: [] };
    built.push(app.id);
  }

  apps.push(app);
}

apps.sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(join(root, 'catalog.json'), JSON.stringify({ schema: 2, apps }, null, 2) + '\n');
console.log(`catalog.json: ${apps.length} apps (prebuilt: ${built.join(', ') || 'none'})`);
