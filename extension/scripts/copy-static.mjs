import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const files = [
  'manifest.json',
  'src/popup/popup.html',
  'src/popup/popup.css',
  'src/options/options.html',
  'src/options/options.css',
];

for (const file of files) {
  const target = join('dist', file);
  mkdirSync(dirname(target), { recursive: true });
  if (existsSync(file)) {
    cpSync(file, target);
  }
}
