import type { Box, LabelSymbol, LeaderStyle, Point, TextAnchor } from './types.ts';

export interface LeaderParams {
  anchor: Point;
  symbol?: LabelSymbol;
  box: Box;
  /**
   * `octilinear`: a 45° leg out of the symbol, then a horizontal leg into the facing side
   * or a vertical leg into the top or bottom edge. `straight`: one segment to the same port.
   */
  style?: LeaderStyle;
  /** Clear space kept between the symbol and the start of the leader. */
  symbolGap?: number;
  /** No leader while the gap between the symbol and the label stays below this. */
  minGap?: number;
}

type LeaderEnd = 'horizontal' | 'vertical' | 'diagonal';
interface Port {
  port: Point;
  end: LeaderEnd;
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
const sign = (v: number) => (v < 0 ? -1 : 1);
const distanceToRange = (v: number, min: number, max: number) => (v < min ? min - v : v > max ? v - max : 0);

/** Gaps between the anchor (origin) and the box, horizontally and vertically. */
function gaps([cx, cy]: Point, [hw, hh]: Point): { horizontal: number; vertical: number } {
  return { horizontal: distanceToRange(0, cx - hw, cx + hw), vertical: distanceToRange(0, cy - hh, cy + hh) };
}

/**
 * Flush a label towards its feature: left-aligned when it sits on the right, right-aligned
 * on the left, centered above, below, or over the anchor.
 */
export function flushAlignment(anchor: Point, box: Box): TextAnchor {
  const [center, half] = relative(anchor, box);
  const g = gaps(center, half);
  // Corner placements have equal gaps up to rounding: they stay flushed sideways.
  const tolerance = 1e-9 * Math.max(1, g.vertical);
  if (g.horizontal === 0 || g.horizontal < g.vertical - tolerance) return 'middle';
  return center[0] > 0 ? 'start' : 'end';
}

function relative([ax, ay]: Point, [x0, y0, x1, y1]: Box): [center: Point, half: Point] {
  return [
    [(x0 + x1) / 2 - ax, (y0 + y1) / 2 - ay],
    [(x1 - x0) / 2, (y1 - y0) / 2]
  ];
}

// Middle of the facing vertical side, reached by a horizontal last leg.
function sidePort([cx, cy]: Point, [hw]: Point): Port | null {
  const x = cx - hw > 0 ? cx - hw : cx + hw < 0 ? cx + hw : null;
  if (x === null || Math.abs(cy) > Math.abs(x)) return null;
  return { port: [x, cy], end: 'horizontal' };
}

// Facing horizontal edge, within its central half, reached by a vertical last leg,
// or by the 45° leg alone when that is the only way in.
function edgePort([cx, cy]: Point, [hw, hh]: Point): Port | null {
  const y = cy - hh > 0 ? cy - hh : cy + hh < 0 ? cy + hh : null;
  if (y === null) return null;
  const x = clamp(0, cx - hw / 2, cx + hw / 2);
  if (Math.abs(x) <= Math.abs(y)) return { port: [x, y], end: 'vertical' };
  const diagonalX = sign(x) * Math.abs(y);
  return diagonalX >= cx - hw && diagonalX <= cx + hw ? { port: [diagonalX, y], end: 'diagonal' } : null;
}

// Where the 45° ray towards the label enters its box.
function diagonalPort([cx, cy]: Point, [hw, hh]: Point): Port | null {
  const sx = sign(cx);
  const sy = sign(cy);
  const enter = Math.max(sx * cx - hw, sy * cy - hh, 0);
  const exit = Math.min(sx * cx + hw, sy * cy + hh);
  return enter > 0 && enter <= exit ? { port: [sx * enter, sy * enter], end: 'diagonal' } : null;
}

/**
 * Leader polyline from the symbol to the label box, or null when the label covers its
 * anchor or still reads as attached (gap below `minGap`).
 */
export function leaderGeometry({ anchor, symbol, box, style = 'octilinear', symbolGap = 0, minGap = 0 }: LeaderParams): Point[] | null {
  const [center, half] = relative(anchor, box);
  const [cx, cy] = center;
  const [hw, hh] = half;
  const nearest: Point = [clamp(0, cx - hw, cx + hw), clamp(0, cy - hh, cy + hh)];
  const nearestDistance = Math.hypot(nearest[0], nearest[1]);
  if (nearestDistance === 0) return null;
  const extentToNearest = symbolExtent(symbol, nearest[0] / nearestDistance, nearest[1] / nearestDistance);
  if (nearestDistance - extentToNearest < minGap) return null;

  const g = gaps(center, half);
  const resolvers = g.horizontal >= g.vertical ? [sidePort, edgePort] : [edgePort, sidePort];
  const route = resolvers.reduce<Port | null>((found, resolve) => found ?? resolve(center, half), null) ?? diagonalPort(center, half);
  if (!route) return null;
  const { port, end } = route;
  const [px, py] = port;
  const buffered = (extent: number) => (extent > 0 ? extent + symbolGap : 0);
  const toAbsolute = (points: Point[]): Point[] => points.map(([x, y]) => [anchor[0] + x, anchor[1] + y]);

  const startOn = (tx: number, ty: number): Point | null => {
    const d = Math.hypot(tx, ty);
    if (d === 0) return null;
    const reach = buffered(symbolExtent(symbol, tx / d, ty / d));
    return reach < d ? [(tx / d) * reach, (ty / d) * reach] : null;
  };

  if (style === 'straight') {
    const start = startOn(px, py);
    return start ? toAbsolute([start, port]) : null;
  }

  const elbow: Point = end === 'horizontal' ? [sign(px) * Math.abs(py), py] : end === 'vertical' ? [px, sign(py) * Math.abs(px)] : port;
  const start = startOn(elbow[0], elbow[1]);
  if (start) return toAbsolute(elbow === port ? [start, port] : [start, elbow, port]);

  // The bend falls inside the buffer: leave it along the last leg's line.
  const reach = buffered(symbolExtent(symbol, end === 'vertical' ? 0 : sign(px), end === 'vertical' ? sign(py) : 0));
  const fallback: Point =
    end === 'vertical'
      ? [px, sign(py) * Math.sqrt(Math.max(0, reach * reach - px * px))]
      : [sign(px) * Math.sqrt(Math.max(0, reach * reach - py * py)), py];
  return toAbsolute([fallback, port]);
}

/** Distance from the anchor to the symbol's edge along the unit vector (ux, uy). */
export function symbolExtent(symbol: LabelSymbol | undefined, ux: number, uy: number): number {
  if (!symbol) return 0;
  switch (symbol.type) {
    case 'circle':
      return symbol.radius;
    case 'rect': {
      const tx = ux === 0 ? Infinity : symbol.width / 2 / Math.abs(ux);
      const ty = uy === 0 ? Infinity : symbol.height / 2 / Math.abs(uy);
      return Math.min(tx, ty);
    }
    case 'area':
      return 0;
  }
}
