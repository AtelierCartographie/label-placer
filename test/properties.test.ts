import { describe, expect, it } from 'vitest';
import { placeBlocks, placeLabels } from '../src/index.ts';
import { segmentHitsBox, segmentsCross } from '../src/geometry.ts';
import { pointInRings } from '../src/polygon.ts';
import type { Box, PlacementResult, Point } from '../src/index.ts';
import { randomScene, type Scene } from './scenes.ts';

/**
 * Properties of every placement, checked on random scenes that mix every feature: what the
 * engine guarantees whatever the input, as opposed to how it places one scene.
 */

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

  it.each(SEEDS)('scene %i: blocks in the bounds, apart, and clear of the symbols and the hard obstacles unless flagged', (seed) => {
    const scene = randomScene(seed);
    const [W, H] = [scene.options.bounds[2], scene.options.bounds[3]];
    const margin = seed % 3 === 0 ? 0 : 6;
    const blocks = placeBlocks(
      [
        { width: W * 0.25, height: H * 0.2 },
        { width: W * 0.5, height: H * 0.08, positions: ['top', 'bottom'] },
        { width: W * 0.15, height: H * 0.06 }
      ],
      { bounds: scene.options.bounds, obstacles: scene.options.obstacles, labels: scene.labels, margin }
    );
    const out: string[] = [];
    const cell = 3;
    blocks.forEach((b, k) => {
      if (!inside(b.box, scene.options.bounds)) out.push(`block ${k} out of the bounds`);
      for (let j = 0; j < k; j++) if (overlap(b.box, blocks[j].box, margin - 1e-6)) out.push(`blocks ${j} and ${k} closer than the margin`);
      if (b.overlapping) return;
      const shrunk: Box = [b.box[0] + cell, b.box[1] + cell, b.box[2] - cell, b.box[3] - cell];
      for (const o of scene.options.obstacles ?? []) if (o.type === 'rect' && !o.soft && overlap(b.box, o.box)) out.push(`block ${k} on a hard rect`);
      scene.labels.forEach((l, i) => {
        const r = l.symbol?.type === 'circle' ? l.symbol.radius : l.symbol?.type === 'rect' ? 0 : l.symbol ? -1 : 0;
        if (r < 0) return;
        if (Math.hypot(Math.max(shrunk[0] - l.x, 0, l.x - shrunk[2]), Math.max(shrunk[1] - l.y, 0, l.y - shrunk[3])) < r) out.push(`block ${k} over the symbol of label ${i}`);
      });
    });
    expect(out).toEqual([]);
  });

  it.each(SEEDS.slice(0, 20))('scene %i: run again on its own result, as consistent and clear', (seed) => {
    const scene = randomScene(seed);
    const previous = placeLabels(scene.labels, scene.options);
    const again = placeLabels(scene.labels, { ...scene.options, previous });
    expect(violations(scene, again)).toEqual([]);
  });
});
