// Rebuild the engine embedded in the demo pages, which open from the file system without a server:
// docs/comment-ca-marche.html (the line holding `var LabelPlacer=`) and docs/exemple-plot.html
// (the line holding `var LabelPlacerPlot=`). Usage: node scripts/build-docs.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { build } from 'vite';

const root = new URL('..', import.meta.url).pathname;
const pages: [entry: string, name: string, page: string][] = [
  ['scripts/docs-entry.ts', 'LabelPlacer', 'docs/comment-ca-marche.html'],
  ['src/plot.ts', 'LabelPlacerPlot', 'docs/exemple-plot.html']
];

for (const [entry, name, page] of pages) {
  const out = await build({
    root,
    configFile: false,
    logLevel: 'warn',
    build: { write: false, minify: 'esbuild', lib: { entry: root + entry, name, formats: ['iife'], fileName: () => 'bundle.js' } }
  });
  const code = (Array.isArray(out) ? out[0] : out).output[0].code.trim();
  if (code.includes('\n')) throw new Error(`${name}: the bundle must hold on one line`);
  const marker = `var ${name}=`;
  const lines = readFileSync(root + page, 'utf8').split('\n');
  const at = lines.flatMap((l, i) => (l.includes(marker) ? [i] : []));
  if (at.length !== 1) throw new Error(`${page}: expected one line holding ${marker}, found ${at.length}`);
  lines[at[0]] = code;
  writeFileSync(root + page, lines.join('\n'));
  console.log(`${page}: ${name}, ${code.length} bytes`);
}
