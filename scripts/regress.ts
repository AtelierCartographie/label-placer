// Draw what a change to the engine moved: for each reference scene of the regression test whose
// placements differ from its snapshot (test/__snapshots__/placements/), an SVG of the labels that
// moved, appeared or went, in bench/out/regress/, with an index.html. Accept the changes with
// `pnpm test -u`. Usage: node scripts/regress.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { placeLabels } from '../src/index.ts';
import type { Box, PlacementResult } from '../src/index.ts';
import { placementText } from '../test/placements.ts';
import { referenceScenes, type NamedScene } from '../test/scenes.ts';

const root = new URL('..', import.meta.url).pathname;
const out = root + 'bench/out/regress/';
mkdirSync(out, { recursive: true });

interface Entry {
  key: string;
  center: [number, number] | null;
  layout: number;
}

/** Labels of a snapshot by index: their placement key and the center of their box. */
function parse(text: string): Map<string, Entry> {
  const map = new Map<string, Entry>();
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const [head, rest] = line.split(' | ');
    const index = head.startsWith('group ') ? head : head.split(' ')[0];
    const m = /^(\S+):(\d+):(\d+) (-?[\d.]+),(-?[\d.]+)/.exec(rest);
    map.set(index, { key: rest, center: m ? [+m[4], +m[5]] : null, layout: m ? +m[3] : 0 });
  }
  return map;
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const f1 = (v: number) => v.toFixed(1);

function boxOf(scene: NamedScene, i: number, e: Entry): Box | null {
  if (!e.center) return null;
  const l = scene.labels[i];
  const [w, h] = e.layout ? [l.layouts![e.layout - 1].width, l.layouts![e.layout - 1].height] : [l.width, l.height];
  return [e.center[0] - w / 2, e.center[1] - h / 2, e.center[0] + w / 2, e.center[1] + h / 2];
}

