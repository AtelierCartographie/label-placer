import { describe, expect, it } from 'vitest';
import { flushAlignment, leaderGeometry } from '../src/index.ts';
import type { Box, Point } from '../src/index.ts';

// Cases shared with Khartis' manual label placement: anchor at the origin, label box
// given by its center and half size.
const box = ([cx, cy]: Point, [hw, hh]: Point): Box => [cx - hw, cy - hh, cx + hw, cy + hh];
const rounded = (points: Point[] | null) => points?.map(([x, y]) => [Math.round(x * 100) / 100 + 0, Math.round(y * 100) / 100 + 0]) ?? null;
const SYMBOL_GAP = 3;
const MIN_GAP = 8;

function leader(center: Point, half: Point, radius: number) {
  return leaderGeometry({
    anchor: [0, 0],
    symbol: radius > 0 ? { type: 'circle', radius } : undefined,
    box: box(center, half),
    symbolGap: SYMBOL_GAP,
    minGap: MIN_GAP
  });
}

describe('leaderGeometry', () => {
  it('draws no leader when the label covers its anchor', () => {
    expect(leader([4, -2], [20, 6], 0)).toBeNull();
  });

  it('draws no leader when the label stays close to the symbol', () => {
    expect(leader([35, 0], [20, 6], 10)).toBeNull();
  });

  it('leaves the symbol at 45° then runs horizontally into the facing side', () => {
    expect(rounded(leader([80, 40], [20, 6], 10))).toEqual([
      [9.19, 9.19],
      [40, 40],
      [60, 40]
    ]);
  });

  it('runs horizontally from the buffer when the label is level with the symbol', () => {
    expect(rounded(leader([-80, 0], [20, 6], 10))).toEqual([
      [-13, 0],
      [-60, 0]
    ]);
  });

  it('leaves the buffer horizontally when the elbow would fall inside it', () => {
    expect(rounded(leader([60, 5], [20, 6], 10))).toEqual([
      [12, 5],
      [40, 5]
    ]);
  });

  it('bends then runs vertically into the top edge when the label sits mostly below', () => {
    expect(rounded(leader([30, 80], [20, 6], 0))).toEqual([
      [0, 0],
      [20, 20],
      [20, 74]
    ]);
  });

  it('stays vertical when the label sits straight above the symbol', () => {
    expect(rounded(leader([5, -60], [30, 6], 10))).toEqual([
      [0, -13],
      [0, -54]
    ]);
  });

  it('keeps a single 45° segment when no horizontal or vertical leg fits', () => {
    expect(rounded(leader([50, 35], [20, 10], 0))).toEqual([
      [0, 0],
      [30, 30]
    ]);
  });

  it('only produces horizontal, vertical or 45° segments', () => {
    const centers: Point[] = [
      [120, 17],
      [-37, 95],
      [64, -71],
      [-150, -12],
      [18, 140],
      [-90, 88]
    ];
    for (const center of centers) {
      const points = leader(center, [24, 7], 9);
      expect(points).not.toBeNull();
      for (let i = 1; i < points!.length; i++) {
        const dx = Math.abs(points![i][0] - points![i - 1][0]);
        const dy = Math.abs(points![i][1] - points![i - 1][1]);
        expect(dx < 1e-9 || dy < 1e-9 || Math.abs(dx - dy) < 1e-9).toBe(true);
      }
    }
  });

  it('is expressed in the caller space, around the anchor', () => {
    const points = leaderGeometry({ anchor: [100, 200], box: box([180, 240], [20, 6]), symbol: { type: 'circle', radius: 10 }, symbolGap: 3 });
    expect(rounded(points)).toEqual([
      [109.19, 209.19],
      [140, 240],
      [160, 240]
    ]);
  });

  it('starts on the edge of a rectangular symbol', () => {
    const points = leaderGeometry({ anchor: [0, 0], box: box([-80, 0], [20, 6]), symbol: { type: 'rect', width: 20, height: 10 } });
    expect(rounded(points)).toEqual([
      [-10, 0],
      [-60, 0]
    ]);
  });

  it('runs into a polygon up to its anchor, not only to its outline', () => {
    const square: Point[] = [[-10, -10], [10, -10], [10, 10], [-10, 10]];
    const points = leaderGeometry({ anchor: [0, 0], box: box([60, 0], [20, 6]), symbol: { type: 'polygon', rings: [square] }, symbolGap: SYMBOL_GAP, minGap: MIN_GAP });
    expect(rounded(points)).toEqual([
      [0, 0],
      [40, 0]
    ]);
  });
});

describe('flushAlignment', () => {
  it('flushes left a label right of its anchor', () => {
    expect(flushAlignment([0, 0], box([80, 10], [20, 6]))).toBe('start');
  });

  it('flushes right a label left of its anchor', () => {
    expect(flushAlignment([0, 0], box([-80, -10], [20, 6]))).toBe('end');
  });

  it('centers a label above or below its anchor', () => {
    expect(flushAlignment([0, 0], box([15, -60], [30, 6]))).toBe('middle');
    expect(flushAlignment([0, 0], box([-30, 80], [20, 6]))).toBe('middle');
  });

  it('centers a label that still covers its anchor', () => {
    expect(flushAlignment([0, 0], box([4, -2], [20, 6]))).toBe('middle');
  });

  it('routes orthogonal leaders with horizontal and vertical legs only', () => {
    // Up and to the right: a vertical leg out of the circle, then a horizontal one into the side.
    const lead = leaderGeometry({ anchor: [0, 0], symbol: { type: 'circle', radius: 5 }, box: box([60, -30], [20, 6]), style: 'orthogonal', symbolGap: 2 })!;
    expect(rounded(lead)).toEqual([[0, -7], [0, -30], [40, -30]]);
    // Level with the anchor: one horizontal segment from the buffer.
    expect(rounded(leaderGeometry({ anchor: [0, 0], symbol: { type: 'circle', radius: 5 }, box: box([60, 2], [20, 6]), style: 'orthogonal', symbolGap: 2 }))).toEqual([[6.71, 2], [40, 2]]);
  });
});
