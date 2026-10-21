import type { Box } from './types.ts';

/**
 * Static obstacles rasterized once into coverage counts, with summed-area tables so that
 * the coverage of any box costs four lookups. Counts (not a binary mask) let a label
 * inside its own symbol subtract that symbol and still see the others.
 */
export class ObstacleRaster {
  readonly width: number;
  readonly height: number;
  private readonly bx0: number;
  private readonly by0: number;
  private readonly res: number;
  private readonly hard: Uint16Array;
  private readonly soft: Uint16Array;
  private hardSat: Float64Array | null = null;
  private softSat: Float64Array | null = null;
  /** Lines, kept apart because they block label boxes, not leaders. Allocated on first use. */
  private lineHard: Uint16Array | null = null;
  private lineSoft: Uint16Array | null = null;
  private lineHardSat: Float64Array | null = null;
  private lineSoftSat: Float64Array | null = null;

  constructor(bounds: Box, resolution: number) {
    this.bx0 = bounds[0];
    this.by0 = bounds[1];
    this.res = resolution;
    this.width = Math.max(1, Math.ceil((bounds[2] - bounds[0]) * resolution));
    this.height = Math.max(1, Math.ceil((bounds[3] - bounds[1]) * resolution));
    this.hard = new Uint16Array(this.width * this.height);
    this.soft = new Uint16Array(this.width * this.height);
  }

  addCircle(cx: number, cy: number, r: number, soft: boolean): void {
    const target = soft ? this.soft : this.hard;
    const { width: W, height: H, res } = this;
    const px = (cx - this.bx0) * res;
    const py = (cy - this.by0) * res;
    const pr = r * res;
    const j0 = Math.max(0, Math.floor(py - pr));
    const j1 = Math.min(H - 1, Math.ceil(py + pr));
    const i0 = Math.max(0, Math.floor(px - pr));
    const i1 = Math.min(W - 1, Math.ceil(px + pr));
    let marked = false;
    for (let j = j0; j <= j1; j++) {
      const dy = j + 0.5 - py;
      for (let i = i0; i <= i1; i++) {
        const dx = i + 0.5 - px;
        if (dx * dx + dy * dy <= pr * pr) {
          marked = true;
          if (target[j * W + i] < 65535) target[j * W + i]++;
        }
      }
    }
    // A symbol smaller than a cell may cover no cell center: it still marks the cell it sits in.
    const i = Math.floor(px);
    const j = Math.floor(py);
    if (!marked && i >= 0 && j >= 0 && i < W && j < H && target[j * W + i] < 65535) target[j * W + i]++;
  }

