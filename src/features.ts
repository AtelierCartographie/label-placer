import type { Box, LabelInput } from './types.ts';

/**
 * Point features (symbols, or bare anchors) in a static grid of typed arrays, to tell how
 * ambiguous a label is: as close to another feature as to its own.
 */
export class Features {
  private readonly x: Float64Array;
  private readonly y: Float64Array;
  /** Half extents; a circle has its radius in both. */
  private readonly hw: Float64Array;
  private readonly hh: Float64Array;
  private readonly round: Uint8Array;
  /** Compressed grid: the features of cell c are items[start[c]] to items[start[c + 1] - 1]. */
  private readonly start: Int32Array;
  private readonly items: Int32Array;
  private readonly nx: number;
  private readonly ny: number;
  private readonly x0: number;
  private readonly y0: number;
  private readonly size: number;
  private readonly seen: Int32Array;
  private visit = 0;

  constructor(labels: LabelInput[], bounds: Box, size: number) {
    const n = labels.length;
    this.x = new Float64Array(n);
    this.y = new Float64Array(n);
    this.hw = new Float64Array(n);
    this.hh = new Float64Array(n);
    this.round = new Uint8Array(n);
    this.seen = new Int32Array(n);
    this.x0 = bounds[0];
    this.y0 = bounds[1];
    this.size = size;
    this.nx = Math.max(1, Math.ceil((bounds[2] - bounds[0]) / size));
    this.ny = Math.max(1, Math.ceil((bounds[3] - bounds[1]) / size));

    // Areas are labelled at an interior point, which is not a feature on the map.
    const ranges: [number, number, number, number][] = [];
    const counts = new Int32Array(this.nx * this.ny + 1);
    labels.forEach((l, k) => {
      const s = l.symbol;
      this.x[k] = l.x;
      this.y[k] = l.y;
      if (s?.type === 'circle') {
        this.hw[k] = this.hh[k] = s.radius;
        this.round[k] = 1;
      } else if (s?.type === 'rect') {
        this.hw[k] = s.width / 2;
        this.hh[k] = s.height / 2;
      }
      if (s?.type === 'area') return;
      const r = this.range(l.x - this.hw[k], l.y - this.hh[k], l.x + this.hw[k], l.y + this.hh[k]);
      ranges[k] = r;
      for (let j = r[1]; j <= r[3]; j++) for (let i = r[0]; i <= r[2]; i++) counts[j * this.nx + i + 1]++;
    });
    for (let c = 1; c < counts.length; c++) counts[c] += counts[c - 1];
    this.start = counts.slice();
    this.items = new Int32Array(counts[counts.length - 1]);
    ranges.forEach((r, k) => {
      for (let j = r[1]; j <= r[3]; j++) for (let i = r[0]; i <= r[2]; i++) this.items[counts[j * this.nx + i]++] = k;
    });
  }

  /** Distance from the box to feature k: to its circle or rectangle, or to its anchor. */
  distance(k: number, x0: number, y0: number, x1: number, y1: number): number {
    const x = this.x[k];
    const y = this.y[k];
    if (this.round[k]) return Math.max(0, Math.hypot(Math.max(0, x0 - x, x - x1), Math.max(0, y0 - y, y - y1)) - this.hw[k]);
    const hw = this.hw[k];
    const hh = this.hh[k];
    return Math.hypot(Math.max(0, x0 - x - hw, x - hw - x1), Math.max(0, y0 - y - hh, y - hh - y1));
  }

  /**
   * From 0, every other feature at least `margin` farther from the box than feature i, to 1,
   * one as close. A feature whose anchor the box covers is hidden by the label: the soft
   * cost handles it.
   */
  ambiguity(i: number, [x0, y0, x1, y1]: Box, margin: number): number {
    const reach = this.distance(i, x0, y0, x1, y1) + margin;
    const [i0, j0, i1, j1] = this.range(x0 - reach, y0 - reach, x1 + reach, y1 + reach);
    const visit = ++this.visit;
    let worst = 0;
    for (let j = j0; j <= j1; j++)
      for (let c = j * this.nx + i0, end = j * this.nx + i1; c <= end; c++)
        for (let p = this.start[c], q = this.start[c + 1]; p < q; p++) {
          const k = this.items[p];
          if (k === i || this.seen[k] === visit) continue;
          this.seen[k] = visit;
          const x = this.x[k];
          const y = this.y[k];
          if (x > x0 && x < x1 && y > y0 && y < y1) continue;
          const d = this.distance(k, x0, y0, x1, y1);
          if (d >= reach) continue;
          if (margin <= 0 || d <= reach - margin) return 1;
          worst = Math.max(worst, (reach - d) / margin);
        }
    return worst;
  }

  private range(x0: number, y0: number, x1: number, y1: number): [number, number, number, number] {
    const cx = (v: number) => Math.min(this.nx - 1, Math.max(0, Math.floor((v - this.x0) / this.size)));
    const cy = (v: number) => Math.min(this.ny - 1, Math.max(0, Math.floor((v - this.y0) / this.size)));
    return [cx(x0), cy(y0), cx(x1), cy(y1)];
  }
}
