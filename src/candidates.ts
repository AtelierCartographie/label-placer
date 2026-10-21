import { flushAlignment, leaderGeometry, symbolExtent } from './leader.ts';
import type { Box, LabelInput, LeaderStyle, Placement, Point, Position, TextAnchor } from './types.ts';

export interface Candidate {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  cost: number;
  placement: Placement;
  ring: number;
  textAnchor: TextAnchor;
  baseline: 'top' | 'middle' | 'bottom';
  leader: Point[] | null;
  /**
   * Static hard coverage of a blocked candidate, as an area: hard obstacles under the box,
   * a strip one label height wide along the leader where it crosses one, the box out of
   * bounds. Zero for a clean candidate.
   */
  hard: number;
  /** Bounding box of the label box and its leader. */
  bx0: number;
  by0: number;
  bx1: number;
  by1: number;
}

export interface CandidateSettings {
  positions: Position[];
  gap: number;
  inside: boolean;
  rings: number[];
  leaderStyle: LeaderStyle;
  symbolGap: number;
  minGap: number;
  leaderBaseCost: number;
  leaderLengthCost: number;
  areaOverflowCost: number;
  unit: number;
}

const DIRECTIONS: Record<Position, [dx: -1 | 0 | 1, dy: -1 | 0 | 1]> = {
  'top-right': [1, -1],
  'top-left': [-1, -1],
  'bottom-right': [1, 1],
  'bottom-left': [-1, 1],
  right: [1, 0],
  left: [-1, 0],
  top: [0, -1],
  bottom: [0, 1]
};

/** The practice of the Atelier de cartographie: sides first, right, above, left, below, then corners. */
export const DEFAULT_POSITIONS: Position[] = ['right', 'top', 'left', 'bottom', 'top-right', 'top-left', 'bottom-right', 'bottom-left'];

const INSIDE_COST = -1;

export function makeCandidate(
  box: Box,
  cost: number,
  placement: Placement,
  ring: number,
  textAnchor: Candidate['textAnchor'],
  baseline: Candidate['baseline'],
  leader: Point[] | null
): Candidate {
  let [bx0, by0, bx1, by1] = box;
  if (leader)
    for (const [x, y] of leader) {
      bx0 = Math.min(bx0, x);
      by0 = Math.min(by0, y);
      bx1 = Math.max(bx1, x);
      by1 = Math.max(by1, y);
    }
  return { x0: box[0], y0: box[1], x1: box[2], y1: box[3], cost, placement, ring, textAnchor, baseline, leader, hard: 0, bx0, by0, bx1, by1 };
}

/** Candidates of a movable label, sorted by cost. */
export function buildCandidates(label: LabelInput, s: CandidateSettings): Candidate[] {
  const { x, y, width: w, height: h, symbol } = label;
  const out: Candidate[] = [];

  if (symbol?.type === 'area') {
    const halfDiagonal = Math.hypot(w / 2, h / 2);
    const overflow = symbol.inscribedRadius > 0 ? Math.min(1, Math.max(0, halfDiagonal / symbol.inscribedRadius - 1)) : 1;
    out.push(makeCandidate([x - w / 2, y - h / 2, x + w / 2, y + h / 2], s.areaOverflowCost * overflow, 'center', 0, 'middle', 'middle', null));
  } else if (s.inside && symbol) {
    const fits =
      symbol.type === 'circle' ? Math.hypot(w / 2, h / 2) <= symbol.radius : w <= symbol.width && h <= symbol.height;
    if (fits) out.push(makeCandidate([x - w / 2, y - h / 2, x + w / 2, y + h / 2], INSIDE_COST, 'inside', 0, 'middle', 'middle', null));
  }

  const rings = label.leader === false ? [0] : [0, ...s.rings];
  for (let ring = 0; ring < rings.length; ring++) {
    for (let p = 0; p < s.positions.length; p++) {
      const position = s.positions[p];
      const [dx, dy] = DIRECTIONS[position];
      const k = dx !== 0 && dy !== 0 ? Math.SQRT1_2 : 1;
      const reach = s.gap + rings[ring];
      let px: number;
      let py: number;
      if (symbol?.type === 'rect') {
        px = x + dx * (symbol.width / 2 + reach * k);
        py = y + dy * (symbol.height / 2 + reach * k);
      } else {
        const r = symbol ? symbolExtent(symbol, dx * k, dy * k) : 0;
        px = x + dx * (r + reach) * k;
        py = y + dy * (r + reach) * k;
      }
      const x0 = dx > 0 ? px : dx < 0 ? px - w : px - w / 2;
      const y0 = dy > 0 ? py : dy < 0 ? py - h : py - h / 2;
      const box: Box = [x0, y0, x0 + w, y0 + h];
      const textAnchor = flushAlignment([x, y], box);
      const baseline = dy > 0 ? 'top' : dy < 0 ? 'bottom' : 'middle';
      const rank = symbol?.type === 'area' ? p + 1 : p;
      if (ring === 0) {
        out.push(makeCandidate(box, rank, position, 0, textAnchor, baseline, null));
        continue;
      }
      const leader = leaderGeometry({ anchor: [x, y], symbol, box, style: s.leaderStyle, symbolGap: s.symbolGap, minGap: s.minGap });
      if (!leader) continue;
      let length = 0;
      for (let i = 1; i < leader.length; i++) length += Math.hypot(leader[i][0] - leader[i - 1][0], leader[i][1] - leader[i - 1][1]);
      const cost = rank + s.leaderBaseCost + (s.leaderLengthCost * length) / s.unit;
      out.push(makeCandidate(box, cost, position, ring, textAnchor, baseline, leader));
    }
  }
  return out.sort((a, b) => a.cost - b.cost);
}
