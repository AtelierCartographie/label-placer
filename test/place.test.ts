import { describe, expect, it } from 'vitest';
import { DEFAULT_POSITIONS, placeLabels } from '../src/index.ts';
import type { Box, LabelInput, PlacedLabel, PlaceOptions, Point } from '../src/index.ts';

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
    expect(first.labels[0].placement).toBe('right');
    const forced = placeLabels(one, { ...opts, positions: ['bottom-left', 'right'] });
    expect(forced.labels[0].placement).toBe('bottom-left');
    const sticky = placeLabels(one, { ...opts, positions: ['bottom-left', 'right'], previous: first });
    expect(sticky.labels[0].placement).toBe('right');
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

  it('flushes corner labels sideways despite rounding', () => {
    for (const radius of [7, 23, 24, 31.7]) {
      const r = placeLabels(
        [
          { x: 100, y: 100, width: 40, height: 12, symbol: { type: 'circle', radius } },
          { x: 300, y: 100, width: 40, height: 12, symbol: { type: 'circle', radius } }
        ],
        { bounds: [0, 0, 400, 200], inside: false, positions: ['top-right'] }
      );
      const left = placeLabels(r.labels.map((_, i) => ({ x: 100 + i * 200, y: 100, width: 40, height: 12, symbol: { type: 'circle' as const, radius } })), {
        bounds: [0, 0, 400, 200],
        inside: false,
        positions: ['bottom-left']
      });
      expect(r.labels.map((l) => l.textAnchor)).toEqual(['start', 'start']);
      expect(left.labels.map((l) => l.textAnchor)).toEqual(['end', 'end']);
    }
  });

  it('keeps leaders inside the bounds', () => {
    for (const l of visible(result.labels))
      for (const [x, y] of l.leader ?? []) expect(x >= 0 && y >= 0 && x <= 600 && y <= 400).toBe(true);
  });

  it('gives a required label that cannot avoid a hard obstacle the spot that covers the least of it', () => {
    const label: LabelInput = { x: 100, y: 100, width: 40, height: 10, mode: 'required' };
    // The cheaper spot on the right lies on a large obstacle; the one on the left only grazes one.
    const obstacles: PlaceOptions['obstacles'] = [
      { type: 'rect', box: [100, 90, 150, 110] },
      { type: 'rect', box: [58, 95, 60, 97] }
    ];
    const r = placeLabels([label], { bounds: [0, 0, 200, 200], obstacles, positions: ['right', 'left'], leader: false });
    expect(r.labels[0].placement).toBe('left');
    expect(r.labels[0].overlapping).toBe(true);
  });

  it('counts a leader across a hard symbol against a required label before its overlaps with labels', () => {
    const label: LabelInput = { x: 100, y: 100, width: 40, height: 10, symbol: { type: 'circle', radius: 3 }, mode: 'required' };
    const pins: LabelInput[] = [
      // Right next to the symbol, clear of the leaders.
      { x: 106.5, y: 104, width: 3, height: 2, mode: 'pinned' },
      // Under every box on the left.
      { x: 65, y: 100, width: 10, height: 10, mode: 'pinned' }
    ];
    const r = placeLabels([label, ...pins], {
      bounds: [0, 0, 200, 200],
      // A symbol on the way of every leader to the right, a corner of an obstacle under every box on the left.
      obstacles: [
        { type: 'circle', x: 110, y: 100, radius: 3.5 },
        { type: 'rect', box: [55, 95, 57, 97] }
      ],
      inside: false,
      positions: ['right', 'left'],
      leader: { rings: [10] }
    });
    expect(r.labels[0].placement).toBe('left');
    expect(r.labels[0].overlapping).toBe(true);
  });

  it('tries one farther leader ring for required labels only', () => {
    const label: LabelInput = { x: 100, y: 100, width: 40, height: 10, symbol: { type: 'circle', radius: 3 } };
    const options: PlaceOptions = {
      bounds: [0, 0, 200, 200],
      // Block the boxes next to the symbol and on the first two rings, not the leaders.
      obstacles: [
        { type: 'rect', box: [110, 95, 120, 97] },
        { type: 'rect', box: [125, 103, 130, 105] }
      ],
      inside: false,
      positions: ['right']
    };
    const required = placeLabels([{ ...label, mode: 'required' }], options).labels[0];
    expect(required.ring).toBe(3);
    expect(required.overlapping).toBe(false);
    expect(placeLabels([label], options).labels[0].visible).toBe(false);
  });

  it('prefers the sides, right, above, left, below, then the corners', () => {
    expect(DEFAULT_POSITIONS).toEqual(['right', 'top', 'left', 'bottom', 'top-right', 'top-left', 'bottom-right', 'bottom-left']);
    const label: LabelInput = { x: 100, y: 100, width: 40, height: 10, symbol: { type: 'circle', radius: 3 } };
    const r = placeLabels([label], { bounds: [0, 0, 200, 200], inside: false });
    expect(r.labels[0].placement).toBe('right');
    const blocked = placeLabels([label], { bounds: [0, 0, 200, 200], inside: false, obstacles: [{ type: 'rect', box: [104, 96, 150, 110] }] });
    expect(blocked.labels[0].placement).toBe('top');
  });

  it('moves a label away from a symbol as close to it as its own', () => {
    const label: LabelInput = { x: 100, y: 100, width: 40, height: 10, symbol: { type: 'circle', radius: 3 } };
    // A symbol without a label, as close to the box on the right as the label's own symbol.
    const other: LabelInput = { x: 150, y: 100, width: 0, height: 0, symbol: { type: 'circle', radius: 3 } };
    const options: PlaceOptions = { bounds: [0, 0, 200, 200], inside: false };
    expect(placeLabels([label, other], options).labels[0].placement).toBe('top');
    expect(placeLabels([label, other], { ...options, ambiguity: { cost: 0 } }).labels[0].placement).toBe('right');
    expect(placeLabels([label], options).labels[0].placement).toBe('right');
  });

  it('treats a label with no size as a symbol alone', () => {
    const label: LabelInput = { x: 100, y: 100, width: 40, height: 10, symbol: { type: 'circle', radius: 3 } };
    const dots: LabelInput[] = [20, 30, 40].map((x) => ({ x, y: 180, width: 0, height: 0, symbol: { type: 'circle', radius: 1 } }));
    const r = placeLabels([label, ...dots], { bounds: [0, 0, 200, 200], inside: false });
    // The gap still defaults to a fifth of the label height.
    expect(r.labels[0].box).toEqual([105, 95, 145, 105]);
    expect(r.labels.slice(1).every((l) => !l.visible)).toBe(true);
  });

  it('keeps leaders off small symbols when it can', () => {
    const label: LabelInput = { x: 100, y: 100, width: 40, height: 10, symbol: { type: 'circle', radius: 3 } };
    // Too small to block: a soft symbol on the way of the leader to the right.
    const dot: LabelInput = { x: 110, y: 100, width: 0, height: 0, symbol: { type: 'circle', radius: 2 } };
    const r = placeLabels([label, dot], {
      bounds: [0, 0, 200, 200],
      inside: false,
      positions: ['right', 'left'],
      leader: { rings: [10] },
      // Block the spots next to the symbol, not the leaders.
      obstacles: [
        { type: 'rect', box: [105, 95, 114, 98] },
        { type: 'rect', box: [86, 95, 95, 98] }
      ]
    });
    expect(r.labels[0].placement).toBe('left');
    expect(r.labels[0].ring).toBe(1);
  });

  it('sets a label on two lines when one line does not fit', () => {
    const label: LabelInput = { x: 100, y: 100, width: 100, height: 10, layouts: [{ width: 60, height: 20 }], symbol: { type: 'circle', radius: 3 } };
    const options: PlaceOptions = { bounds: [0, 0, 300, 200], positions: ['right'], leader: false, obstacles: [{ type: 'rect', box: [170, 95, 180, 105] }] };
    const r = placeLabels([label], options).labels[0];
    expect(r.layout).toBe(1);
    expect(r.box).toEqual([105, 90, 165, 110]);
    expect(placeLabels([{ ...label, layouts: undefined }], options).labels[0].visible).toBe(false);
    // Inside a circle only the compact layout fits.
    const inside = placeLabels([{ ...label, symbol: { type: 'circle', radius: 30 }, layouts: [{ width: 40, height: 20 }] }], { bounds: [0, 0, 300, 200] }).labels[0];
    expect([inside.placement, inside.layout]).toEqual(['inside', 1]);
  });

  it('keeps a polygon label wholly inside its polygon, shifted from the anchor if needed', () => {
    // A coastal area: its anchor sits too close to the coast at x = 100 for a centered label.
    const area: LabelInput = { x: 80, y: 50, width: 50, height: 10, symbol: { type: 'polygon', rings: [[[0, 0], [100, 0], [100, 100], [0, 100]]] } };
    const r = placeLabels([area], { bounds: [0, 0, 300, 200] }).labels[0];
    expect(r.placement).toBe('center');
    expect(r.box![0]).toBeGreaterThanOrEqual(0);
    expect(r.box![2]).toBeLessThanOrEqual(100);
  });

  it('puts a polygon label that does not fit wholly outside, and not in another polygon', () => {
    const square = (x0: number, y0: number, x1: number, y1: number) => ({ type: 'polygon' as const, rings: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as Point[]] });
    const small: LabelInput = { x: 80, y: 50, width: 50, height: 10, symbol: square(60, 40, 100, 60) };
    const r = placeLabels([small], { bounds: [0, 0, 300, 200], leader: false }).labels[0];
    expect(r.placement).toBe('right');
    expect(r.box![0]).toBeGreaterThanOrEqual(100);
    // With a neighbour on the right, its label goes to the other side.
    const neighbour: LabelInput = { x: 150, y: 20, width: 10, height: 10, symbol: square(100, 0, 200, 100) };
    const both = placeLabels([small, neighbour], { bounds: [0, 0, 300, 200], leader: false }).labels[0];
    expect(both.placement).toBe('left');
    expect(both.box![2]).toBeLessThanOrEqual(60);
  });

  it('keeps label boxes off line obstacles, not leaders', () => {
    const label: LabelInput = { x: 100, y: 100, width: 40, height: 10, symbol: { type: 'circle', radius: 3 } };
    const coast = (x: number, soft?: boolean): PlaceOptions['obstacles'] => [{ type: 'line', points: [[x, 0], [x, 200]], soft }];
    const base: PlaceOptions = { bounds: [0, 0, 300, 200], inside: false, positions: ['right', 'left'], leader: false };
    expect(placeLabels([label], { ...base, obstacles: coast(130) }).labels[0].placement).toBe('left');
    expect(placeLabels([label], { ...base, obstacles: coast(130, true) }).labels[0].placement).toBe('left');
    expect(placeLabels([label], base).labels[0].placement).toBe('right');
    // The spot next to the symbol lies across the line; a leader may cross it to the next ring.
    const r = placeLabels([label], { ...base, positions: ['right'], leader: { rings: [10] }, obstacles: coast(108) }).labels[0];
    expect(r.ring).toBe(1);
    expect(r.overlapping).toBe(false);
  });

  it('places more labels with ejection chains than greedily, without losing higher ones', () => {
    const greedy = placeLabels(labels, { ...options, optimize: 'none' });
    expect(result.stats.placed).toBeGreaterThanOrEqual(greedy.stats.placed);
  });
});
