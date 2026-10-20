import { buildCandidates, DEFAULT_POSITIONS, makeCandidate, type Candidate, type CandidateSettings } from './candidates.ts';
import { boxesOverlap, segmentHitsBox, segmentsCross } from './geometry.ts';
import { Grid } from './grid.ts';
import { flushAlignment, leaderGeometry } from './leader.ts';
import { ObstacleRaster } from './obstacles.ts';
import type { Box, LabelInput, LabelMode, PlaceOptions, PlacedLabel, PlacementResult, Point } from './types.ts';

const MODE_RANK: Record<LabelMode, number> = { pinned: 0, required: 1, optional: 2 };
const MAX_RASTER_CELLS = 4_000_000;
const CHAIN_MAX_EJECT = 2;
const CHAIN_DEPTH = 1;

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
  /** Candidates blocked by static obstacles, kept as a last resort for required labels. */
  private readonly blocked: Candidate[][] = [];
  private readonly order: number[];
  private readonly forced = new Set<number>();
  /** Labels that kept their previous placement; polishing leaves them there. */
  private readonly sticky = new Set<number>();
  private readonly grid: Grid;
  private readonly stamp: Int32Array;
  private stampValue = 0;
  private journal: Map<number, Candidate | null> | null = null;
  private readonly bounds: Box;
  work = 0;

  constructor(labels: LabelInput[], options: PlaceOptions) {
    this.labels = labels;
    this.bounds = options.bounds;
    const n = labels.length;
    this.current = new Array(n).fill(null);
    this.stamp = new Int32Array(n);
    const unit = median(labels.map((l) => l.height));
    const [bx0, by0, bx1, by1] = options.bounds;
    this.grid = new Grid(bx0, by0, bx1, by1, unit * 2);

    const leader = options.leader === false ? null : (options.leader ?? {});
    const settings: CandidateSettings = {
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
    };

    const area = Math.max(1e-9, (bx1 - bx0) * (by1 - by0));
    const resolution = options.resolution ?? Math.min(10 / unit, Math.sqrt(MAX_RASTER_CELLS / area));
    const raster = new ObstacleRaster(options.bounds, resolution);
    const hardMin = options.symbolObstacles?.hardMinRadius ?? 0.25 * unit;
    const softCost = options.symbolObstacles?.softCost ?? 6;
    const minObstacle = 0.5 / resolution;
    for (const l of labels) {
      if (l.symbol?.type === 'circle' && l.symbol.radius > 0)
        raster.addCircle(l.x, l.y, Math.max(l.symbol.radius, minObstacle), l.symbol.radius < hardMin);
      else if (l.symbol?.type === 'rect') {
        const { width: w, height: h } = l.symbol;
        raster.addRect([l.x - w / 2, l.y - h / 2, l.x + w / 2, l.y + h / 2], Math.max(w, h) / 2 < hardMin);
      }
    }
    const hardRects: Box[] = [];
    for (const o of options.obstacles ?? []) {
      if (o.type === 'circle') raster.addCircle(o.x, o.y, o.radius, o.soft ?? false);
      else {
        raster.addRect(o.box, o.soft ?? false);
        if (!o.soft) hardRects.push(o.box);
      }
    }
    raster.finalize();

    for (let i = 0; i < n; i++) {
      const l = labels[i];
      if (!(l.width > 0 && l.height > 0)) {
        this.feasible.push([]);
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
        this.blocked.push([]);
        continue;
      }
      const ownHard = this.ownHardCoverage(l, hardMin);
      const ok: Candidate[] = [];
      const ko: Candidate[] = [];
      for (const c of buildCandidates(l, settings)) {
        const box: Box = [c.x0, c.y0, c.x1, c.y1];
        const outside = c.x0 < bx0 || c.y0 < by0 || c.x1 > bx1 || c.y1 > by1;
        const own = c.placement === 'inside' && ownHard ? raster.cellCount(box) : 0;
        const hit =
          hardRects.some((r) => boxesOverlap(c.x0, c.y0, c.x1, c.y1, r[0], r[1], r[2], r[3])) ||
          raster.hardCoverage(box) - own > 0 ||
          (c.leader !== null && c.leader.some((p, k) => k > 0 && raster.segmentHitsHard(c.leader![k - 1][0], c.leader![k - 1][1], p[0], p[1])));
        if (softCost > 0) c.cost += (softCost * raster.softArea(box)) / (unit * unit);
        (outside || hit ? ko : ok).push(c);
      }
      ok.sort((a, b) => a.cost - b.cost);
      this.feasible.push(ok);
      this.blocked.push(ko);
    }

    this.order = labels
      .map((_, i) => i)
      .sort(
        (a, b) =>
          MODE_RANK[labels[a].mode ?? 'optional'] - MODE_RANK[labels[b].mode ?? 'optional'] ||
          (labels[b].priority ?? 0) - (labels[a].priority ?? 0) ||
          a - b
      );
  }

  private ownHardCoverage(l: LabelInput, hardMin: number): boolean {
    return l.symbol?.type === 'circle' ? l.symbol.radius >= hardMin : l.symbol?.type === 'rect' ? Math.max(l.symbol.width, l.symbol.height) / 2 >= hardMin : false;
  }

  private priority(i: number): number {
    return this.labels[i].priority ?? 0;
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
    for (const i of this.order) {
      const list = this.feasible[i];
      if (this.mode(i) === 'pinned') {
        if (list.length) this.place(i, list[0]);
        continue;
      }
      let chosen: Candidate | null = null;
      const key = previous?.[i];
      if (key) {
        const sticky = list.find((c) => candidateKey(c) === key);
        if (sticky && this.isFree(i, sticky)) {
          chosen = sticky;
          this.sticky.add(i);
        }
      }
      if (!chosen) chosen = list.find((c) => this.isFree(i, c)) ?? null;
      if (!chosen && this.mode(i) === 'required') {
        let best = Infinity;
        for (const pool of [list, this.blocked[i]]) {
          for (const c of pool) {
            const score = this.conflicts(i, c).length * 1000 + c.cost;
            if (score < best) {
              best = score;
              chosen = c;
            }
          }
          if (chosen) break;
        }
        if (chosen) this.forced.add(i);
      }
      if (chosen) this.place(i, chosen);
    }
  }

  /**
   * Ejection chains: a hidden label takes a candidate if the at most two labels in its way
   * can move to a free spot (or, through one more ejection, to a spot freed for them). A
   * blocker that cannot move is hidden only when it is optional and of lower priority, so
   * the hierarchy never degrades.
   */
  chain(maxWork: number, deadline: number): void {
    const stop = () => this.work >= maxWork || performance.now() > deadline;
    let improved = true;
    while (improved && !stop()) {
      improved = false;
      for (const i of this.order) {
        if (stop()) return;
        if (this.current[i] || this.mode(i) !== 'optional') continue;
        for (const c of this.feasible[i]) {
          if (stop()) return;
          const blockers = this.conflicts(i, c, CHAIN_MAX_EJECT + 1);
          if (blockers.length > CHAIN_MAX_EJECT) continue;
          if (blockers.some((b) => this.mode(b) === 'pinned' || this.forced.has(b))) continue;
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
    for (const c of this.feasible[j]) {
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
      if (this.mode(k) === 'pinned' || this.forced.has(k)) continue;
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

  /** Move each placed label to its best-ranked free candidate. */
  polish(): void {
    for (const i of this.order) {
      const cur = this.current[i];
      if (!cur || this.mode(i) === 'pinned' || this.forced.has(i)) continue;
      if (this.sticky.has(i) && candidateKey(cur) === this.previous?.[i]) continue;
      for (const c of this.feasible[i]) {
        if (c.cost >= cur.cost) break;
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
        x,
        y,
        textAnchor: c.textAnchor,
        baseline: c.baseline,
        offset: [x - l.x, y - l.y],
        box: [c.x0, c.y0, c.x1, c.y1],
        leader: c.leader,
        overlapping: this.forced.has(i) || (this.mode(i) === 'pinned' && this.conflicts(i, c, 1).length > 0) || this.outOfBounds(c)
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

export function candidateKey(c: { placement: string | null; ring: number }): string | null {
  return c.placement ? `${c.placement}:${c.ring}` : null;
}
