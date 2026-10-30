import { boxesOverlap } from './geometry.ts';
import { ObstacleRaster } from './obstacles.ts';
import type { Box, LabelInput, Obstacle } from './types.ts';

/** Where a block goes: a corner of the bounds, or the middle of an edge, slid along it if need be. */
export type BlockPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top' | 'right' | 'bottom' | 'left';

export interface BlockInput {
  id?: string | number;
  /** Size of the block, in the caller's units: a legend, a title, a scale, an inset map. */
  width: number;
  height: number;
  /** Where it may go, in order of preference. Defaults to the option, else the corners then the edges. */
  positions?: BlockPosition[];
}

export interface BlockOptions {
  bounds: [number, number, number, number];
  obstacles?: Obstacle[];
  /**
   * The labels to place next: a block never covers their symbols (nor their bare anchors), and
   * keeps off the room their names need around them, the most important first.
   */
  labels?: LabelInput[];
  /** Space kept between a block and the edges of the bounds, and between blocks. Defaults to 0. */
  margin?: number;
  /** Positions tried, in order of preference, for blocks that give none. */
  positions?: BlockPosition[];
  /** Cost, in position ranks, of the room of the most important name wholly under a block. Defaults to 4. */
  roomCost?: number;
}

export interface PlacedBlock {
  index: number;
  id: string | number | undefined;
  /** Where the block goes. Pass it to `placeLabels` as a hard `rect` obstacle. */
  box: Box;
  position: BlockPosition;
  /** Its cost: rank of the position, distance slid, soft obstacles and the room of the names under it. */
  cost: number;
  /** No spot was clear of the hard obstacles and the symbols: this one covers the least of them. */
  overlapping: boolean;
}

export const DEFAULT_BLOCK_POSITIONS: BlockPosition[] = ['bottom-left', 'top-left', 'bottom-right', 'top-right', 'bottom', 'top', 'left', 'right'];

/** Steps of a slide along an edge, in blocks: a quarter of the block's own length each. */
const SLIDE_STEP = 0.25;
/** Cost of a position rank, and of a slide by the block's own length. */
const RANK_COST = 0.5;
const SLIDE_COST = 1;
const ROOM_COST = 4;
/** A block wholly over the areas of the labels (polygons): as over land. */
const AREA_COST = 2.5;
/** Soft obstacles: cost per median-label-height² covered, as for labels. */
const SOFT_COST = 6;

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[sorted.length >> 1] || 0;
}

/** Overlap area of two boxes. */
function overlapArea(a: Box, b: Box): number {
  return Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
}

/**
 * Find the emptiest spot for each block, in order, before the names: along the edges of the
 * bounds, clear of the hard obstacles and of the labels' symbols, as little as can be over soft
 * obstacles (land, coastlines) and over the room the names need. Each block placed is an
 * obstacle for the next. Give the boxes to `placeLabels` as hard `rect` obstacles.
 */
