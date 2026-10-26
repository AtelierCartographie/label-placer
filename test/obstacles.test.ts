import { describe, expect, it } from 'vitest';
import { ObstacleRaster } from '../src/obstacles.ts';

describe('ObstacleRaster', () => {
  it('marks the cell under a symbol too small to cover any cell center', () => {
    for (const soft of [true, false]) {
      const raster = new ObstacleRaster([0, 0, 10, 10], 1);
      // On a cell corner: the nearest cell centers are 0.71 cells away.
      raster.addCircle(5, 5, 0.4, soft);
      raster.finalize();
      const covered = soft ? raster.softArea([4, 4, 6, 6]) : raster.hardCoverage([4, 4, 6, 6]);
      expect(covered).toBe(1);
    }
  });

  it('fills a polygon by the cell centers inside it, holes left out', () => {
    const raster = new ObstacleRaster([0, 0, 10, 10], 1);
    const square = (a: number, b: number): [number, number][] => [[a, a], [b, a], [b, b], [a, b]];
    raster.addPolygon([square(1, 9), square(4, 6)], false);
    raster.finalize();
    // 8 × 8 cells, less the 2 × 2 of the hole.
    expect(raster.hardCoverage([0, 0, 10, 10])).toBe(60);
    expect(raster.hardCoverage([4, 4, 6, 6])).toBe(0);
    // Leaders see it like any hard obstacle.
    expect(raster.coveredLength(0.5, 2.5, 9.5, 2.5)).toBeGreaterThan(7);
  });

  it('costs a soft polygon by the share of the box it covers', () => {
    const raster = new ObstacleRaster([0, 0, 10, 10], 1);
    raster.addPolygon([[[0, 0], [5, 0], [5, 10], [0, 10]]], true, 2);
    raster.finalize();
    expect(raster.polygonCost([0, 0, 4, 4])).toBe(2);
    expect(raster.polygonCost([3, 0, 7, 4])).toBe(1);
    expect(raster.polygonCost([6, 0, 10, 4])).toBe(0);
    expect(raster.hardCoverage([0, 0, 10, 10])).toBe(0);
  });
});
