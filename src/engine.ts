import { buildCandidates, DEFAULT_POSITIONS, makeCandidate, type Candidate, type CandidateSettings } from './candidates.ts';
import { boxesOverlap, segmentHitsBox, segmentsCross } from './geometry.ts';
import { Features } from './features.ts';
import { Grid } from './grid.ts';
import { flushAlignment, leaderGeometry, symbolExtent } from './leader.ts';
import { ObstacleRaster } from './obstacles.ts';
import { boxRelation, boxRingsDistance, ringsBox } from './polygon.ts';
import type { Box, LabelInput, LabelMode, PlaceOptions, PlacedLabel, PlacementResult, Point } from './types.ts';

const MODE_RANK: Record<LabelMode, number> = { pinned: 0, required: 1, optional: 2 };
const MAX_RASTER_CELLS = 4_000_000;
const CHAIN_MAX_EJECT = 2;
const CHAIN_DEPTH = 1;
/** Named anchors closer than this many label heights belong to the same cluster when aligning. */
const ALIGN_REACH = 4;
/** Labels a cluster needs to be set in columns, and at most in one column. */
const ALIGN_MIN = 3;
const ALIGN_MAX = 10;
/** Steps of one label height away from the cluster tried for its column. */
/** Distances tried for a column beyond the cluster, in label heights. */
const COLUMN_STEPS = [0, 1, 2, 3, 4, 6, 8, 11, 15, 20];
/** Work the columns may spend, per label shown: deterministic, like the optimizer's budget. */
const ALIGN_WORK = 1000;
/** Longest leader into a column, in label heights. */
const COLUMN_LEADER = 12;
/** Labels a column may hold, with those it takes along. */
const COLUMN_MAX = 20;

function median(values: number[]): number {
  if (values.length === 0) return 1;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[sorted.length >> 1] || 1;
}

function candidatesConflict(a: Candidate, b: Candidate): boolean {
  if (boxesOverlap(a.x0, a.y0, a.x1, a.y1, b.x0, b.y0, b.x1, b.y1)) return true;
  if (a.leader && leaderHitsBox(a.leader, b)) return true;
  if (b.leader && leaderHitsBox(b.leader, a)) return true;
  if (a.leader && b.leader) {
    for (let i = 1; i < a.leader.length; i++)
      for (let j = 1; j < b.leader.length; j++) {
        const [p, q] = [a.leader[i - 1], a.leader[i]];
        const [r, s] = [b.leader[j - 1], b.leader[j]];
        if (segmentsCross(p[0], p[1], q[0], q[1], r[0], r[1], s[0], s[1])) return true;
      }
  }
  return false;
}

/** Area of the box outside the bounds. */
function areaOutside([x0, y0, x1, y1]: Box, [bx0, by0, bx1, by1]: Box): number {
  const w = Math.max(0, Math.min(x1, bx1) - Math.max(x0, bx0));
  const h = Math.max(0, Math.min(y1, by1) - Math.max(y0, by0));
  return (x1 - x0) * (y1 - y0) - w * h;
}

function leaderHitsBox(leader: Point[], c: Candidate): boolean {
  for (let i = 1; i < leader.length; i++) {
    const [p, q] = [leader[i - 1], leader[i]];
    if (segmentHitsBox(p[0], p[1], q[0], q[1], c.x0, c.y0, c.x1, c.y1)) return true;
  }
  return false;
}

export class Placer {
  readonly labels: LabelInput[];
  readonly current: (Candidate | null)[];
  /** Movable labels: candidates clear of static obstacles. Pinned labels: their single candidate. */
  private readonly feasible: Candidate[][] = [];
  /** Required labels: clean candidates on one more leader ring, tried when the others are taken. */
  private readonly farther: Candidate[][] = [];
  /** Candidates blocked by static obstacles, kept as a last resort for required labels. */
  private readonly blocked: Candidate[][] = [];
  private readonly order: number[];
  /** Position of each label in `order`. */
  private readonly rank: Int32Array;
  private readonly forced = new Set<number>();
  /** Labels that kept their previous placement; polishing leaves them there. */
  private readonly sticky = new Set<number>();
  private readonly grid: Grid;
  private readonly stamp: Int32Array;
  private stampValue = 0;
  private journal: Map<number, Candidate | null> | null = null;
  private readonly bounds: Box;
  /** Ambiguity is costed lazily, once a label has a chance to be shown. */
  private readonly features: Features | null;
  private readonly ambiguityCost: number;
  private readonly ambiguityMargin: number;
  private readonly resolved: Uint8Array;
  private readonly polygons: Grid;
  private readonly polygonBoxes: Box[] = [];
  private readonly settings: CandidateSettings;
  private readonly unit: number;
  private readonly raster: ObstacleRaster;
  private readonly resolution: number;
  private readonly hardRects: Box[] = [];
  private readonly hardMin: number;
  private readonly softCost: number;
  private alignStop = Infinity;
  work = 0;

