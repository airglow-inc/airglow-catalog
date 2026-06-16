// Vendor the canonical SDK surface (shared/ + airglow.d.ts) from airglow-sdk's
// host/seed/ into this catalog, so catalog apps bundle and validate standalone.
//
// The catalog is a public repo cloned on its own; these vendored copies let it
// build without airglow-sdk present. When airglow-sdk IS a sibling checkout,
// run this (maintainer-only) after the SDK surface changes to refresh them:
//
//   npm run sync-sdk
//
// It mirrors host/seed/shared/ exactly (a clean replace, so files deleted
// upstream — e.g. the old shared/lib/ — disappear here too) and copies
// airglow.d.ts. validate.mjs warns when these copies drift from the sibling SDK.

import { existsSync, rmSync, cpSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const seed = join(root, '..', 'airglow-sdk', 'host', 'seed');

if (!existsSync(seed)) {
  console.error(`✗ canonical seed not found at ${seed}`);
  console.error('  This script needs airglow-sdk checked out as a sibling repo.');
  process.exit(1);
}

// shared/ — clean replace: drop the vendored copy entirely, then mirror the
// seed, so files removed upstream don't linger here.
rmSync(join(root, 'shared'), { recursive: true, force: true });
cpSync(join(seed, 'shared'), join(root, 'shared'), { recursive: true });

// airglow.d.ts — single file.
copyFileSync(join(seed, 'airglow.d.ts'), join(root, 'airglow.d.ts'));

console.log('✓ synced shared/ + airglow.d.ts from airglow-sdk/host/seed/');