function draw(scene: NamedScene, result: PlacementResult, before: Map<string, Entry>, after: Map<string, Entry>): { svg: string; moved: number; shown: number; gone: number } {
  const [x0, y0, x1, y1] = scene.options.bounds;
  const s: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${x1 - x0}" height="${y1 - y0}" viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}" font-family="Helvetica, Arial" font-size="9">`, `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="#fff"/>`];
  for (const o of scene.options.obstacles ?? []) {
    const fill = o.soft ? '#eef2f5' : '#dde3e8';
    if (o.type === 'rect') s.push(`<rect x="${f1(o.box[0])}" y="${f1(o.box[1])}" width="${f1(o.box[2] - o.box[0])}" height="${f1(o.box[3] - o.box[1])}" fill="${fill}"/>`);
    else if (o.type === 'circle') s.push(`<circle cx="${f1(o.x)}" cy="${f1(o.y)}" r="${f1(o.radius)}" fill="${fill}"/>`);
    else if (o.type === 'polygon') s.push(`<path d="${o.rings.map((r) => 'M' + r.map((p) => p.map(f1).join(',')).join('L') + 'Z').join('')}" fill="${fill}" fill-rule="evenodd"/>`);
    else s.push(`<polyline points="${o.points.map((p) => p.map(f1).join(',')).join(' ')}" fill="none" stroke="#9aa7b2" stroke-width=".6"/>`);
  }
  for (const l of scene.labels) {
    const sym = l.symbol;
    if (sym?.type === 'circle') s.push(`<circle cx="${f1(l.x)}" cy="${f1(l.y)}" r="${Math.max(0.5, sym.radius).toFixed(2)}" fill="#e8a33d" fill-opacity=".6"/>`);
    else if (sym?.type === 'rect') s.push(`<rect x="${f1(l.x - sym.width / 2)}" y="${f1(l.y - sym.height / 2)}" width="${f1(sym.width)}" height="${f1(sym.height)}" fill="#e8a33d" fill-opacity=".6"/>`);
    else if (sym?.type === 'polygon') s.push(`<path d="${sym.rings.map((r) => 'M' + r.map((p) => p.map(f1).join(',')).join('L') + 'Z').join('')}" fill="none" stroke="#c9d2da" stroke-width=".6"/>`);
  }
  const baseline = { top: 'text-before-edge', middle: 'central', bottom: 'text-after-edge' } as const;
  let moved = 0;
  let shown = 0;
  let gone = 0;
  const rect = (b: Box, style: string) => s.push(`<rect x="${f1(b[0])}" y="${f1(b[1])}" width="${f1(b[2] - b[0])}" height="${f1(b[3] - b[1])}" ${style}/>`);
  for (const p of result.labels) {
    const i = p.index;
    const was = before.get(String(i));
    const now = after.get(String(i));
    const changed = !!was && !!now && was.key !== now.key;
    if (p.visible) {
      if (p.leader) s.push(`<polyline points="${p.leader.map((q) => q.map(f1).join(',')).join(' ')}" fill="none" stroke="${changed ? '#1a7f37' : '#8a949e'}" stroke-width=".6"/>`);
      s.push(`<text x="${f1(p.x)}" y="${f1(p.y)}" text-anchor="${p.textAnchor}" dominant-baseline="${baseline[p.baseline]}" fill="${changed ? '#1a7f37' : '#4b5967'}">${esc(scene.names[i])}</text>`);
    }
    if (!changed) continue;
    const old = boxOf(scene, i, was!);
    if (old && p.visible) {
      moved++;
      rect(old, 'fill="none" stroke="#cf222e" stroke-dasharray="2 2" stroke-width=".8"');
      rect(p.box!, 'fill="none" stroke="#1a7f37" stroke-width=".8"');
      s.push(`<line x1="${f1((old[0] + old[2]) / 2)}" y1="${f1((old[1] + old[3]) / 2)}" x2="${f1((p.box![0] + p.box![2]) / 2)}" y2="${f1((p.box![1] + p.box![3]) / 2)}" stroke="#cf222e" stroke-width=".5"/>`);
    } else if (p.visible) {
      shown++;
      rect(p.box!, 'fill="#1a7f37" fill-opacity=".12" stroke="#1a7f37" stroke-width=".8"');
    } else if (old) {
      gone++;
      rect(old, 'fill="#cf222e" fill-opacity=".1" stroke="#cf222e" stroke-dasharray="2 2" stroke-width=".8"');
      const l = scene.labels[i];
      s.push(`<path d="M${f1(l.x - 4)},${f1(l.y - 4)}L${f1(l.x + 4)},${f1(l.y + 4)}M${f1(l.x - 4)},${f1(l.y + 4)}L${f1(l.x + 4)},${f1(l.y - 4)}" stroke="#cf222e" stroke-width="1.2"/>`);
      s.push(`<text x="${f1(old[0])}" y="${f1(old[1] - 1)}" fill="#cf222e">${esc(scene.names[i])}</text>`);
    }
  }
  s.push('</svg>');
  return { svg: s.join('\n'), moved, shown, gone };
}

const rows: string[] = [];
let changedScenes = 0;
for (const scene of referenceScenes()) {
  const file = root + `test/__snapshots__/placements/${scene.id}.txt`;
  if (!existsSync(file)) {
    rows.push(`<tr><td>${esc(scene.title)}</td><td colspan="4">no snapshot yet: run pnpm test -u</td></tr>`);
    continue;
  }
  const result = placeLabels(scene.labels, scene.options);
  const before = parse(readFileSync(file, 'utf8'));
  const after = parse(placementText(scene, result));
  const groupsChanged = [...after].filter(([k, v]) => k.startsWith('group ') && before.get(k)?.key !== v.key).length;
  const { svg, moved, shown, gone } = draw(scene, result, before, after);
  const total = moved + shown + gone + groupsChanged;
  if (total) {
    changedScenes++;
    writeFileSync(out + `${scene.id}.svg`, svg);
  }
  rows.push(
    `<tr><td>${total ? `<a href="${scene.id}.svg">${esc(scene.title)}</a>` : esc(scene.title)}</td><td>${moved}</td><td>${shown}</td><td>${gone}</td><td>${groupsChanged}</td></tr>`
  );
  console.log(`${scene.title}: ${total ? `${moved} moved, ${shown} shown, ${gone} gone${groupsChanged ? `, ${groupsChanged} groups changed` : ''}` : 'unchanged'}`);
}
writeFileSync(
  out + 'index.html',
  `<!doctype html><meta charset="utf-8"><title>Placements changed</title><style>body{font:14px system-ui;margin:2rem}td,th{padding:.2rem .8rem;text-align:left}td+td{text-align:right}</style>
<h1>Placements changed against the snapshots</h1>
<p>Red, dashed: where a label was; green: where it is now; a red cross: a label gone. Accept the changes with <code>pnpm test -u</code>.</p>
<table><tr><th>Scene</th><th>Moved</th><th>Shown</th><th>Gone</th><th>Groups</th></tr>${rows.join('')}</table>`
);
console.log(changedScenes ? `bench/out/regress/index.html: ${changedScenes} scenes changed` : 'No placement changed.');
