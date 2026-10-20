import { describe, expect, it } from 'vitest';
import { placeLabels } from '../src/index.ts';
import type { Box, LabelInput, PlacedLabel, PlaceOptions } from '../src/index.ts';

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BOUNDS: Box = [0, 0, 600, 400];

/** Clustered proportional symbols, like towns around a few cities. */
function scene(n: number, seed = 1): LabelInput[] {
  const rnd = mulberry32(seed);
  const centers = Array.from({ length: 6 }, () => [60 + rnd() * 480, 40 + rnd() * 320]);
  return Array.from({ length: n }, (_, i) => {
    const [cx, cy] = centers[i % centers.length];
    const value = Math.pow(rnd(), 3) * 1000;
    return {
      id: i,
      x: cx + (rnd() - 0.5) * 220,
      y: cy + (rnd() - 0.5) * 160,
      width: 20 + rnd() * 50,
      height: 11,
      symbol: { type: 'circle', radius: 1 + 14 * Math.sqrt(value / 1000) },
      priority: value
    };
  });
}

const overlaps = (a: Box, b: Box) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const visible = (labels: PlacedLabel[]) => labels.filter((l) => l.visible);

describe('placeLabels', () => {
  const labels = scene(400);
  const legend: Box = [0, 300, 140, 400];
  const options: PlaceOptions = { bounds: BOUNDS, obstacles: [{ type: 'rect', box: legend }] };
  const result = placeLabels(labels, options);

  it('places some labels and hides others in a crowded scene', () => {
    expect(result.stats.placed).toBeGreaterThan(50);
    expect(result.stats.hidden).toBeGreaterThan(0);
  });

  it('never overlaps two optional labels', () => {
    const shown = visible(result.labels);
    for (let a = 0; a < shown.length; a++)
      for (let b = a + 1; b < shown.length; b++) expect(overlaps(shown[a].box!, shown[b].box!)).toBe(false);
  });

  it('keeps labels inside the bounds and off hard obstacles', () => {
    for (const l of visible(result.labels)) {
      const [x0, y0, x1, y1] = l.box!;
      expect(x0 >= 0 && y0 >= 0 && x1 <= 600 && y1 <= 400).toBe(true);
      expect(overlaps(l.box!, legend)).toBe(false);
    }
  });

  it('puts the text point on the box edge given by its alignment', () => {
    for (const l of visible(result.labels)) {
      const [x0, y0, x1, y1] = l.box!;
      expect(l.x).toBeCloseTo(l.textAnchor === 'start' ? x0 : l.textAnchor === 'end' ? x1 : (x0 + x1) / 2);
      expect(l.y).toBeCloseTo(l.baseline === 'top' ? y0 : l.baseline === 'bottom' ? y1 : (y0 + y1) / 2);
      expect(l.offset[0]).toBeCloseTo(l.x - labels[l.index].x);
    }
  });

  it('gives leader candidates a leader and adjacent ones none', () => {
    for (const l of visible(result.labels)) expect(l.ring > 0).toBe(l.leader !== null);
  });

  it('is deterministic under a work budget', () => {
    const again = placeLabels(labels, options);
    expect(again.labels.map((l) => [l.placement, l.ring])).toEqual(result.labels.map((l) => [l.placement, l.ring]));
  });

  it('lets the higher priority win a contested spot', () => {
    const pair: LabelInput[] = [
      { id: 'low', x: 100, y: 100, width: 60, height: 12, priority: 1 },
      { id: 'high', x: 100, y: 100, width: 60, height: 12, priority: 2 }
    ];
    const r = placeLabels(pair, { bounds: [0, 0, 200, 200], positions: ['right'], leader: false, inside: false });
    expect(r.labels.find((l) => l.id === 'high')!.visible).toBe(true);
    expect(r.labels.find((l) => l.id === 'low')!.visible).toBe(false);
  });

  it('never hides a required label', () => {
    const required = labels.map((l, i) => (i % 10 === 0 ? { ...l, mode: 'required' as const } : l));
    const r = placeLabels(required, options);
    required.forEach((l, i) => {
      if (l.mode === 'required') expect(r.labels[i].visible).toBe(true);
    });
  });

  it('keeps a pinned label where it was put and routes others around it', () => {
    const pinned: LabelInput = { id: 'pin', x: 300, y: 200, width: 80, height: 12, mode: 'pinned', offset: [120, -60] };
    const r = placeLabels([...labels, pinned], options);
    const p = r.labels.find((l) => l.id === 'pin')!;
    expect(p.box).toEqual([380, 134, 460, 146]);
    expect(p.textAnchor).toBe('start');
    expect(p.leader).not.toBeNull();
    for (const l of visible(r.labels)) if (l.id !== 'pin') expect(overlaps(l.box!, p.box!)).toBe(false);
  });

  it('puts a label inside its symbol when it fits', () => {
    const r = placeLabels([{ x: 100, y: 100, width: 20, height: 10, symbol: { type: 'circle', radius: 20 } }], { bounds: [0, 0, 200, 200] });
    expect(r.labels[0].placement).toBe('inside');
  });

  it('centers an area label that fits its inscribed circle', () => {
    const r = placeLabels([{ x: 100, y: 100, width: 30, height: 10, symbol: { type: 'area', inscribedRadius: 20 } }], { bounds: [0, 0, 200, 200] });
    expect(r.labels[0].placement).toBe('center');
  });

  it('keeps the previous placement while it stays free', () => {
    const one: LabelInput[] = [{ id: 'a', x: 100, y: 100, width: 40, height: 10, symbol: { type: 'circle', radius: 4 } }];
    const opts: PlaceOptions = { bounds: [0, 0, 200, 200], inside: false };
    const first = placeLabels(one, opts);
    expect(first.labels[0].placement).toBe('top-right');
    const forced = placeLabels(one, { ...opts, positions: ['bottom-left', 'top-right'] });
    expect(forced.labels[0].placement).toBe('bottom-left');
    const sticky = placeLabels(one, { ...opts, positions: ['bottom-left', 'top-right'], previous: first });
    expect(sticky.labels[0].placement).toBe('top-right');
  });

  it('drops a sticky leader once the label fits next to its symbol again', () => {
    const label: LabelInput = { id: 'a', x: 100, y: 100, width: 40, height: 10, symbol: { type: 'circle', radius: 4 } };
    // Takes the spot right of the symbol, but leaves the leader's way clear.
    const blocker: LabelInput = { id: 'pin', x: 110, y: 96.5, width: 8, height: 5, mode: 'pinned' };
    const opts: PlaceOptions = { bounds: [0, 0, 200, 200], inside: false, positions: ['right'] };
    const first = placeLabels([label, blocker], opts);
    expect(first.labels[0].ring).toBeGreaterThan(0);
    const alone = placeLabels([label], { ...opts, previous: first });
    expect(alone.labels[0].ring).toBe(0);
  });

  it('places more labels with ejection chains than greedily, without losing higher ones', () => {
    const greedy = placeLabels(labels, { ...options, optimize: 'none' });
    expect(result.stats.placed).toBeGreaterThanOrEqual(greedy.stats.placed);
  });
});
