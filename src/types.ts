/** `[x0, y0, x1, y1]` with `x0 <= x1` and `y0 <= y1`. The y axis points down. */
export type Box = [x0: number, y0: number, x1: number, y1: number];
export type Point = [x: number, y: number];

/** Position of the label relative to its anchor, named from the label's point of view. */
export type Position =
  | 'top-right'
  | 'top-left'
  | 'bottom-right'
  | 'bottom-left'
  | 'right'
  | 'left'
  | 'top'
  | 'bottom';

/** Where a label ended up: around the anchor, inside its symbol, centered on an area, or pinned. */
export type Placement = Position | 'inside' | 'center' | 'pinned';

/** The mark drawn at the anchor. Candidates are laid out around it and leaders start on its edge. */
export type LabelSymbol =
  | { type: 'circle'; radius: number }
  | { type: 'rect'; width: number; height: number }
  /** An area feature labelled at an interior point, with the radius of the largest circle it contains. */
  | { type: 'area'; inscribedRadius: number };

/**
 * - `pinned`: placed at `offset`, never moved, an obstacle for every other label.
 * - `required`: always shown; moved or given a leader if needed, overlapping as a last resort.
 * - `optional`: hidden when no candidate is free.
 */
export type LabelMode = 'optional' | 'required' | 'pinned';

export interface LabelInput {
  id?: string | number;
  /** Anchor, in the caller's units. */
  x: number;
  y: number;
  /** Size of the box the label occupies, padding and halo included. */
  width: number;
  height: number;
  symbol?: LabelSymbol;
  /** Higher wins. Defaults to 0. */
  priority?: number;
  mode?: LabelMode;
  /** For `pinned` labels: center of the label box relative to the anchor. */
  offset?: Point;
  /** Whether this label may be moved away with a leader line. Defaults to true. */
  leader?: boolean;
}

export type Obstacle =
  | { type: 'rect'; box: Box; soft?: boolean }
  | { type: 'circle'; x: number; y: number; radius: number; soft?: boolean };

/**
 * `octilinear`: a 45° leg out of the symbol, then a horizontal leg into the facing side or a
 * vertical leg into the top or bottom edge. `straight`: one segment to the same port.
 */
export type LeaderStyle = 'octilinear' | 'straight';

export type TextAnchor = 'start' | 'middle' | 'end';

export interface LeaderOptions {
  /** Distances beyond the symbol edge at which leader candidates are tried. */
  rings?: number[];
  style?: LeaderStyle;
  /** Clear space kept between a symbol and the start of its leader. */
  symbolGap?: number;
  /** No leader while the gap between a symbol and its label stays below this. */
  minGap?: number;
  /** Cost of any leader candidate, in position-rank units. */
  baseCost?: number;
  /** Extra cost per median label height of leader length. */
  lengthCost?: number;
}

export interface Budget {
  /** Number of candidate tests the optimizer may spend. Deterministic. */
  work?: number;
  /** Wall-clock guard in milliseconds. Makes the result machine-dependent when it triggers. */
  timeMs?: number;
}

/**
 * Lengths left undefined default to multiples of the median label height, so the
 * library works the same in pixels, points or millimetres.
 */
export interface PlaceOptions {
  /** Labels must stay inside these bounds. */
  bounds: Box;
  obstacles?: Obstacle[];
  /** Candidate positions, in order of preference. */
  positions?: Position[];
  /** Distance between a symbol's edge and its label. */
  gap?: number;
  /** Try to put the label inside its symbol when it fits. Defaults to true. */
  inside?: boolean;
  /**
   * Label symbols at least `hardMinRadius` large block other labels; smaller ones only
   * add `softCost` per median-label-height² they cover.
   */
  symbolObstacles?: { hardMinRadius?: number; softCost?: number };
  /** `false` disables leader candidates. */
  leader?: LeaderOptions | false;
  /** Cost, in position-rank units, of a centered area label that overflows its inscribed circle twice. */
  areaOverflowCost?: number;
  /** Raster cells per unit for static obstacles. Defaults to about ten cells per label height. */
  resolution?: number;
  /** `chain` runs ejection chains after the greedy pass. Defaults to `chain`. */
  optimize?: 'none' | 'chain';
  budget?: Budget;
  /** Previous result, matched by `id` (or index): labels keep their placement while it stays free. */
  previous?: PlacementResult;
}

export interface PlacedLabel {
  index: number;
  id: string | number | undefined;
  visible: boolean;
  placement: Placement | null;
  /** 0 next to the symbol, n for the n-th leader ring. */
  ring: number;
  /** Point to draw the text at, with `textAnchor` and `baseline`. */
  x: number;
  y: number;
  textAnchor: TextAnchor;
  baseline: 'top' | 'middle' | 'bottom';
  /** `[x, y]` relative to the anchor. */
  offset: Point;
  box: Box | null;
  /** Polyline from the symbol edge to the label, or null. */
  leader: Point[] | null;
  /** A required or pinned label that could not avoid a conflict. */
  overlapping: boolean;
}

export interface PlacementStats {
  placed: number;
  hidden: number;
  overlapping: number;
  /** Candidate tests spent by the optimizer. */
  work: number;
  timings: { setup: number; greedy: number; optimize: number };
}

export interface PlacementResult {
  labels: PlacedLabel[];
  stats: PlacementStats;
}
