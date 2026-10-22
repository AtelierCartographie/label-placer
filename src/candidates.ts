import { flushAlignment, leaderGeometry, symbolExtent } from './leader.ts';
import { boxRelation, ringsBox } from './polygon.ts';
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
  /** 0 for the label's own size, k for its `layouts[k - 1]`. */
  layout: number;
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
  return { x0: box[0], y0: box[1], x1: box[2], y1: box[3], cost, placement, ring, textAnchor, baseline, leader, layout: 0, hard: 0, bx0, by0, bx1, by1 };
}

/** Grid of offsets, in label heights, for a label inside its polygon: nearest to the anchor first. */
const POLYGON_OFFSETS: Point[] = [];
for (let dy = -6; dy <= 6; dy++) for (let dx = -8; dx <= 8; dx++) POLYGON_OFFSETS.push([dx / 2, dy / 2]);
POLYGON_OFFSETS.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
/** Cost of moving a label inside its polygon away from its anchor, per label height. */
const POLYGON_SHIFT_COST = 0.5;

/** Candidates of a movable label, in each of its layouts, sorted by cost. */
export function buildCandidates(label: LabelInput, s: CandidateSettings): Candidate[] {
  const out = layoutCandidates(label, label.width, label.height, s);
  label.layouts?.forEach((l, k) => {
    if (!(l.width > 0 && l.height > 0)) return;
    for (const c of layoutCandidates(label, l.width, l.height, s)) {
      c.cost += l.cost ?? 0.5;
      c.layout = k + 1;
      out.push(c);
    }
  });
  return out.sort((a, b) => a.cost - b.cost);
}

function layoutCandidates(label: LabelInput, w: number, h: number, s: CandidateSettings): Candidate[] {
  const { x, y, symbol } = label;
  const out: Candidate[] = [];

  if (symbol?.type === 'polygon') {
    if (s.inside) {
      const bbox = ringsBox(symbol.rings);
      for (const [ox, oy] of POLYGON_OFFSETS) {
        const cx = x + ox * s.unit;
        const cy = y + oy * s.unit;
        const box: Box = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
        if (boxRelation(box, symbol.rings, bbox) === 'inside')
          out.push(makeCandidate(box, INSIDE_COST + POLYGON_SHIFT_COST * Math.hypot(ox, oy), 'center', 0, 'middle', 'middle', null));
      }
    }
  } else if (symbol?.type === 'area') {
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
        const r = symbol ? symbolExtent(symbol, dx * k, dy * k, [x, y]) : 0;
        px = x + dx * (r + reach) * k;
        py = y + dy * (r + reach) * k;
      }
      const x0 = dx > 0 ? px : dx < 0 ? px - w : px - w / 2;
      const y0 = dy > 0 ? py : dy < 0 ? py - h : py - h / 2;
      const box: Box = [x0, y0, x0 + w, y0 + h];
      const textAnchor = flushAlignment([x, y], box);
      const baseline = dy > 0 ? 'top' : dy < 0 ? 'bottom' : 'middle';
      const rank = symbol?.type === 'area' || symbol?.type === 'polygon' ? p + 1 : p;
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
  return out;
}