  constructor(labels: LabelInput[], options: PlaceOptions) {
    this.labels = labels;
    this.bounds = options.bounds;
    const n = labels.length;
    this.current = new Array(n).fill(null);
    this.stamp = new Int32Array(n);
    const unit = median(labels.filter((l) => l.width > 0 && l.height > 0).map((l) => l.height));
    const [bx0, by0, bx1, by1] = options.bounds;
    this.grid = new Grid(bx0, by0, bx1, by1, unit * 2);

    const leader = options.leader === false ? null : (options.leader ?? {});
    const settings: CandidateSettings = (this.settings = {
      positions: options.positions ?? DEFAULT_POSITIONS,
      gap: options.gap ?? 0.2 * unit,
      inside: options.inside ?? true,
      rings: leader ? (leader.rings ?? [unit, 2 * unit]) : [],
      leaderStyle: leader?.style ?? 'octilinear',
      symbolGap: leader?.symbolGap ?? 0.25 * unit,
      minGap: leader?.minGap ?? 0.5 * unit,
      leaderBaseCost: leader?.baseCost ?? 8,
      leaderLengthCost: leader?.lengthCost ?? 2,
      areaOverflowCost: options.areaOverflowCost ?? 6,
      unit
    });
    this.unit = unit;

    const area = Math.max(1e-9, (bx1 - bx0) * (by1 - by0));
    const resolution = options.resolution ?? Math.min(10 / unit, Math.sqrt(MAX_RASTER_CELLS / area));
    const raster = (this.raster = new ObstacleRaster(options.bounds, resolution));
    this.resolution = resolution;
    const hardMin = (this.hardMin = options.symbolObstacles?.hardMinRadius ?? 0.25 * unit);
    this.softCost = options.symbolObstacles?.softCost ?? 6;
    const minObstacle = 0.5 / resolution;
    for (const l of labels) {
      if (l.symbol?.type === 'circle' && l.symbol.radius > 0)
        raster.addCircle(l.x, l.y, Math.max(l.symbol.radius, minObstacle), l.symbol.radius < hardMin);
      else if (l.symbol?.type === 'rect') {
        const { width: w, height: h } = l.symbol;
        raster.addRect([l.x - w / 2, l.y - h / 2, l.x + w / 2, l.y + h / 2], Math.max(w, h) / 2 < hardMin);
      }
    }
    const hardRects = this.hardRects;
    for (const o of options.obstacles ?? []) {
      if (o.type === 'circle') raster.addCircle(o.x, o.y, o.radius, o.soft ?? false);
      else if (o.type === 'line') raster.addLine(o.points, o.soft ?? false);
      else {
        raster.addRect(o.box, o.soft ?? false);
        if (!o.soft) hardRects.push(o.box);
      }
    }
    raster.finalize();

    this.ambiguityCost = options.ambiguity?.cost ?? 6;
    this.ambiguityMargin = options.ambiguity?.margin ?? 0.5 * unit;
    this.features = this.ambiguityCost > 0 ? new Features(labels, options.bounds, unit * 2) : null;
    this.resolved = new Uint8Array(n);
    // Polygons, for a label next to its own one: it must not land in another.
    this.polygons = new Grid(bx0, by0, bx1, by1, unit * 4);
    labels.forEach((l, k) => {
      if (l.symbol?.type !== 'polygon') return;
      const b = (this.polygonBoxes[k] = ringsBox(l.symbol.rings));
      this.polygons.insert(k, b[0], b[1], b[2], b[3]);
    });

    for (let i = 0; i < n; i++) {
      const l = labels[i];
      if (!(l.width > 0 && l.height > 0)) {
        this.feasible.push([]);
        this.farther.push([]);
        this.blocked.push([]);
        continue;
      }
      if (l.callout) {
        // Set once every callout is known, below.
        this.feasible.push([]);
        this.farther.push([]);
        this.blocked.push([]);
        continue;
      }
      if (l.mode === 'pinned') {
        const [ox, oy] = l.offset ?? [0, 0];
        const cx = l.x + ox;
        const cy = l.y + oy;
        const box: Box = [cx - l.width / 2, cy - l.height / 2, cx + l.width / 2, cy + l.height / 2];
        const lead = leader
          ? leaderGeometry({ anchor: [l.x, l.y], symbol: l.symbol, box, style: settings.leaderStyle, symbolGap: settings.symbolGap, minGap: settings.minGap })
          : null;
        this.feasible.push([makeCandidate(box, 0, 'pinned', 0, flushAlignment([l.x, l.y], box), 'middle', lead)]);
        this.farther.push([]);
        this.blocked.push([]);
        continue;
      }
      const rings = l.mode === 'required' && settings.rings.length ? [...settings.rings, Math.max(...settings.rings) + unit] : settings.rings;
      const ok: Candidate[] = [];
      const far: Candidate[] = [];
      const ko: Candidate[] = [];
      for (const c of buildCandidates(l, { ...settings, rings })) (this.classify(i, c) ? ko : c.ring > settings.rings.length ? far : ok).push(c);
      ok.sort((a, b) => a.cost - b.cost);
      far.sort((a, b) => a.cost - b.cost);
      this.feasible.push(ok);
      this.farther.push(far);
      this.blocked.push(ko);
    }

    this.placeCallouts();

    const modeRank = (i: number) => (labels[i].callout ? 0 : MODE_RANK[labels[i].mode ?? 'optional']);
    this.order = labels
      .map((_, i) => i)
      .sort(
        (a, b) =>
          modeRank(a) - modeRank(b) ||
          (labels[b].priority ?? 0) - (labels[a].priority ?? 0) ||
          a - b
      );
    this.rank = new Int32Array(n);
    this.order.forEach((i, r) => (this.rank[i] = r));
  }

