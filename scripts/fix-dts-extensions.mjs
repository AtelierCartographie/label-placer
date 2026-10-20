// tsc keeps the `.ts` specifiers of the sources in the declarations; consumers
// resolve `.js` to the matching `.d.ts`.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = new URL('../dist/src/', import.meta.url).pathname;
for (const file of readdirSync(dir)) {
  if (!file.endsWith('.d.ts')) continue;
  const path = join(dir, file);
  const source = readFileSync(path, 'utf8');
  writeFileSync(path, source.replace(/(from\s+['"]\.{1,2}\/[^'"]+)\.ts(['"])/g, '$1.js$2'));
}
