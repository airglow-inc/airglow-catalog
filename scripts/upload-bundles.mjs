// Upload prebuilt dist/ bundles to the public Blob store the cloud redirects
// to: apps/<id>/<version>/<key>. Version paths are immutable-by-convention —
// republishing a version overwrites it, so bump manifest.version per release.
// Also uploads the shared fonts (referenced by every prebuilt ui.html) to
// apps/_fonts/. Needs BLOB_READ_WRITE_TOKEN for store store_C0BUuTvB5HRtZ9Yo.
// Run after build-index: `BLOB_READ_WRITE_TOKEN=... bun scripts/upload-bundles.mjs`.
import { put } from '@vercel/blob';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('BLOB_READ_WRITE_TOKEN not set');
  process.exit(1);
}

const TYPES = { '.js': 'text/javascript', '.html': 'text/html; charset=utf-8', '.woff2': 'font/woff2' };
const contentType = (p) => TYPES[p.slice(p.lastIndexOf('.'))] ?? 'application/octet-stream';

async function upload(pathname, filePath) {
  await put(pathname, readFileSync(filePath), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: contentType(filePath),
  });
  console.log(`  ${pathname}`);
}

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const catalog = JSON.parse(readFileSync(join(root, 'catalog.json'), 'utf8'));
for (const app of catalog.apps) {
  if (!app.manifest) continue; // requiresHost — not cloud-served
  const distDir = join(root, 'dist', app.id);
  if (!existsSync(distDir)) {
    console.error(`${app.id}: no dist/ output — run build-index first`);
    process.exit(1);
  }
  console.log(`${app.id}@${app.version}:`);
  for (const file of walk(distDir)) {
    await upload(`apps/${app.id}/${app.version}/${relative(distDir, file)}`, file);
  }
}

// Fonts referenced by ui.html's @font-face (see FONTS_BASE in build-catalog.mjs).
const fontsDir = join(root, '..', 'airglow-sdk', 'extension', 'public', 'fonts');
if (existsSync(fontsDir)) {
  console.log('fonts:');
  for (const f of readdirSync(fontsDir).filter((f) => f.endsWith('.woff2'))) {
    await upload(`apps/_fonts/${f}`, join(fontsDir, f));
  }
}
console.log('done');