  /**
   * Check a candidate against the static obstacles and the bounds, and add their soft costs.
   * Returns whether it is blocked; a blocked candidate gets its hard coverage in `c.hard`. With
   * `leaderOverSymbols`, a leader across a hard symbol only pays, like across a soft one.
   */
  private classify(i: number, c: Candidate, leaderOverSymbols = false): boolean {
    const { raster, unit, softCost } = this;
    const l = this.labels[i];
    const [bx0, by0, bx1, by1] = this.bounds;
    const box: Box = [c.x0, c.y0, c.x1, c.y1];
    const outside = c.bx0 < bx0 || c.by0 < by0 || c.bx1 > bx1 || c.by1 > by1;
    const own = c.placement === 'inside' && this.ownHardCoverage(l, this.hardMin) ? raster.cellCount(box) : 0;
    const coverage = raster.hardCoverage(box) - own;
    const lines = raster.lineCoverage(box);
    // Wholly inside its polygon (the inside candidates are), or wholly outside, and then, unless
    // a leader names it, out of the other polygons.
    const astride =
      l.symbol?.type === 'polygon' &&
      c.placement !== 'center' &&
      (boxRelation(box, l.symbol.rings, this.polygonBoxes[i]) !== 'outside' || (c.ring === 0 && this.inOtherPolygon(i, box)));
    let crossed = 0;
    let softCrossed = 0;
    for (let k = 1; k < (c.leader?.length ?? 0); k++) {
      crossed += raster.coveredLength(...c.leader![k - 1], ...c.leader![k]);
      softCrossed += raster.coveredLength(...c.leader![k - 1], ...c.leader![k], true);
    }
    const hit =
      this.hardRects.some((r) => boxesOverlap(c.x0, c.y0, c.x1, c.y1, r[0], r[1], r[2], r[3])) || coverage > 0 || (crossed > 0 && !leaderOverSymbols) || lines > 0 || astride;
    // A leader over a symbol, or a soft line under a box, counts as a strip one label height wide.
    const over = leaderOverSymbols ? crossed : 0;
    if (softCost > 0) c.cost += (softCost * (raster.softArea(box) + (softCrossed + over + raster.softLineLength(box)) * unit)) / (unit * unit);
    // A leader names its polygon, but the label is still better out of the others.
    if (l.symbol?.type === 'polygon' && c.ring > 0 && this.inOtherPolygon(i, box)) c.cost += this.ambiguityCost;
    if (!outside && !hit) return false;
    const area = (c.x1 - c.x0) * (c.y1 - c.y0);
    c.hard = (coverage + lines) / (this.resolution * this.resolution) + crossed * unit + areaOutside(box, this.bounds) + (astride ? area / 2 : 0);
    return true;
  }

  /**
   * Callouts go in a column along the left or right edge of the bounds, in the order of their
   * anchors as far as their leaders allow: a horizontal leg from the label, then a vertical one
   * to the symbol (boundary labeling).
   */
  private placeCallouts(): void {
    const s = this.settings;
    const [bx0, by0, bx1, by1] = this.bounds;
    const callouts = this.labels.map((_, i) => i).filter((i) => this.labels[i].callout && this.labels[i].width > 0 && this.labels[i].height > 0);
    for (const side of [-1, 1] as const) {
      const group = callouts.filter((i) => {
        const c = this.labels[i].callout;
        return c === 'left' ? side < 0 : c === 'right' ? side > 0 : (this.labels[i].x < (bx0 + bx1) / 2) === side < 0;
      });
      if (!group.length) continue;
      const width = Math.max(...group.map((i) => this.labels[i].width));
      const column = side < 0 ? bx0 + width : bx1 - width;
      const [order, cands] = this.untangle(
        group.slice().sort((a, b) => this.labels[a].y - this.labels[b].y || a - b),
        (o) => this.stack(o, side, column, s.gap, [by0, by1], 'margin', (i, box) => this.calloutLeader(i, box, side))
      );
      order.forEach((i, k) => (this.feasible[i] = [cands[k]]));
    }
  }

  /** Swap neighbours of a stack whose leaders cross, as long as that helps. */
  private untangle(order: number[], build: (order: number[]) => Candidate[]): [number[], Candidate[]] {
    let cands = build(order);
    for (let pass = 0; pass < order.length; pass++) {
      let swapped = false;
      for (let k = 1; k < order.length; k++) {
        if (!candidatesConflict(cands[k - 1], cands[k])) continue;
        const next = order.slice();
        [next[k - 1], next[k]] = [next[k], next[k - 1]];
        const tried = build(next);
        if (candidatesConflict(tried[k - 1], tried[k])) continue;
        [order, cands, swapped] = [next, tried, true];
      }
      if (!swapped) break;
    }
    return [order, cands];
  }

