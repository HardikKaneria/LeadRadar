import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Clean dist
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });

// Bundle entry points — each produces a single self-contained JS file (no imports at runtime)
const entryPoints = [
  { in: 'src/background/service-worker.ts', out: 'dist/background/service-worker' },
  { in: 'src/popup/popup.ts',               out: 'dist/popup/popup' },
  { in: 'src/content/capture.ts',           out: 'dist/content/capture' },
  { in: 'src/content/auth-bridge.ts',       out: 'dist/content/auth-bridge' },
  { in: 'src/options/options.ts',           out: 'dist/options/options' },
];

for (const { in: entryIn, out: entryOut } of entryPoints) {
  mkdirSync(dirname(entryOut), { recursive: true });
  await build({
    entryPoints: [entryIn],
    outfile: `${entryOut}.js`,
    bundle: true,
    platform: 'browser',
    target: 'chrome120',
    format: 'iife',      // single file, no imports — works in all MV3 contexts
    sourcemap: true,
    treeShaking: true,
  });
}

// Copy static assets (HTML, CSS, manifest)
const statics = [
  ['manifest.json',            'dist/manifest.json'],
  ['src/popup/popup.html',     'dist/popup/popup.html'],
  ['src/popup/popup.css',      'dist/popup/popup.css'],
  ['src/options/options.html', 'dist/options/options.html'],
  ['src/options/options.css',  'dist/options/options.css'],
];

for (const [src, dest] of statics) {
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest);
}

console.log('✅ Extension built to dist/');