  addRect(box: Box, soft: boolean): void {
    const target = soft ? this.soft : this.hard;
    const [i0, j0, i1, j1] = this.cellRange(box);
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) if (target[j * this.width + i] < 65535) target[j * this.width + i]++;
  }

  /** Mark every cell the polyline passes through (Amanatides & Woo traversal). */
  addLine(points: [number, number][], soft: boolean): void {
    const n = this.width * this.height;
    const target = soft ? (this.lineSoft ??= new Uint16Array(n)) : (this.lineHard ??= new Uint16Array(n));
    const { width: W, height: H, res } = this;
    for (let k = 1; k < points.length; k++) {
      const px = (points[k - 1][0] - this.bx0) * res;
      const py = (points[k - 1][1] - this.by0) * res;
      const dx = (points[k][0] - this.bx0) * res - px;
      const dy = (points[k][1] - this.by0) * res - py;
      let i = Math.floor(px);
      let j = Math.floor(py);
      const iEnd = Math.floor(px + dx);
      const jEnd = Math.floor(py + dy);
      const si = Math.sign(dx);
      const sj = Math.sign(dy);
      const ti = si === 0 ? Infinity : Math.abs(1 / dx);
      const tj = sj === 0 ? Infinity : Math.abs(1 / dy);
      let ni = si > 0 ? (i + 1 - px) * ti : si < 0 ? (px - i) * ti : Infinity;
      let nj = sj > 0 ? (j + 1 - py) * tj : sj < 0 ? (py - j) * tj : Infinity;
      for (let steps = Math.abs(iEnd - i) + Math.abs(jEnd - j); steps >= 0; steps--) {
        if (i >= 0 && j >= 0 && i < W && j < H && target[j * W + i] < 65535) target[j * W + i]++;
        if (ni < nj) {
          ni += ti;
          i += si;
        } else {
          nj += tj;
          j += sj;
        }
      }
    }
  }

  finalize(): void {
    this.hardSat = this.sat(this.hard);
    this.softSat = this.sat(this.soft);
    if (this.lineHard) this.lineHardSat = this.sat(this.lineHard);
    if (this.lineSoft) this.lineSoftSat = this.sat(this.lineSoft);
  }

  /** Cells of hard lines under the box (centers inside it). */
  lineCoverage(box: Box): number {
    return this.lineHardSat ? this.sum(this.lineHardSat, box) : 0;
  }

  /** Length of soft lines under the box, in units, counted one cell per cell. */
  softLineLength(box: Box): number {
    return this.lineSoftSat ? this.sum(this.lineSoftSat, box) / this.res : 0;
  }

  /** Summed hard coverage of the cells whose centers lie inside the box. */
  hardCoverage(box: Box): number {
    return this.sum(this.hardSat!, box);
  }

  /** Soft coverage area, in squared units. */
  softArea(box: Box): number {
    return this.sum(this.softSat!, box) / (this.res * this.res);
  }

  /** Number of cells whose centers lie inside the box. */
  cellCount(box: Box): number {
    const [i0, j0, i1, j1] = this.cellRange(box);
    return Math.max(0, i1 - i0) * Math.max(0, j1 - j0);
  }

  /** Length of the segment over hard (or soft) coverage, sampled once per cell. */
  coveredLength(ax: number, ay: number, bx: number, by: number, soft = false): number {
    const { width: W, height: H, res } = this;
    const target = soft ? this.soft : this.hard;
    const length = Math.hypot(bx - ax, by - ay);
    const steps = Math.ceil(length * res);
    let hits = 0;
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const i = Math.floor((ax + (bx - ax) * t - this.bx0) * res);
      const j = Math.floor((ay + (by - ay) * t - this.by0) * res);
      if (i >= 0 && j >= 0 && i < W && j < H && target[j * W + i] > 0) hits++;
    }
    return (hits * length) / steps;
  }

  private cellRange(box: Box): [number, number, number, number] {
    const { res } = this;
    const i0 = Math.max(0, Math.ceil((box[0] - this.bx0) * res - 0.5));
    const i1 = Math.min(this.width, Math.floor((box[2] - this.bx0) * res - 0.5) + 1);
    const j0 = Math.max(0, Math.ceil((box[1] - this.by0) * res - 0.5));
    const j1 = Math.min(this.height, Math.floor((box[3] - this.by0) * res - 0.5) + 1);
    return [i0, j0, i1, j1];
  }

  private sum(t: Float64Array, box: Box): number {
    const [i0, j0, i1, j1] = this.cellRange(box);
    if (i1 <= i0 || j1 <= j0) return 0;
    const w = this.width + 1;
    return t[j1 * w + i1] - t[j0 * w + i1] - t[j1 * w + i0] + t[j0 * w + i0];
  }

  private sat(m: Uint16Array): Float64Array {
    const W = this.width;
    const w = W + 1;
    const t = new Float64Array(w * (this.height + 1));
    for (let j = 0; j < this.height; j++) {
      let row = 0;
      for (let i = 0; i < W; i++) {
        row += m[j * W + i];
        t[(j + 1) * w + i + 1] = t[j * w + i + 1] + row;
      }
    }
    return t;
  }
}
