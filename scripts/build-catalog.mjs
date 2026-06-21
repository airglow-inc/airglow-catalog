// Regenerate catalog.json from each app's manifest.json.
// Run after adding an app or bumping a version: `npm run build-index`.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const apps = [];

for (const name of readdirSync(root, { withFileTypes: true })) {
  if (!name.isDirectory() || name.name.startsWith('.')) continue;
  const manifestPath = join(root, name.name, 'manifest.json');
  if (!existsSync(manifestPath)) continue;
  const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (m.visibility === 'hidden') continue;
  // Union of every userscript's match patterns — the catalog card renders the
  // same site list as the installed gallery from these.
  const matches = [...new Set(
    (m.userscripts ?? []).flatMap((u) => (Array.isArray(u.matches) ? u.matches : [])),
  )];
  apps.push({
    id: m.id ?? name.name,
    name: m.name ?? name.name,
    version: m.version ?? '0.0.0',
    description: m.description ?? '',
    matches,
  });
}

apps.sort((a, b) => a.id.localeCompare(b.id));
const out = { schema: 1, apps };
writeFileSync(join(root, 'catalog.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`catalog.json: ${apps.length} apps`);