  /**
   * Candidates for labels stacked in a column, in this order, each as close to the height of
   * its anchor as the others allow (isotonic regression), flushed against `column`: right of
   * it when `side` is 1, left of it when -1.
   */
  private stack(
    order: number[],
    side: 1 | -1,
    column: number,
    gap: number,
    [top, bottom]: [number, number],
    placement: 'column' | 'margin',
    leader: (i: number, box: Box) => Point[] | null,
    sizes?: [number, number][]
  ): Candidate[] {
    const size = (k: number) => sizes?.[k] ?? [this.labels[order[k]].width, this.labels[order[k]].height];
    const n = order.length;
    this.work += n;
    // Offsets that keep the boxes apart, then pool adjacent violators on the shifted targets.
    const offset = new Array<number>(n).fill(0);
    for (let k = 1; k < n; k++) offset[k] = offset[k - 1] + (size(k - 1)[1] + size(k)[1]) / 2 + gap;
    const blocks: { sum: number; count: number }[] = [];
    for (let k = 0; k < n; k++) {
      blocks.push({ sum: this.labels[order[k]].y - offset[k], count: 1 });
      while (blocks.length > 1 && blocks[blocks.length - 2].sum / blocks[blocks.length - 2].count > blocks[blocks.length - 1].sum / blocks[blocks.length - 1].count) {
        const b = blocks.pop()!;
        blocks[blocks.length - 1].sum += b.sum;
        blocks[blocks.length - 1].count += b.count;
      }
    }
    const ys: number[] = [];
    for (const b of blocks) for (let k = 0; k < b.count; k++) ys.push(b.sum / b.count + offset[ys.length]);
    // Keep the column within the bounds.
    const low = ys[0] - size(0)[1] / 2 - top;
    const high = ys[n - 1] + size(n - 1)[1] / 2 - bottom;
    const shift = low < 0 ? -low : high > 0 ? -Math.min(high, low) : 0;
    return order.map((i, k) => {
      const [w, h] = size(k);
      const y = ys[k] + shift;
      const box: Box = side > 0 ? [column, y - h / 2, column + w, y + h / 2] : [column - w, y - h / 2, column, y + h / 2];
      const lead = leader(i, box);
      let length = 0;
      for (let p = 1; p < (lead?.length ?? 0); p++) length += Math.hypot(lead![p][0] - lead![p - 1][0], lead![p][1] - lead![p - 1][1]);
      const c = makeCandidate(box, this.settings.leaderBaseCost + (this.settings.leaderLengthCost * length) / this.unit, placement, 1, side > 0 ? 'start' : 'end', 'middle', lead);
      return c;
    });
  }

  /** Orthogonal leader of a callout: horizontal from the label, then vertical to the symbol. */
  private calloutLeader(i: number, box: Box, side: 1 | -1): Point[] | null {
    const l = this.labels[i];
    const { symbolGap } = this.settings;
    const buffered = (e: number) => (e > 0 ? e + symbolGap : 0);
    const py = (box[1] + box[3]) / 2;
    const px = side < 0 ? box[2] : box[0];
    const dy = py - l.y;
    // Towards the label, the row may meet the symbol straight away.
    const e = buffered(symbolExtent(l.symbol, side, 0, [l.x, l.y]));
    if (Math.abs(dy) < e) return [[l.x + side * Math.sqrt(e * e - dy * dy), py], [px, py]];
    if (Math.abs(px - l.x) < 1e-9) return [[l.x, l.y + Math.sign(dy) * buffered(symbolExtent(l.symbol, 0, Math.sign(dy), [l.x, l.y]))], [px, py]];
    const start: Point = [l.x, l.y + Math.sign(dy) * buffered(symbolExtent(l.symbol, 0, Math.sign(dy), [l.x, l.y]))];
    return [start, [l.x, py], [px, py]];
  }

  private ownHardCoverage(l: LabelInput, hardMin: number): boolean {
    return l.symbol?.type === 'circle' ? l.symbol.radius >= hardMin : l.symbol?.type === 'rect' ? Math.max(l.symbol.width, l.symbol.height) / 2 >= hardMin : false;
  }

  /** Add the ambiguity cost to the candidates next to the symbol, once, and sort them again. */
  private resolve(i: number): Candidate[] {
    const list = this.feasible[i];
    if (!this.features || this.resolved[i]) return list;
    this.resolved[i] = 1;
    const symbol = this.labels[i].symbol;
    if (symbol?.type === 'area' || this.fixed(i)) return list;
    for (const c of list) {
      if (c.ring > 0 || c.placement === 'inside' || c.placement === 'center') continue;
      const box: Box = [c.x0, c.y0, c.x1, c.y1];
      const own = symbol?.type === 'polygon' ? boxRingsDistance(box, symbol.rings) : undefined;
      c.cost += this.ambiguityCost * this.features.ambiguity(i, box, this.ambiguityMargin, own);
    }
    list.sort((a, b) => a.cost - b.cost);
    return list;
  }