export function placeBlocks(blocks: BlockInput[], options: BlockOptions): PlacedBlock[] {
  const { bounds, obstacles = [], labels = [], margin = 0, roomCost = ROOM_COST } = options;
  const [bx0, by0, bx1, by1] = bounds;
  const named = labels.filter((l) => l.width > 0 && l.height > 0);
  const unit = median(named.map((l) => l.height)) || Math.max(1, median(blocks.map((b) => Math.min(b.width, b.height))) / 4);
  const resolution = Math.min(10 / unit, Math.sqrt(4e6 / Math.max(1e-9, (bx1 - bx0) * (by1 - by0))));
  const raster = new ObstacleRaster(bounds, resolution);
  const hardRects: Box[] = [];
  for (const o of obstacles) {
    if (o.type === 'circle') raster.addCircle(o.x, o.y, o.radius, o.soft ?? false);
    else if (o.type === 'line') raster.addLine(o.points, o.soft ?? false);
    else if (o.type === 'polygon') raster.addPolygon(o.rings, o.soft ?? false, o.cost ?? 1);
    else {
      raster.addRect(o.box, o.soft ?? false);
      if (!o.soft) hardRects.push(o.box);
    }
  }
  // Every point symbol is data a block must not hide, however small; a bare anchor too. Areas
  // may fill the map: a block over one only costs, as over land.
  const minimum = 0.5 / resolution;
  for (const l of labels) {
    const s = l.symbol;
    if (s?.type === 'circle') raster.addCircle(l.x, l.y, Math.max(s.radius, minimum), false);
    else if (s?.type === 'rect') raster.addRect([l.x - s.width / 2, l.y - s.height / 2, l.x + s.width / 2, l.y + s.height / 2], false);
    else if (s?.type === 'polygon') raster.addPolygon(s.rings, true, AREA_COST);
    else if (s?.type !== 'area') raster.addCircle(l.x, l.y, minimum, false);
  }
  raster.finalize();

  // The room a name needs: its width on either side of the anchor, its height above and below.
  // The most important names weigh most: the first counts 1, the last a quarter.
  const byPriority = named.slice().sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  const rooms = byPriority.map((l, k): { box: Box; weight: number } => ({
    box: [l.x - l.width, l.y - l.height, l.x + l.width, l.y + l.height],
    weight: 1 - (0.75 * k) / Math.max(1, byPriority.length - 1)
  }));

  const placed: PlacedBlock[] = [];
  blocks.forEach((block, index) => {
    const { width: w, height: h } = block;
    const positions = block.positions ?? options.positions ?? DEFAULT_BLOCK_POSITIONS;
    // Inner bounds, the margin left to the edges.
    const [x0, y0, x1, y1] = [bx0 + margin, by0 + margin, bx1 - margin, by1 - margin];
    let best: { box: Box; position: BlockPosition; cost: number; hard: number } | null = null;
    positions.forEach((position, rank) => {
      const [vertical, horizontal] = position.includes('-') ? position.split('-') : position === 'top' || position === 'bottom' ? [position, 'middle'] : ['middle', position];
      const left = horizontal === 'left' ? x0 : horizontal === 'right' ? x1 - w : (x0 + x1 - w) / 2;
      const top = vertical === 'top' ? y0 : vertical === 'bottom' ? y1 - h : (y0 + y1 - h) / 2;
      // Slides along the edges the spot touches: from a corner along both, from a middle both ways.
      const slides: [number, number][] = [[0, 0]];
      const along = (dx: number, dy: number, length: number) => {
        const step = SLIDE_STEP * length;
        for (let k = 1; ; k++) {
          const sx = left + dx * k * step;
          const sy = top + dy * k * step;
          if (sx < x0 - 1e-9 || sy < y0 - 1e-9 || sx + w > x1 + 1e-9 || sy + h > y1 + 1e-9) break;
          slides.push([dx * k * step, dy * k * step]);
        }
      };
      if (vertical !== 'middle') {
        if (horizontal !== 'right') along(1, 0, w);
        if (horizontal !== 'left') along(-1, 0, w);
      }
      if (horizontal !== 'middle') {
        if (vertical !== 'bottom') along(0, 1, h);
        if (vertical !== 'top') along(0, -1, h);
      }
      for (const [dx, dy] of slides) {
        const box: Box = [left + dx, top + dy, left + dx + w, top + dy + h];
        if (box[0] < bx0 - 1e-9 || box[1] < by0 - 1e-9 || box[2] > bx1 + 1e-9 || box[3] > by1 + 1e-9) continue;
        const spaced: Box = [box[0] - margin, box[1] - margin, box[2] + margin, box[3] + margin];
        const others = placed.reduce((sum, p) => sum + overlapArea(spaced, p.box), 0);
        const rects = hardRects.reduce((sum, r) => sum + (boxesOverlap(box[0], box[1], box[2], box[3], r[0], r[1], r[2], r[3]) ? overlapArea(box, r) : 0), 0);
        const hard = raster.hardCoverage(box) / (resolution * resolution) + raster.lineCoverage(box) / resolution + rects + others;
        const slid = Math.abs(dx) / w + Math.abs(dy) / h;
        let room = 0;
        for (const r of rooms) {
          const a = overlapArea(box, r.box);
          if (a > 0) room += (r.weight * a) / ((r.box[2] - r.box[0]) * (r.box[3] - r.box[1]));
        }
        const cost =
          RANK_COST * rank +
          SLIDE_COST * slid +
          roomCost * room +
          (SOFT_COST * (raster.softArea(box) + raster.softLineLength(box) * unit)) / (unit * unit) +
          raster.polygonCost(box);
        if (!best || (hard > 0 || best.hard > 0 ? hard - best.hard || cost - best.cost : cost - best.cost) < 0) best = { box, position, cost, hard };
      }
    });
    // A block larger than the bounds: at the first position, over the edges.
    const chosen = best ?? { box: [bx0 + margin, by0 + margin, bx0 + margin + w, by0 + margin + h] as Box, position: positions[0], cost: Infinity, hard: Infinity };
    placed.push({ index, id: block.id, box: chosen.box, position: chosen.position, cost: chosen.cost, overlapping: chosen.hard > 0 });
  });
  return placed;
}
