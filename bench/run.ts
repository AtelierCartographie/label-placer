// Benchmark on French communes with proportional symbols, on an A4 landscape page.
// Usage: node bench/run.ts [--svg]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { placeLabels } from '../src/index.ts';
import type { Box, LabelInput, PlaceOptions, PlacementResult } from '../src/index.ts';

type Row = [name: string, region: string, births: number, x: number, y: number];
const rows: Row[] = JSON.parse(gunzipSync(readFileSync(new URL('./data/communes-2018.json.gz', import.meta.url))).toString('utf8'));

const PAGE = { width: 1043, height: 714 };
const FONT = 9;
const MAX_RADIUS = 20;
const LEGEND: Box = [10, PAGE.height - 170, 190, PAGE.height - 10];

// Helvetica advance widths approximated by character class, in em.
function textWidth(text: string): number {
  let em = 0;
  for (const ch of text) {
    if (ch === ' ') em += 0.278;
    else if ("-'’.,:;!|".includes(ch)) em += 0.25;
    else if ('ilIjtf'.includes(ch)) em += 0.26;
    else if ('mwMW'.includes(ch)) em += 0.85;
    else if (ch !== ch.toLowerCase()) em += 0.68;
    else em += 0.53;
  }
  return em * FONT + 2;
}

interface Scenario {
  name: string;
  rows: Row[];
  labels: LabelInput[];
}

/** Only the `labelled` largest communes have a label; the others are symbols alone. */
function scenario(name: string, keep: (r: Row) => boolean, leaderTop = Infinity, labelled = Infinity): Scenario {
  const subset = rows.filter(keep);
  const xs = subset.map((r) => r[3]);
  const ys = subset.map((r) => r[4]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = Math.min((PAGE.width - 20) / (x1 - x0), (PAGE.height - 20) / (y1 - y0));
  const vmax = Math.max(...subset.map((r) => r[2]));
  const rank = new Map(subset.map((r, i) => [i, r[2]] as const).sort((a, b) => b[1] - a[1]).map(([i], r) => [i, r]));
  const labels = subset.map((r, i): LabelInput => ({
    id: i,
    x: PAGE.width / 2 + (r[3] - (x0 + x1) / 2) * k,
    y: PAGE.height / 2 - (r[4] - (y0 + y1) / 2) * k,
    width: rank.get(i)! < labelled ? textWidth(r[0]) : 0,
    height: rank.get(i)! < labelled ? FONT * 1.2 + 1 : 0,
    symbol: r[2] > 0 ? { type: 'circle', radius: MAX_RADIUS * Math.sqrt(r[2] / vmax) } : undefined,
    priority: r[2],
    leader: rank.get(i)! < leaderTop
  }));
  return { name, rows: subset, labels };
}

/** Distance from a box to a label's symbol, or to its anchor without one. */
function symbolDistance(l: LabelInput, [x0, y0, x1, y1]: Box): number {
  const d = Math.hypot(Math.max(0, x0 - l.x, l.x - x1), Math.max(0, y0 - l.y, l.y - y1));
  return l.symbol?.type === 'circle' ? Math.max(0, d - l.symbol.radius) : d;
}

/** Labels next to their symbol with another symbol, not under the label, at least as close. */
function ambiguous(s: Scenario, r: PlacementResult): number {
  const size = 40;
  const cells = new Map<string, number[]>();
  s.labels.forEach((l, i) => {
    const key = `${Math.floor(l.x / size)},${Math.floor(l.y / size)}`;
    cells.set(key, [...(cells.get(key) ?? []), i]);
  });
  let count = 0;
  for (const p of r.labels) {
    if (!p.visible || p.leader || p.placement === 'inside') continue;
    const own = symbolDistance(s.labels[p.index], p.box!);
    const [cx, cy] = [Math.floor(((p.box![0] + p.box![2]) / 2) / size), Math.floor(((p.box![1] + p.box![3]) / 2) / size)];
    let found = false;
    for (let dx = -2; dx <= 2 && !found; dx++)
      for (let dy = -2; dy <= 2 && !found; dy++)
        for (const k of cells.get(`${cx + dx},${cy + dy}`) ?? []) {
          const o = s.labels[k];
          const covered = o.x > p.box![0] && o.x < p.box![2] && o.y > p.box![1] && o.y < p.box![3];
          if (k !== p.index && !covered && symbolDistance(o, p.box!) <= own) found = true;
        }
    if (found) count++;
  }
  return count;
}

function quality(s: Scenario, r: PlacementResult) {
  const byPriority = s.labels.map((_, i) => i).sort((a, b) => (s.labels[b].priority ?? 0) - (s.labels[a].priority ?? 0));
  const top = (k: number) => +((100 * byPriority.slice(0, k).filter((i) => r.labels[i].visible).length) / Math.min(k, s.labels.length)).toFixed(1);
  return {
    placed: r.stats.placed,
    top100: top(100),
    top1000: top(1000),
    leaders: r.labels.filter((l) => l.leader).length,
    ambiguous: ambiguous(s, r),
    inside: r.labels.filter((l) => l.placement === 'inside').length
  };
}

function svg(s: Scenario, r: PlacementResult): string {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE.width}" height="${PAGE.height}" font-family="Helvetica, Arial" font-size="${FONT}">`,
    `<rect width="100%" height="100%" fill="#fff"/>`,
    `<rect x="${LEGEND[0]}" y="${LEGEND[1]}" width="${LEGEND[2] - LEGEND[0]}" height="${LEGEND[3] - LEGEND[1]}" fill="#eee" stroke="#999"/>`
  ];
  const bySize = s.labels.map((_, i) => i).sort((a, b) => (s.labels[b].priority ?? 0) - (s.labels[a].priority ?? 0));
  for (const i of bySize) {
    const l = s.labels[i];
    if (l.symbol?.type === 'circle')
      out.push(`<circle cx="${l.x.toFixed(1)}" cy="${l.y.toFixed(1)}" r="${l.symbol.radius.toFixed(2)}" fill="#e8a33d" fill-opacity=".75" stroke="#fff" stroke-width=".4"/>`);
  }
  const baseline = { top: 'text-before-edge', middle: 'central', bottom: 'text-after-edge' } as const;
  for (const p of r.labels) {
    if (!p.visible) continue;
    if (p.leader) out.push(`<polyline points="${p.leader.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}" fill="none" stroke="#333" stroke-width=".6"/>`);
    out.push(
      `<text x="${(p.x + (p.textAnchor === 'start' ? 1 : p.textAnchor === 'end' ? -1 : 0)).toFixed(1)}" y="${p.y.toFixed(1)}" text-anchor="${p.textAnchor}" dominant-baseline="${baseline[p.baseline]}" stroke="#fff" stroke-width="2" paint-order="stroke">${esc(s.rows[p.index][0])}</text>`
    );
  }
  out.push('</svg>');
  return out.join('\n');
}

