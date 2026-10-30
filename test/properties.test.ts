import { describe, expect, it } from 'vitest';
import { placeLabels } from '../src/index.ts';
import { segmentHitsBox, segmentsCross } from '../src/geometry.ts';
import { pointInRings } from '../src/polygon.ts';
import type { Box, GroupInput, LabelInput, Obstacle, PlaceOptions, PlacementResult, Point } from '../src/index.ts';

/**
 * Properties of every placement, checked on random scenes that mix every feature: what the
 * engine guarantees whatever the input, as opposed to how it places one scene.
 */

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Scene {
  labels: LabelInput[];
  options: PlaceOptions;
}

/** A random scene: clustered symbols of every kind, every mode, obstacles of every kind, and options. */
function randomScene(seed: number): Scene {
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

const EPS = 1e-6;
const STACKED = new Set(['column', 'margin', 'dodge']);
const overlap = (a: Box, b: Box, m = 0) => a[0] < b[2] + m - EPS && b[0] < a[2] + m - EPS && a[1] < b[3] + m - EPS && b[1] < a[3] + m - EPS;
const inside = (b: Box, [x0, y0, x1, y1]: Box) => b[0] >= x0 - EPS && b[1] >= y0 - EPS && b[2] <= x1 + EPS && b[3] <= y1 + EPS;
const segments = (line: Point[] | null) => (line ?? []).slice(1).map((q, k): [Point, Point] => [line![k], q]);

/** What is shown: the labels and the groups' blocks, with what the checks need of them. */
interface Shown {
  name: string;
  box: Box;
  leader: Point[] | null;
  overlapping: boolean;
  placement: string;
  /** Pinned, a callout or dodged: placed where it was asked, not checked against the obstacles. */
  fixed: boolean;
}

function shown(scene: Scene, r: PlacementResult): Shown[] {
  const out: Shown[] = [];
  for (const p of r.labels) {
    if (!p.visible) continue;
    const l = scene.labels[p.index];
    out.push({ name: `label ${p.index}`, box: p.box!, leader: p.leader, overlapping: p.overlapping, placement: p.placement!, fixed: l.mode === 'pinned' || !!l.callout || !!l.dodge });
  }
  for (const g of r.groups) if (g.visible) out.push({ name: `group ${g.index}`, box: g.box!, leader: g.leader, overlapping: false, placement: g.placement!, fixed: false });
  return out;
}

/** Every property that fails on this scene, as readable lines. */
function violations(scene: Scene, r: PlacementResult): string[] {
  const out: string[] = [];
  const fail = (s: string) => out.length < 12 && out.push(s);
  const { labels, options } = scene;
  const bounds = options.bounds;
  const spacing = options.spacing ?? 0;

  // Counts and flags agree.
  if (r.labels.length !== labels.length) fail('one result per label');
  if (r.stats.placed + r.stats.hidden !== labels.length) fail('placed + hidden = labels');
  if (r.stats.placed !== r.labels.filter((p) => p.visible).length) fail('stats.placed');
  if (r.stats.overlapping !== r.labels.filter((p) => p.overlapping).length) fail('stats.overlapping');
  if (r.stats.blocked !== r.labels.filter((p) => p.blocked).length) fail('stats.blocked');
  r.labels.forEach((p, i) => {
    const l = labels[i];
    if (p.index !== i || p.id !== l.id) fail(`label ${i}: index or id`);
    if (p.visible !== !!p.box) fail(`label ${i}: a box if and only if shown`);
    if (!p.visible && (p.overlapping || p.leader)) fail(`label ${i}: hidden, yet overlapping or with a leader`);
    if (p.blocked && p.visible) fail(`label ${i}: blocked yet shown`);
    // Why it is hidden, and who stands in its way.
    if (p.visible !== (p.reason === null)) fail(`label ${i}: a reason if and only if hidden`);
    if (p.blocked !== (p.reason === 'bounds' || p.reason === 'obstacles')) fail(`label ${i}: blocked, yet reason ${p.reason}`);
    if ((p.group !== null) !== (p.reason === 'group')) fail(`label ${i}: group, yet reason ${p.reason}`);
    if (!p.visible && !(l.width > 0 && l.height > 0) && p.reason !== 'size') fail(`label ${i}: no size, yet reason ${p.reason}`);
    if (p.reason === 'stack' && !l.dodge) fail(`label ${i}: reason stack, not dodged`);
    if (p.reason === 'labels' && !p.by.length && !p.byGroups.length) fail(`label ${i}: hidden by labels, none named: a free spot left`);
    if (p.reason !== 'labels' && (p.by.length || p.byGroups.length)) fail(`label ${i}: by, yet reason ${p.reason}`);
    for (const k of p.by) if (!r.labels[k]?.visible) fail(`label ${i}: by label ${k}, not shown`);
    for (const k of p.byGroups) if (!r.groups[k]?.visible) fail(`label ${i}: by group ${k}, not shown`);
    if (p.group !== null && p.visible) fail(`label ${i}: named by group ${p.group}, yet shown`);
    if (!(l.width > 0 && l.height > 0) && p.visible) fail(`label ${i}: no size, yet shown`);
    // Never hidden: required and pinned labels, unless a group names them.
    if (l.width > 0 && l.height > 0 && (l.mode === 'required' || l.mode === 'pinned') && !p.visible && p.group === null) fail(`label ${i}: ${l.mode}, hidden`);
    if (p.visible) {
      const sizes = [[l.width, l.height], ...(l.layouts ?? []).map((s) => [s.width, s.height])];
      const [w, h] = sizes[p.layout] ?? [NaN, NaN];
      const b = p.box!;
      if (Math.abs(b[2] - b[0] - w) > EPS || Math.abs(b[3] - b[1] - h) > EPS) fail(`label ${i}: box not the size of layout ${p.layout}`);
      if (Math.abs(p.offset[0] - (p.x - l.x)) > EPS || Math.abs(p.offset[1] - (p.y - l.y)) > EPS) fail(`label ${i}: offset`);
      // The text point on the edge its alignment tells.
      const tx = p.textAnchor === 'start' ? b[0] : p.textAnchor === 'end' ? b[2] : (b[0] + b[2]) / 2;
      const ty = p.baseline === 'top' ? b[1] : p.baseline === 'bottom' ? b[3] : (b[1] + b[3]) / 2;
      if (Math.abs(tx - p.x) > EPS || Math.abs(ty - p.y) > EPS) fail(`label ${i}: text point off its box edge`);
      if (l.mode === 'pinned') {
        const [ox, oy] = l.offset ?? [0, 0];
        if (Math.abs((b[0] + b[2]) / 2 - l.x - ox) > EPS || Math.abs((b[1] + b[3]) / 2 - l.y - oy) > EPS) fail(`label ${i}: pinned, moved`);
      }
      if (l.leader === false && p.leader && !l.callout && !l.dodge && l.mode !== 'pinned' && p.placement !== 'column') fail(`label ${i}: leader: false, yet a leader`);
    }
  });
  r.groups.forEach((g, k) => {
    if (g.visible !== !!g.box) fail(`group ${k}: a box if and only if shown`);
    for (const m of g.members) if (r.labels[m].visible || r.labels[m].group !== k) fail(`group ${k}: member ${m} shown or not marked`);
    r.labels.forEach((p, i) => p.group === k && !g.members.includes(i) && fail(`group ${k}: label ${i} marked, not a member`));
  });

  // What is shown and not flagged keeps clear of the rest: boxes, spacing, leaders.
  const all = shown(scene, r);
  for (let a = 0; a < all.length; a++)
    for (let b = a + 1; b < all.length; b++) {
      const A = all[a];
      const B = all[b];
      if (A.overlapping || B.overlapping) continue;
      if (overlap(A.box, B.box)) fail(`${A.name} and ${B.name} overlap`);
      // Spacing holds between two labels one of which could move; stacked ones keep their own gap.
      const sp = spacing > 0 && !(A.fixed && B.fixed) && !(STACKED.has(A.placement) && STACKED.has(B.placement)) ? spacing : 0;
      if (sp > 0 && overlap(A.box, B.box, sp - 1e-6)) fail(`${A.name} and ${B.name} closer than the spacing`);
      for (const [p, q] of segments(A.leader)) if (segmentHitsBox(p[0], p[1], q[0], q[1], B.box[0], B.box[1], B.box[2], B.box[3])) fail(`the leader of ${A.name} crosses ${B.name}`);
      for (const [p, q] of segments(B.leader)) if (segmentHitsBox(p[0], p[1], q[0], q[1], A.box[0], A.box[1], A.box[2], A.box[3])) fail(`the leader of ${B.name} crosses ${A.name}`);
      for (const [p, q] of segments(A.leader))
        for (const [s, t] of segments(B.leader)) if (segmentsCross(p[0], p[1], q[0], q[1], s[0], s[1], t[0], t[1])) fail(`the leaders of ${A.name} and ${B.name} cross`);
    }

  // In the bounds, and off the hard obstacles, unless flagged. The obstacles are rasterized at
  // about a tenth of a label height: a box may graze one by a cell.
  const unit = median(labels.filter((l) => l.width > 0 && l.height > 0).map((l) => l.height));
  const cell = (2 * unit) / 10;
  for (const s of all) {
    if (s.overlapping) continue;
    if (!inside(s.box, bounds)) fail(`${s.name} out of the bounds`);
    for (const p of s.leader ?? []) if (!inside([p[0], p[1], p[0], p[1]], bounds)) fail(`the leader of ${s.name} leaves the bounds`);
    if (s.fixed) continue;
    const shrunk: Box = [s.box[0] + cell, s.box[1] + cell, s.box[2] - cell, s.box[3] - cell];
    for (const o of options.obstacles ?? []) {
      if (o.soft) continue;
      if (o.type === 'rect' && overlap(shrunk, o.box)) fail(`${s.name} on a hard rect`);
      if (o.type === 'circle' && Math.hypot(Math.max(shrunk[0] - o.x, 0, o.x - shrunk[2]), Math.max(shrunk[1] - o.y, 0, o.y - shrunk[3])) < o.radius - cell) fail(`${s.name} on a hard circle`);
      if (o.type === 'line')
        for (const [p, q] of segments(o.points)) if (segmentHitsBox(p[0], p[1], q[0], q[1], shrunk[0], shrunk[1], shrunk[2], shrunk[3])) fail(`${s.name} on a hard line`);
      if (o.type === 'polygon') {
        const probes: Point[] = [[shrunk[0], shrunk[1]], [shrunk[2], shrunk[1]], [shrunk[0], shrunk[3]], [shrunk[2], shrunk[3]], [(shrunk[0] + shrunk[2]) / 2, (shrunk[1] + shrunk[3]) / 2]];
        if (shrunk[0] < shrunk[2] && shrunk[1] < shrunk[3] && probes.some(([x, y]) => pointInRings(x, y, o.rings))) fail(`${s.name} on a hard polygon`);
      }
    }
  }
  return out;
}

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[sorted.length >> 1] || 1;
}

const strip = (r: PlacementResult) => JSON.stringify({ ...r, stats: { ...r.stats, timings: null } });

const SEEDS = Array.from({ length: 60 }, (_, k) => k + 1);

describe('placement properties, on random scenes', () => {
  it.each(SEEDS)('scene %i: consistent, clear of the rest unless flagged, and deterministic', (seed) => {
    const scene = randomScene(seed);
    const r = placeLabels(scene.labels, scene.options);
    expect(violations(scene, r)).toEqual([]);
    expect(strip(placeLabels(scene.labels, scene.options))).toBe(strip(r));
  });

  it.each(SEEDS.slice(0, 20))('scene %i: run again on its own result, as consistent and clear', (seed) => {
    const scene = randomScene(seed);
    const previous = placeLabels(scene.labels, scene.options);
    const again = placeLabels(scene.labels, { ...scene.options, previous });
    expect(violations(scene, again)).toEqual([]);
  });
});
