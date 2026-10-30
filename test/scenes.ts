import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import type { Box, GroupInput, LabelInput, Obstacle, PlaceOptions, Point } from '../src/index.ts';

/**
 * Scenes shared by the tests: random ones mixing every feature, for the properties, and the
 * reference scenes of the regression test, built from the benchmark data, whose placements are
 * kept in `test/__snapshots__/placements/`.
 */

export function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Scene {
  labels: LabelInput[];
  options: PlaceOptions;
}

/** A random scene: clustered symbols of every kind, every mode, obstacles of every kind, and options. */
export function randomScene(seed: number): Scene {
  const rnd = mulberry32(seed);
  const pick = <T>(items: T[]): T => items[Math.floor(rnd() * items.length)];
  const chance = (p: number) => rnd() < p;
  const W = 400 + Math.round(rnd() * 400);
  const H = 300 + Math.round(rnd() * 300);
  const unit = 8 + Math.round(rnd() * 6);
  const n = 20 + Math.floor(rnd() * 130);
  const centers = Array.from({ length: 1 + Math.floor(rnd() * 5) }, (): Point => [W * (0.1 + 0.8 * rnd()), H * (0.1 + 0.8 * rnd())]);
  const spread = 40 + rnd() * 200;

  const polygon = (cx: number, cy: number, r: number): Point[] => {
    const k = 3 + Math.floor(rnd() * 5);
    return Array.from({ length: k }, (_, j): Point => {
      const a = (2 * Math.PI * j) / k + rnd() * 0.5;
      const d = r * (0.6 + 0.4 * rnd());
      return [cx + d * Math.cos(a), cy + d * Math.sin(a)];
    });
  };

  const labels: LabelInput[] = Array.from({ length: n }, (_, i) => {
    const [cx, cy] = pick(centers);
    const x = Math.min(W - 2, Math.max(2, cx + (rnd() - 0.5) * spread));
    const y = Math.min(H - 2, Math.max(2, cy + (rnd() - 0.5) * spread * 0.7));
    const l: LabelInput = { id: i, x, y, width: unit * (1.5 + rnd() * 6), height: unit, priority: Math.round(rnd() * 1000) };
    const kind = rnd();
    if (kind < 0.6) l.symbol = { type: 'circle', radius: rnd() < 0.3 ? 0.5 + rnd() : 1 + rnd() * 12 };
    else if (kind < 0.7) l.symbol = { type: 'rect', width: 2 + rnd() * 14, height: 2 + rnd() * 14 };
    else if (kind < 0.78) l.symbol = { type: 'area', inscribedRadius: rnd() * 40 };
    else if (kind < 0.86) l.symbol = { type: 'polygon', rings: [polygon(x, y, 10 + rnd() * 50)] };
    // The rest: a bare anchor.
    const mode = rnd();
    if (mode < 0.12) l.mode = 'required';
    else if (mode < 0.16) {
      l.mode = 'pinned';
      l.offset = [(rnd() - 0.5) * 4 * unit, (rnd() - 0.5) * 4 * unit];
    } else if (mode < 0.19) l.callout = pick([true, 'left', 'right', 'top', 'bottom'] as const);
    else if (mode < 0.22) l.dodge = pick(['left', 'right'] as const);
    if (chance(0.2)) l.leader = false;
    if (chance(0.2)) l.layouts = [{ width: l.width * 0.55, height: unit * 2 }, ...(chance(0.5) ? [{ width: unit * 2, height: unit, cost: 10 }] : [])];
    // A symbol alone.
    if (chance(0.08)) {
      l.width = 0;
      l.height = 0;
    }
    return l;
  });

  const obstacles: Obstacle[] = [];
  for (let k = Math.floor(rnd() * 4); k > 0; k--) {
    const x = rnd() * W;
    const y = rnd() * H;
    obstacles.push({ type: 'rect', box: [x, y, x + 20 + rnd() * 120, y + 10 + rnd() * 60], soft: chance(0.3) });
  }
  if (chance(0.4)) obstacles.push({ type: 'circle', x: rnd() * W, y: rnd() * H, radius: 5 + rnd() * 40, soft: chance(0.3) });
  if (chance(0.4)) obstacles.push({ type: 'line', points: Array.from({ length: 5 }, (_, j): Point => [(W * j) / 4, H * rnd()]), soft: chance(0.6) });
  if (chance(0.4)) {
    // Land: a soft polygon and its coastline.
    const land = polygon(W / 2, H / 2, Math.min(W, H) * 0.45);
    obstacles.push({ type: 'polygon', rings: [land], soft: true, cost: 2.5 }, { type: 'line', points: [...land, land[0]], soft: true });
  }
  if (chance(0.3)) obstacles.push({ type: 'polygon', rings: [polygon(rnd() * W, rnd() * H, 20 + rnd() * 50)] });

  const groups: GroupInput[] = [];
  if (chance(0.3)) {
    const [cx, cy] = centers[0];
    const members = labels.map((_, i) => i).filter((i) => Math.hypot(labels[i].x - cx, labels[i].y - cy) < spread / 4).slice(0, 8);
    if (members.length > 1) groups.push({ id: 'g', members, width: unit * 8, height: unit * 2, mode: chance(0.5) ? 'always' : 'auto' });
  }

  const options: PlaceOptions = {
    bounds: [0, 0, W, H],
    obstacles,
    spacing: chance(0.5) ? 0 : rnd() * unit * 0.8,
    leader: chance(0.15) ? false : { style: pick(['octilinear', 'orthogonal', 'straight'] as const) },
    align: chance(0.35) ? 'columns' : 'none',
    optimize: chance(0.15) ? 'none' : 'chain',
    groups
  };
  return { labels, options };
}