  /** Whether the box of polygon label i lies in, or across, another label's polygon. */
  private inOtherPolygon(i: number, box: Box): boolean {
    const [i0, j0, i1, j1] = this.polygons.range(box[0], box[1], box[2], box[3]);
    for (let j = j0; j <= j1; j++)
      for (let ii = i0; ii <= i1; ii++)
        for (const k of this.polygons.cells[j * this.polygons.nx + ii]) {
          const s = this.labels[k].symbol;
          if (k !== i && s?.type === 'polygon' && boxRelation(box, s.rings, this.polygonBoxes[k]) !== 'outside') return true;
        }
    return false;
  }

  private priority(i: number): number {
    return this.labels[i].priority ?? 0;
  }

  /** Pinned labels and callouts: placed first, where they were put, never moved. */
  private fixed(i: number): boolean {
    return this.mode(i) === 'pinned' || !!this.labels[i].callout;
  }

  private mode(i: number): LabelMode {
    return this.labels[i].mode ?? 'optional';
  }

  /** Placed labels in conflict with candidate c of label i, up to `limit`. */
  conflicts(i: number, c: Candidate, limit = Infinity): number[] {
    this.work++;
    const out: number[] = [];
    const s = ++this.stampValue;
    const g = this.grid;
    const [i0, j0, i1, j1] = g.range(c.bx0, c.by0, c.bx1, c.by1);
    for (let j = j0; j <= j1; j++)
      for (let ii = i0; ii <= i1; ii++)
        for (const k of g.cells[j * g.nx + ii]) {
          if (k === i || this.stamp[k] === s) continue;
          this.stamp[k] = s;
          const other = this.current[k];
          if (other && candidatesConflict(c, other)) {
            out.push(k);
            if (out.length >= limit) return out;
          }
        }
    return out;
  }

  /** Pinned, forced and sticky labels stay where they are while chains run. */
  private isMovable(i: number): boolean {
    return !this.fixed(i) && !this.forced.has(i) && !this.sticky.has(i);
  }

  private isFree(i: number, c: Candidate): boolean {
    return this.conflicts(i, c, 1).length === 0;
  }

  place(i: number, c: Candidate): void {
    if (this.journal && !this.journal.has(i)) this.journal.set(i, this.current[i]);
    if (this.current[i]) this.unplace(i);
    this.current[i] = c;
    this.grid.insert(i, c.bx0, c.by0, c.bx1, c.by1);
  }

  unplace(i: number): void {
    if (this.journal && !this.journal.has(i)) this.journal.set(i, this.current[i]);
    const c = this.current[i];
    if (!c) return;
    this.grid.remove(i, c.bx0, c.by0, c.bx1, c.by1);
    this.current[i] = null;
  }

  private previous: (string | null)[] | undefined;

  greedy(previous?: (string | null)[]): void {
    this.previous = previous;
    for (const i of this.order) if (this.fixed(i) && this.feasible[i].length) this.place(i, this.feasible[i][0]);
    // Each area first takes a spot inside itself, by priority: a label set outside its own area
    // must not take the room its neighbour needs inside.
    for (const i of this.order) {
      if (this.fixed(i) || this.labels[i].symbol?.type !== 'polygon') continue;
      const inside = this.resolve(i).filter((c) => c.placement === 'center');
      const key = previous?.[i];
      const kept = key ? inside.find((c) => candidateKey(c) === key && this.isFree(i, c)) : undefined;
      if (kept) this.sticky.add(i);
      const chosen = kept ?? inside.find((c) => this.isFree(i, c));
      if (chosen) this.place(i, chosen);
    }
    for (const i of this.order) {
      const list = this.feasible[i];
      if (this.fixed(i) || this.current[i]) continue;
      let chosen: Candidate | null = null;
      const key = previous?.[i];
      if (key) {
        // A leader is kept only while it is needed: a sticky placement stays next to its symbol.
        const sticky = list.find((c) => c.ring === 0 && candidateKey(c) === key);
        if (sticky && this.isFree(i, sticky)) {
          chosen = sticky;
          this.sticky.add(i);
        }
      }
      if (!chosen && list.some((c) => this.isFree(i, c))) chosen = this.resolve(i).find((c) => this.isFree(i, c)) ?? null;
      if (!chosen && this.mode(i) === 'required') {
        this.resolve(i);
        chosen = this.farther[i].find((c) => this.isFree(i, c)) ?? null;
        if (!chosen) {
          chosen = this.leastBad(i, [...list, ...this.farther[i]]) ?? this.leastBad(i, this.blocked[i]);
          if (chosen) this.forced.add(i);
        }
      }
      if (chosen) this.place(i, chosen);
    }
  }

