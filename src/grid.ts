/** Uniform grid of ids by bounding box, with removal. */
export class Grid {
  readonly cells: number[][];
  readonly nx: number;
  readonly ny: number;
  private readonly x0: number;
  private readonly y0: number;
  private readonly size: number;

  constructor(x0: number, y0: number, x1: number, y1: number, size: number) {
    this.x0 = x0;
    this.y0 = y0;
    this.size = size;
    this.nx = Math.max(1, Math.ceil((x1 - x0) / size));
    this.ny = Math.max(1, Math.ceil((y1 - y0) / size));
    this.cells = Array.from({ length: this.nx * this.ny }, () => []);
  }

  /** Cell range `[i0, j0, i1, j1]` covering the box, clamped to the grid. */
  range(x0: number, y0: number, x1: number, y1: number): [number, number, number, number] {
    const clampX = (v: number) => Math.min(this.nx - 1, Math.max(0, Math.floor((v - this.x0) / this.size)));
    const clampY = (v: number) => Math.min(this.ny - 1, Math.max(0, Math.floor((v - this.y0) / this.size)));
    return [clampX(x0), clampY(y0), clampX(x1), clampY(y1)];
  }

  insert(id: number, x0: number, y0: number, x1: number, y1: number): void {
    const [i0, j0, i1, j1] = this.range(x0, y0, x1, y1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.cells[j * this.nx + i].push(id);
  }

  remove(id: number, x0: number, y0: number, x1: number, y1: number): void {
    const [i0, j0, i1, j1] = this.range(x0, y0, x1, y1);
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const cell = this.cells[j * this.nx + i];
        const k = cell.indexOf(id);
        if (k >= 0) {
          cell[k] = cell[cell.length - 1];
          cell.pop();
        }
      }
  }
}
