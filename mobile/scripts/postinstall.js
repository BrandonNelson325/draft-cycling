/**
 * Patches expo-modules-core/package.json to point "main" at the compiled
 * index.js rather than the TypeScript source. Without this patch the Metro
 * bundler (and EAS cloud builds) cannot resolve the module.
 *
 * This runs automatically after every `npm install` via the "postinstall"
 * script in package.json, so the fix survives fresh installs on EAS.
 */
const fs = require('fs');
const path = require('path');

const pkgPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'expo-modules-core',
  'package.json'
);

if (!fs.existsSync(pkgPath)) {
  console.log('[postinstall] expo-modules-core not found, skipping patch.');
  process.exit(0);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

if (pkg.main === 'index.js') {
  console.log('[postinstall] expo-modules-core already patched, skipping.');
  process.exit(0);
}

pkg.main = 'index.js';
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log('[postinstall] Patched expo-modules-core main: src/index.ts → index.js');