  /** Last resort of a required label: least static hard coverage, then fewest labels overlapped, then lowest cost. */
  private leastBad(i: number, pool: Candidate[]): Candidate | null {
    let best: Candidate | null = null;
    let bestOverlaps = 0;
    for (const c of pool) {
      const overlaps = this.conflicts(i, c).length;
      if (!best || (c.hard - best.hard || overlaps - bestOverlaps || c.cost - best.cost) < 0) {
        best = c;
        bestOverlaps = overlaps;
      }
    }
    return best;
  }

  /**
   * Ejection chains: a hidden label takes a candidate if the at most two labels in its way
   * can move to a free spot (or, through one more ejection, to a spot freed for them). A
   * blocker that cannot move is hidden only when it is optional and of lower priority, so
   * the hierarchy never degrades. A label inside its own area is never ejected.
   */
  chain(maxWork: number, deadline: number): void {
    const stop = () => this.work >= maxWork || performance.now() > deadline;
    let improved = true;
    while (improved && !stop()) {
      improved = false;
      for (const i of this.order) {
        if (stop()) return;
        if (this.current[i] || this.mode(i) !== 'optional' || this.fixed(i)) continue;
        for (const c of this.resolve(i)) {
          if (stop()) return;
          const blockers = this.conflicts(i, c, CHAIN_MAX_EJECT + 1);
          if (blockers.length > CHAIN_MAX_EJECT) continue;
          // A label inside its own area keeps it: no other label may take that room from it.
          if (blockers.some((b) => !this.isMovable(b) || (this.current[b]!.placement === 'center' && this.labels[b].symbol?.type === 'polygon'))) continue;
          this.journal = new Map();
          for (const b of blockers) this.unplace(b);
          this.place(i, c);
          let ok = true;
          for (const b of blockers) {
            if (this.relocate(b, CHAIN_DEPTH, stop)) continue;
            if (this.mode(b) === 'required' || this.priority(b) >= this.priority(i)) {
              ok = false;
              break;
            }
          }
          const journal = this.journal;
          this.journal = null;
          if (ok) {
            improved = true;
            break;
          }
          for (const [t, tc] of journal) {
            this.unplace(t);
            if (tc) this.place(t, tc);
          }
        }
      }
    }
  }

  private relocate(j: number, depth: number, stop: () => boolean): boolean {
    const previous = this.current[j];
    for (const c of this.resolve(j)) {
      if (c !== previous && this.isFree(j, c)) {
        this.place(j, c);
        return true;
      }
    }
    if (depth <= 0 || stop()) return false;
    for (const c of this.feasible[j]) {
      if (c === previous) continue;
      const blockers = this.conflicts(j, c, 2);
      if (blockers.length !== 1) continue;
      const k = blockers[0];
      if (!this.isMovable(k)) continue;
      const kc = this.current[k]!;
      this.unplace(k);
      this.place(j, c);
      if (this.relocate(k, depth - 1, stop)) return true;
      this.unplace(j);
      if (previous) this.place(j, previous);
      this.place(k, kc);
    }
    return false;
  }

  /**
   * Stack the labels of each dense cluster in columns beside it, in the order of their anchors,
   * so that their leaders do not cross: the whole cluster on the right, else on the left, else
   * split at its median between both sides, else only the labels that already needed a leader.
   * Hidden labels of the cluster join when they fit; a label that fits nowhere keeps its place.
   */
  align(): void {
    const s = this.settings;
    if (!s.rings.length) return;
    const near = (a: number, b: number) => Math.hypot(this.labels[a].x - this.labels[b].x, this.labels[a].y - this.labels[b].y) <= ALIGN_REACH * this.unit;
    // The labels shown, and as many hidden ones again, the highest-ranked: a column could show
    // them, while the long tail of a dense map would only cost time.
    const shown = this.order.filter((i) => this.current[i]).length;
    this.alignStop = this.work + ALIGN_WORK * shown;
    let hidden = 0;
    const named = this.order.filter((i) => this.labels[i].width > 0 && this.labels[i].height > 0 && (!!this.current[i] || hidden++ < shown));
    // A cluster too large for one column is split again with a shorter reach, and when its
    // anchors are all that close, cut in two at the median of its longer side.
    const halve = (group: number[]): number[][] => {
      if (group.length <= ALIGN_MAX) return [group];
      const spread = (axis: 'x' | 'y') => Math.max(...group.map((i) => this.labels[i][axis])) - Math.min(...group.map((i) => this.labels[i][axis]));
      const axis = spread('x') >= spread('y') ? 'x' : 'y';
      const sorted = group.slice().sort((a, b) => this.labels[a][axis] - this.labels[b][axis]);
      const mid = sorted.length >> 1;
      const byRank = (g: number[]) => g.sort((a, b) => this.rank[a] - this.rank[b]);
      return [...halve(byRank(sorted.slice(0, mid))), ...halve(byRank(sorted.slice(mid)))];
    };
    const split = (group: number[], reach: number): number[][] =>
      group.length <= ALIGN_MAX
        ? [group]
        : reach < this.unit
          ? halve(group)
          : this.clusters(group, (a, b) => Math.hypot(this.labels[a].x - this.labels[b].x, this.labels[a].y - this.labels[b].y) <= reach).flatMap((g) => split(g, reach * 0.7));
    for (const cluster of this.clusters(named, near).flatMap((g) => split(g, ALIGN_REACH * this.unit * 0.7))) {
      if (cluster.length < ALIGN_MIN) continue;
      // Callouts, pinned, forced, sticky and inside labels stay; so do labels without leaders.
      const members = cluster.filter((i) => {
        const c = this.current[i];
        return this.labels[i].leader !== false && (c ? this.isMovable(i) && c.placement !== 'inside' && c.placement !== 'center' : this.mode(i) === 'optional');
      });
      // Nothing to show nor tidy: no column could be worth it.
      if (members.length < 2 || !members.some((i) => !this.current[i] || this.current[i]!.ring > 0)) continue;
      if (this.column(members, 1) || this.column(members, -1)) continue;
      const xs = members.map((i) => this.labels[i].x).sort((a, b) => a - b);
      const mid = xs[xs.length >> 1];
      const east = members.filter((i) => this.labels[i].x >= mid);
      const west = members.filter((i) => this.labels[i].x < mid);
      const halves = [east.length > 1 && this.column(east, 1), west.length > 1 && this.column(west, -1)];
      if (halves.some(Boolean)) continue;
      for (const side of [1, -1] as const) {
        const led = members.filter((i) => {
          const c = this.current[i];
          return c && c.ring > 0 && ((c.x0 + c.x1) / 2 >= this.labels[i].x ? 1 : -1) === side;
        });
        if (led.length > 1) this.column(led, side);
      }
    }
  }

