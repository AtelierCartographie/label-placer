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
});
