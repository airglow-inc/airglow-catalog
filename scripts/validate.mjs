// Validate every catalog app is self-sufficient — run under Bun:
//   bun scripts/validate.mjs            (validate all)
//   bun scripts/validate.mjs <app-id>   (validate one)
//
// Wired as a pre-commit hook (hooks/pre-commit). For each app it checks:
//   1. manifest.json is valid, id matches the dir, has name + version
//   2. declared deps install (bun install in the app dir)
//   3. ui/App.tsx + every userscript bundle clean (compile errors + missing
//      libraries surface here — same Bun.build the daemon uses, same @shared alias)
// Exits non-zero with a per-app report on any failure.

import { readdirSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const only = process.argv[2];
const SKIP = new Set(['shared', 'scripts', 'node_modules']);
const errors = [];
const validated = [];

// Install the workspace baseline (react, react-dom, tailwindcss, lucide-react)
// at the repo root so apps resolve it exactly as they do from the installed
// ~/.airglow workspace root. App-specific extras install per-app below.
const rootInstall = Bun.spawnSync(['bun', 'install'], { cwd: root, stderr: 'pipe' });
if (rootInstall.exitCode !== 0) {
  console.error(`✗ root bun install failed:\n${rootInstall.stderr.toString().slice(0, 500)}`);
  process.exit(1);
}

// Warn (never fail) when the vendored SDK surface (shared/ + airglow.d.ts) has
// drifted from the canonical airglow-sdk/host/seed. The catalog is also cloned
// standalone, where the SDK isn't a sibling — then there's nothing to compare,
// so this is skipped. Refresh with `npm run sync-sdk`.
function listFilesRel(dir, base = dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const abs = join(dir, e.name);
    if (e.isDirectory()) out.push(...listFilesRel(abs, base));
    else out.push(abs.slice(base.length + 1));
  }
  return out;
}

function checkSdkFreshness() {
  const seed = join(root, '..', 'airglow-sdk', 'host', 'seed');
  if (!existsSync(seed)) return; // standalone clone — no sibling SDK to compare
  const drift = [];
  const dtsCat = join(root, 'airglow.d.ts');
  if (!existsSync(dtsCat) || readFileSync(join(seed, 'airglow.d.ts')).compare(readFileSync(dtsCat)) !== 0) {
    drift.push('airglow.d.ts');
  }
  const seedShared = join(seed, 'shared');
  const catShared = join(root, 'shared');
  const seedFiles = new Set(existsSync(seedShared) ? listFilesRel(seedShared) : []);
  const catFiles = new Set(existsSync(catShared) ? listFilesRel(catShared) : []);
  for (const rel of seedFiles) {
    if (!catFiles.has(rel)) drift.push(`shared/${rel} (missing)`);
    else if (readFileSync(join(seedShared, rel)).compare(readFileSync(join(catShared, rel))) !== 0) drift.push(`shared/${rel}`);
  }
  for (const rel of catFiles) if (!seedFiles.has(rel)) drift.push(`shared/${rel} (stale — not in SDK)`);
  if (drift.length) {
    console.warn(`\n⚠ vendored SDK surface differs from airglow-sdk/host/seed (${drift.length} file(s)):`);
    for (const d of drift.slice(0, 12)) console.warn(`    ${d}`);
    if (drift.length > 12) console.warn(`    … and ${drift.length - 12} more`);
    console.warn('  Run `npm run sync-sdk` to refresh.\n');
  }
}
checkSdkFreshness();

// Bundle in a FRESH `bun build` subprocess per file. Bun caches (negative)
// module resolutions per process, so bundling many entries in one process would
// poison resolution — the daemon spawns a subprocess per build for the same
// reason. Returns null on success, or the error output.
function bundle(entry) {
  const out = join(tmpdir(), `airglow-validate-${process.pid}`);
  const r = Bun.spawnSync(['bun', 'build', entry, '--target', 'browser', '--outdir', out], { stderr: 'pipe', stdout: 'pipe' });
  rmSync(out, { recursive: true, force: true });
  const err = r.stderr.toString();
  if (r.exitCode !== 0 || /error:|could not resolve/i.test(err)) {
    return err.replace(/\s+/g, ' ').trim().slice(0, 400) || `exit ${r.exitCode}`;
  }
  return null;
}

for (const entry of readdirSync(root, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name.startsWith('.') || SKIP.has(entry.name)) continue;
  if (only && entry.name !== only) continue;
  const dir = join(root, entry.name);
  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) continue;
  validated.push(entry.name);

  // 1. manifest sanity
  let m;
  try { m = JSON.parse(readFileSync(manifestPath, 'utf8')); }
  catch { errors.push(`${entry.name}: manifest.json is not valid JSON`); continue; }
  if (m.id !== entry.name) errors.push(`${entry.name}: manifest id "${m.id}" != directory name`);
  if (!m.name) errors.push(`${entry.name}: manifest missing "name"`);
  if (!m.version) errors.push(`${entry.name}: manifest missing "version"`);

  // 2. install declared deps so genuine "missing library" errors are real
  if (existsSync(join(dir, 'package.json'))) {
    const inst = Bun.spawnSync(['bun', 'install'], { cwd: dir, stderr: 'pipe' });
    if (inst.exitCode !== 0) {
      errors.push(`${entry.name}: bun install failed — ${inst.stderr.toString().slice(0, 300)}`);
      continue; // bundling will only produce noise if deps didn't install
    }
  }

  // 3. bundle UI + userscripts
  for (const f of ['App.tsx', 'App.ts', 'App.jsx', 'App.js']) {
    const p = join(dir, 'ui', f);
    if (existsSync(p)) { const e = await bundle(p); if (e) errors.push(`${entry.name}: ui/${f} — ${e}`); break; }
  }
  for (const us of m.userscripts ?? []) {
    if (!us?.file) continue;
    const p = join(dir, us.file);
    if (existsSync(p)) { const e = await bundle(p); if (e) errors.push(`${entry.name}: ${us.file} — ${e}`); }
    else errors.push(`${entry.name}: userscript file ${us.file} does not exist`);
  }
  if (m.startup) {
    const p = join(dir, m.startup);
    if (existsSync(p)) { const e = await bundle(p); if (e) errors.push(`${entry.name}: ${m.startup} — ${e}`); }
    else errors.push(`${entry.name}: startup file ${m.startup} does not exist`);
  }
}

if (errors.length) {
  console.error(`\n✗ Catalog validation FAILED (${errors.length} issue${errors.length > 1 ? 's' : ''}):\n`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error('');
  process.exit(1);
}
console.log(`✓ Catalog validation passed — ${validated.length} app${validated.length === 1 ? '' : 's'}: ${validated.join(', ')}`);
