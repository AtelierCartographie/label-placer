import { segmentHitsBox } from './geometry.ts';
import type { Box, Point } from './types.ts';

/** Bounding box of the rings. */
export function ringsBox(rings: Point[][]): Box {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ring of rings)
    for (const [x, y] of ring) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  return [x0, y0, x1, y1];
}

/** Whether the point is inside the rings, by the even-odd rule (holes are rings too). */
export function pointInRings(x: number, y: number, rings: Point[][]): boolean {
  let inside = false;
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  return inside;
}

/** Whether an edge of the rings crosses the open box. */
function edgesCross([x0, y0, x1, y1]: Box, rings: Point[][]): boolean {
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[j];
      const [bx, by] = ring[i];
      if ((ax < x0 && bx < x0) || (ax > x1 && bx > x1) || (ay < y0 && by < y0) || (ay > y1 && by > y1)) continue;
      if (segmentHitsBox(ax, ay, bx, by, x0, y0, x1, y1)) return true;
    }
  return false;
}

/** Where the box lies with respect to the polygon: inside, outside, or across its outline. */
export function boxRelation(box: Box, rings: Point[][], bbox: Box = ringsBox(rings)): 'inside' | 'outside' | 'crossing' {
  const [x0, y0, x1, y1] = box;
  if (x1 <= bbox[0] || x0 >= bbox[2] || y1 <= bbox[1] || y0 >= bbox[3]) return 'outside';
  if (edgesCross(box, rings)) return 'crossing';
  return pointInRings((x0 + x1) / 2, (y0 + y1) / 2, rings) ? 'inside' : 'outside';
}

/** Distance from (x, y) along the unit vector (ux, uy) to the first crossing of the outline, or 0. */
export function rayExit(x: number, y: number, ux: number, uy: number, rings: Point[][]): number {
  let best = Infinity;
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[j];
      const ex = ring[i][0] - ax;
      const ey = ring[i][1] - ay;
      const den = ux * ey - uy * ex;
      if (den === 0) continue;
      const t = ((ax - x) * ey - (ay - y) * ex) / den;
      const s = ((ax - x) * uy - (ay - y) * ux) / den;
      if (t > 0 && s >= 0 && s <= 1 && t < best) best = t;
    }
  return best === Infinity ? 0 : best;
}

/** Distance from the box to the polygon: zero when they touch or overlap. */
export function boxRingsDistance(box: Box, rings: Point[][]): number {
  if (boxRelation(box, rings) !== 'outside') return 0;
  const [x0, y0, x1, y1] = box;
  const toBox = (px: number, py: number) => Math.hypot(Math.max(0, x0 - px, px - x1), Math.max(0, y0 - py, py - y1));
  let best = Infinity;
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[j];
      const [bx, by] = ring[i];
      best = Math.min(best, toBox(ax, ay));
      // Box corners to the edge.
      const ex = bx - ax;
      const ey = by - ay;
      const l2 = ex * ex + ey * ey;
      for (const [cx, cy] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
        const t = l2 > 0 ? Math.min(1, Math.max(0, ((cx - ax) * ex + (cy - ay) * ey) / l2)) : 0;
        best = Math.min(best, Math.hypot(ax + t * ex - cx, ay + t * ey - cy));
      }
    }
  return best;
}
