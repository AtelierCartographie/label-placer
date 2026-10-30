import { describe, expect, it } from 'vitest';
import { placeLabels, placeZooms } from '../src/index.ts';
import type { LabelInput, PlacementResult, ZoomLevel } from '../src/index.ts';

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Towns around six cities in a 400 × 300 box at zoom 0, projected at four zooms: the map doubles, the text keeps its size. */
function levels(seed: number): ZoomLevel[] {
  const rnd = mulberry32(seed);
  const centers = Array.from({ length: 6 }, () => [rnd() * 400, rnd() * 300]);
  const clamp = (v: number, hi: number) => Math.min(hi - 5, Math.max(5, v));
  const towns = Array.from({ length: 400 }, (_, i) => ({ i, x: clamp(centers[i % 6][0] + (rnd() - 0.5) * 120, 400), y: clamp(centers[i % 6][1] + (rnd() - 0.5) * 90, 300), size: Math.pow(rnd(), 3) }));
  return [0, 1, 2, 3].map((zoom) => {
    const k = Math.pow(2, zoom);
    const labels: LabelInput[] = towns.map((t) => ({
      id: t.i,
      x: t.x * k,
      y: t.y * k,
      width: 30 + (t.i % 5) * 8,
      height: 11,
      symbol: { type: 'circle', radius: 1 + 6 * Math.sqrt(t.size) },
      priority: t.size
    }));
    return { zoom: 5 + zoom, labels, options: { bounds: [0, 0, 400 * k, 300 * k] } };
  });
}

const key = (r: PlacementResult, i: number) => (r.labels[i].visible ? `${r.labels[i].placement}:${r.labels[i].ring}` : null);

describe('placeZooms', () => {
  it('keeps the names shown when zooming in, where they were, far more than placing each zoom on its own', () => {
    const count = { lost: 0, lostAlone: 0, moved: 0, movedAlone: 0, shown: 0 };
    for (const seed of [1, 2, 3, 4]) {
      const lv = levels(seed);
      const { levels: together, minZoom } = placeZooms(lv);
      const alone = lv.map((l) => placeLabels(l.labels, l.options));
      expect(together).toHaveLength(4);
      for (const r of together) expect(r.stats.overlapping).toBe(0);
      for (let k = 1; k < 4; k++)
        lv[k].labels.forEach((_, i) => {
          if (together[k - 1].labels[i].visible) count.shown++;
          if (together[k - 1].labels[i].visible && !together[k].labels[i].visible) count.lost++;
          if (alone[k - 1].labels[i].visible && !alone[k].labels[i].visible) count.lostAlone++;
          if (key(together[k - 1], i) && key(together[k], i) && key(together[k - 1], i) !== key(together[k], i)) count.moved++;
          if (key(alone[k - 1], i) && key(alone[k], i) && key(alone[k - 1], i) !== key(alone[k], i)) count.movedAlone++;
        });
      // The zoom each name first shows at.
      together[3].labels.forEach((_, i) => {
        const first = together.findIndex((r) => r.labels[i].visible);
        expect(minZoom[i]).toBe(first < 0 ? null : 5 + first);
      });
    }
    // A name goes only when no spot is left for it: under 1 % of those shown.
    expect(count.lost).toBeLessThan(count.shown / 100);
    expect(count.lost).toBeLessThan(count.lostAlone / 2);
    expect(count.moved).toBeLessThan(count.movedAlone / 2);
  });

  it('wants the same labels at every level', () => {
    const lv = levels(1);
    expect(() => placeZooms([lv[0], { ...lv[1], labels: lv[1].labels.slice(1) }])).toThrow(/same labels/);
  });
});