const writeSvg = process.argv.includes('--svg');
if (writeSvg) mkdirSync(new URL('./out/', import.meta.url), { recursive: true });

const scenarios = [
  scenario('Bretagne (1,202)', (r) => r[1] === '53', 300),
  scenario('Bretagne, 100 labels (1,202)', (r) => r[1] === '53', 300, 100),
  scenario('Grand Est + BFC + IdF (10,066)', (r) => ['44', '27', '11'].includes(r[1]), 1000),
  scenario('France (34,734)', () => true, 1000)
];
const options: PlaceOptions = { bounds: [0, 0, PAGE.width, PAGE.height], obstacles: [{ type: 'rect', box: LEGEND }] };
const variants: [string, Partial<PlaceOptions>][] = [
  ['greedy', { optimize: 'none' }],
  ['chain (default budget)', {}],
  ['chain (budget 5.6M)', { budget: { work: 5_600_000 } }]
];

const table: Record<string, unknown>[] = [];
for (const s of scenarios) {
  placeLabels(s.labels, options); // JIT warm-up
  for (const [name, extra] of variants) {
    const t0 = performance.now();
    const r = placeLabels(s.labels, { ...options, ...extra });
    const ms = performance.now() - t0;
    const t = r.stats.timings;
    table.push({
      scenario: s.name,
      variant: name,
      'total ms': +ms.toFixed(1),
      'setup ms': +t.setup.toFixed(1),
      'greedy ms': +t.greedy.toFixed(1),
      'optimize ms': +t.optimize.toFixed(1),
      work: r.stats.work,
      ...quality(s, r)
    });
    if (writeSvg) {
      const file = `${s.name.split(' ')[0].toLowerCase()}-${name.split(' ')[0]}.svg`;
      writeFileSync(new URL(`./out/${file}`, import.meta.url), svg(s, r));
    }
  }
}
console.table(table);