/** A reference scene, with the names to write in its snapshot and its report. */
export interface NamedScene extends Scene {
  id: string;
  title: string;
  names: string[];
}

type Row = [name: string, region: string, births: number, x: number, y: number];
const data = (file: string) => gunzipSync(readFileSync(new URL(`../bench/data/${file}`, import.meta.url))).toString('utf8');
let communes: Row[] | null = null;

const PAGE: Box = [0, 0, 1043, 714];
const LEGEND: Box = [10, 544, 190, 704];
const FONT = 9;

/** Helvetica advance widths by character class, as in the benchmark. */
function textWidth(text: string, size = FONT): number {
  let em = 0;
  for (const ch of text) {
    if (ch === ' ') em += 0.278;
    else if ("-'’.,:;!|".includes(ch)) em += 0.25;
    else if ('ilIjtf'.includes(ch)) em += 0.26;
    else if ('mwMW'.includes(ch)) em += 0.85;
    else if (ch !== ch.toLowerCase()) em += 0.68;
    else em += 0.53;
  }
  return em * size + 2;
}

/** Fit points in Lambert-93 to the A4 page, y down. */
function fit(points: Point[]): (p: Point) => Point {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = Math.min((PAGE[2] - 20) / (x1 - x0), (PAGE[3] - 20) / (y1 - y0));
  return ([x, y]) => [PAGE[2] / 2 + (x - (x0 + x1) / 2) * k, PAGE[3] / 2 - (y - (y0 + y1) / 2) * k];
}

/** Communes of some regions as proportional circles, the `labelled` largest named. */
function communeScene(id: string, title: string, regions: string[], labelled: number, options: Partial<PlaceOptions> = {}): NamedScene {
  communes ??= JSON.parse(data('communes-2018.json.gz')) as Row[];
  const subset = communes.filter((r) => regions.includes(r[1]));
  const to = fit(subset.map((r) => [r[3], r[4]]));
  const vmax = Math.max(...subset.map((r) => r[2]));
  const rank = new Map(subset.map((r, i) => [i, r[2]] as const).sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([i], k) => [i, k]));
  const labels = subset.map((r, i): LabelInput => {
    const [x, y] = to([r[3], r[4]]);
    const named = rank.get(i)! < labelled;
    return { id: i, x, y, width: named ? textWidth(r[0]) : 0, height: named ? FONT * 1.2 + 1 : 0, symbol: r[2] > 0 ? { type: 'circle', radius: 20 * Math.sqrt(r[2] / vmax) } : undefined, priority: r[2], leader: rank.get(i)! < 300 };
  });
  return { id, title, names: subset.map((r) => r[0]), labels, options: { bounds: PAGE, obstacles: [{ type: 'rect', box: LEGEND }], ...options } };
}

/** The 96 départements, named inside their outline or outside, on two lines if need be, every name required. */
function departementScene(): NamedScene {
  const geo = JSON.parse(data('france-departements-2025.geojson.gz')) as { features: { properties: { nom?: string }; geometry: { type: string; coordinates: unknown } }[] };
  const deps = geo.features.filter((f) => f.properties.nom);
  const polygons = deps.map((f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates as Point[][]] : (f.geometry.coordinates as Point[][][])));
  const to = fit(polygons.flat(3));
  const font = 10;
  const labels = deps.map((f, i): LabelInput => {
    const rings = polygons[i].map((p) => p[0].map(to));
    const largest = rings.reduce((a, b) => (b.length > a.length ? b : a));
    const xs = largest.map((p) => p[0]);
    const ys = largest.map((p) => p[1]);
    const name = f.properties.nom!;
    const cut = name.search(/[- ]/) > 0 ? name.lastIndexOf(name.includes('-') ? '-' : ' ', Math.ceil(name.length / 2)) : -1;
    const lines = cut > 0 ? [name.slice(0, cut + 1), name.slice(cut + 1)] : null;
    return {
      id: i,
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
      width: textWidth(name, font),
      height: font * 1.2 + 1,
      layouts: lines ? [{ width: Math.max(...lines.map((t) => textWidth(t, font))), height: 2 * (font * 1.2) + 1 }] : undefined,
      symbol: { type: 'polygon', rings },
      mode: 'required'
    };
  });
  return { id: 'departements', title: 'Les 96 départements, tous nommés', names: deps.map((f) => f.properties.nom!), labels, options: { bounds: PAGE } };
}

/** The reference scenes of the regression test, built once. */
export function referenceScenes(): NamedScene[] {
  const random = [3, 7, 11, 19, 23].map((seed): NamedScene => {
    const s = randomScene(seed);
    return { ...s, id: `random-${seed}`, title: `Scène aléatoire ${seed}`, names: s.labels.map((_, i) => `#${i}`) };
  });
  return [
    communeScene('bretagne', 'Bretagne, 1 202 communes', ['53'], Infinity),
    communeScene('bretagne-100', 'Bretagne, les 100 plus grandes nommées', ['53'], 100),
    communeScene('normandie-colonnes', 'Normandie, espacement et colonnes', ['28'], 400, { spacing: 4, align: 'columns' }),
    departementScene(),
    ...random
  ];
}