  /** Groups of labels linked by `near`, each in the order given. */
  private clusters(members: number[], near: (a: number, b: number) => boolean): number[][] {
    const root = members.map((_, k) => k);
    const find = (k: number): number => (root[k] === k ? k : (root[k] = find(root[k])));
    for (let a = 0; a < members.length; a++) for (let b = a + 1; b < members.length; b++) if (near(members[a], members[b])) root[find(a)] = find(b);
    const groups = new Map<number, number[]>();
    members.forEach((i, k) => groups.set(find(k), [...(groups.get(find(k)) ?? []), i]));
    return [...groups.values()];
  }

  /**
   * Set the group in a column beside it, at the distance that keeps the most labels, when that
   * shows hidden labels or tidies two leaders or more; a label that does not fit keeps its
   * place. Returns whether a column was set.
   */
  private column(group: number[], side: 1 | -1): boolean {
    const s = this.settings;
    const edges = group.map((i) => this.labels[i].x + side * symbolExtent(this.labels[i].symbol, side, 0, [this.labels[i].x, this.labels[i].y]));
    const start = (side > 0 ? Math.max(...edges) : Math.min(...edges)) + side * (s.gap + s.rings[0]);
    // Worth it only to show hidden labels, or to tidy labels that already needed a leader. The
    // names it shows count first, then the labels it holds; each label height farther costs
    // an eighth of a name.
    const worth = (kept: number[]) => kept.some((i) => !this.current[i]) || kept.filter((i) => this.current[i]!.ring > 0).length > 1;
    let best: { at: number; kept: number[]; score: number } | null = null;
    for (const attempt of COLUMN_STEPS) {
      if (this.work > this.alignStop) break;
      const at = start + side * attempt * this.unit;
      const kept = this.fitColumn(group, side, at, false);
      const score = (kept?.filter((i) => !this.current[i]).length ?? 0) + (kept?.length ?? 0) / 4 - attempt / 8;
      if (kept && worth(kept) && (!best || score > best.score)) best = { at, kept, score };
      // Farther cannot do better than the whole group.
      if (kept && group.every((i) => kept.includes(i))) break;
    }
    return best !== null && this.fitColumn(best.kept, side, best.at, true) !== null;
  }

  /**
   * The labels that fit in a column at `at`, from the group: a label of the group whose box is
   * blocked, or whose leader crosses another one of the group, leaves it, the lowest-ranked
   * first; a label in the way of the column outside the group joins it if it may move and its
   * anchor is on the column's side of the group, else the label of the group it hinders leaves. Placed for good with `commit`, else put back.
   */
  private fitColumn(group: number[], side: 1 | -1, at: number, commit: boolean): number[] | null {
    const s = this.settings;
    const [, by0, , by1] = this.bounds;
    const lowest = (misfits: number[]) => misfits.reduce((a, b) => (this.rank[a] > this.rank[b] ? a : b));
    const left = new Set<number>();
    let members = group.slice();
    // A label in the way joins only from between the group and the column: from the far side
    // its leader would cross the whole cluster, from beyond the column it would come from outside.
    const reachable = (o: number) =>
      side * (this.labels[o].x - (side > 0 ? Math.min(...members.map((m) => this.labels[m].x)) : Math.max(...members.map((m) => this.labels[m].x)))) >= 0 &&
      side * (at - this.labels[o].x) > 0;
    const drop = (i: number) => {
      left.add(i);
      members = members.filter((m) => m !== i);
    };
    while (members.length > 1 && members.length <= COLUMN_MAX) {
      // A label keeps its layout; a hidden one joins in its main one.
      const size = (i: number): [number, number] => {
        const c = this.current[i];
        return c ? [c.x1 - c.x0, c.y1 - c.y0] : [this.labels[i].width, this.labels[i].height];
      };
      const [order, cands] = this.untangle(
        members.slice().sort((a, b) => this.labels[a].y - this.labels[b].y || a - b),
        (o) =>
          this.stack(o, side, at, s.gap, [by0, by1], 'column', (i, box) =>
            leaderGeometry({ anchor: [this.labels[i].x, this.labels[i].y], symbol: this.labels[i].symbol, box, style: s.leaderStyle, symbolGap: s.symbolGap, minGap: s.minGap }),
          o.map(size))
      );
      cands.forEach((c, k) => (c.layout = this.current[order[k]]?.layout ?? 0));
      // Leaders out of a dense cluster cross its symbols: only the boxes must be clear, and the
      // leaders short enough to read.
      const length = (c: Candidate) => (c.leader ?? []).reduce((sum, p, k, l) => (k ? sum + Math.hypot(p[0] - l[k - 1][0], p[1] - l[k - 1][1]) : 0), 0);
      const blocked = order.filter((i, k) => this.classify(i, cands[k], true) || length(cands[k]) > COLUMN_LEADER * this.unit);
      if (blocked.length) {
        drop(lowest(blocked));
        continue;
      }
      this.journal = new Map();
      for (const i of order) this.unplace(i);
      const clashing: number[] = [];
      const inTheWay = new Set<number>();
      order.forEach((i, k) => {
        const others = this.conflicts(i, cands[k]);
        if (!others.length) return this.place(i, cands[k]);
        clashing.push(i);
        for (const o of others) if (!members.includes(o) && !left.has(o) && this.joins(o) && reachable(o)) inTheWay.add(o);
      });
      const journal = this.journal;
      this.journal = null;
      if (!clashing.length && commit) return members;
      for (const [t, tc] of journal) {
        this.unplace(t);
        if (tc) this.place(t, tc);
      }
      if (!clashing.length) return members;
      if (inTheWay.size) members = [...members, ...inTheWay];
      else drop(lowest(clashing));
    }
    return null;
  }

  /** Whether a placed label may be taken into a column: one that could move there itself. */
  private joins(i: number): boolean {
    const c = this.current[i];
    return !!c && this.isMovable(i) && this.labels[i].leader !== false && !['inside', 'center', 'column', 'margin'].includes(c.placement);
  }

  /** Move each placed label to its best-ranked free candidate. */
  polish(): void {
    for (const i of this.order) {
      const cur = this.current[i];
      if (!cur || this.fixed(i) || this.forced.has(i)) continue;
      if (this.sticky.has(i) && candidateKey(cur) === this.previous?.[i]) continue;
      // A required label on the farther ring takes any free candidate closer in.
      const bound = this.farther[i].includes(cur) ? Infinity : cur.cost;
      for (const c of this.resolve(i)) {
        if (c.cost >= bound) break;
        if (this.isFree(i, c)) {
          this.place(i, c);
          break;
        }
      }
    }
  }

  result(timings: PlacementResult['stats']['timings']): PlacementResult {
    const labels: PlacedLabel[] = this.labels.map((l, i) => {
      const c = this.current[i];
      if (!c)
        return {
          index: i,
          id: l.id,
          visible: false,
          placement: null,
          ring: 0,
          layout: 0,
          x: l.x,
          y: l.y,
          textAnchor: 'middle',
          baseline: 'middle',
          offset: [0, 0],
          box: null,
          leader: null,
          overlapping: false
        };
      const x = c.textAnchor === 'start' ? c.x0 : c.textAnchor === 'end' ? c.x1 : (c.x0 + c.x1) / 2;
      const y = c.baseline === 'top' ? c.y0 : c.baseline === 'bottom' ? c.y1 : (c.y0 + c.y1) / 2;
      return {
        index: i,
        id: l.id,
        visible: true,
        placement: c.placement,
        ring: c.ring,
        layout: c.layout,
        x,
        y,
        textAnchor: c.textAnchor,
        baseline: c.baseline,
        offset: [x - l.x, y - l.y],
        box: [c.x0, c.y0, c.x1, c.y1],
        leader: c.leader,
        overlapping: this.forced.has(i) || (this.fixed(i) && this.conflicts(i, c, 1).length > 0) || this.outOfBounds(c)
      };
    });
    const placed = labels.filter((l) => l.visible).length;
    return {
      labels,
      stats: {
        placed,
        hidden: labels.length - placed,
        overlapping: labels.filter((l) => l.overlapping).length,
        work: this.work,
        timings
      }
    };
  }

  private outOfBounds(c: Candidate): boolean {
    const [x0, y0, x1, y1] = this.bounds;
    return c.x0 < x0 || c.y0 < y0 || c.x1 > x1 || c.y1 > y1;
  }
}

export function candidateKey(c: { placement: string | null; ring: number; layout?: number }): string | null {
  return c.placement ? `${c.placement}:${c.ring}:${c.layout ?? 0}` : null;
}
