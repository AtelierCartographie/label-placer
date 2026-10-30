import { describe, expect, it } from 'vitest';
import { placeBlocks, placeLabels } from '../src/index.ts';
import type { Box, LabelInput } from '../src/index.ts';

const bounds: Box = [0, 0, 600, 400];
const legend = { id: 'legend', width: 120, height: 80 };
const dot = (x: number, y: number, extra: Partial<LabelInput> = {}): LabelInput => ({ x, y, width: 40, height: 10, symbol: { type: 'circle', radius: 3 }, ...extra });
const overlaps = (a: Box, b: Box) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

describe('placeBlocks', () => {
  it('puts a block in the first corner of an empty page, the margin left to the edges', () => {
    const [b] = placeBlocks([legend], { bounds, margin: 10 });
    expect(b).toMatchObject({ index: 0, id: 'legend', position: 'bottom-left', box: [10, 310, 130, 390], overlapping: false });
  });

  it('moves away from symbols, and from the room their names need', () => {
    // Towns in the bottom left: the legend goes to the next corner.
    const towns = [dot(40, 360), dot(90, 330), dot(60, 300)];
    const [b] = placeBlocks([legend], { bounds, labels: towns });
    expect(b.position).toBe('top-left');
    // A town just outside the corner: its name keeps its first spot, right of it, with the block.
    const town = dot(150, 370);
    const near = placeBlocks([legend], { bounds, labels: [town] })[0];
    expect(overlaps(near.box, [147, 367, 153, 373])).toBe(false);
    const named = placeLabels([town], { bounds, obstacles: [{ type: 'rect', box: near.box }] }).labels[0];
    expect(named).toMatchObject({ visible: true, placement: 'right', ring: 0 });
  });

  it('slides along the edge past a symbol in the corner', () => {
    const [b] = placeBlocks([legend], { bounds, labels: [dot(5, 395, { width: 0, height: 0 })] });
    expect(b.position).toBe('bottom-left');
    expect(b.box[0]).toBeGreaterThan(8);
    expect(b.box[3]).toBe(400);
  });

  it('prefers the sea when the land is a soft polygon', () => {
    const land = { type: 'polygon' as const, rings: [[[0, 0], [400, 0], [400, 400], [0, 400]] as [number, number][]], soft: true, cost: 2.5 };
    const [b] = placeBlocks([legend], { bounds, obstacles: [land] });
    expect(b.box[0]).toBeGreaterThanOrEqual(400);
  });

  it('places blocks in turn, each clear of the others by the margin', () => {
    const blocks = placeBlocks([legend, { id: 'title', width: 300, height: 30, positions: ['top', 'top-left'] }, { id: 'scale', width: 120, height: 20 }], { bounds, margin: 8 });
    expect(blocks.map((b) => b.position)).toEqual(['bottom-left', 'top', 'top-left']);
    for (let a = 0; a < 3; a++)
      for (let c = a + 1; c < 3; c++) {
        const [p, q] = [blocks[a].box, blocks[c].box];
        expect(overlaps([p[0] - 8, p[1] - 8, p[2] + 8, p[3] + 8], q)).toBe(false);
      }
  });

  it('flags a block with no clear spot, on the one that covers the least', () => {
    const wall = { type: 'rect' as const, box: [0, 0, 600, 350] as Box };
    const [b] = placeBlocks([legend], { bounds, obstacles: [wall] });
    expect(b.overlapping).toBe(true);
    expect(b.box[3]).toBe(400);
  });

  it('leaves the names their room: as many placed with the block as without it, on a free corner', () => {
    // Towns along the bottom, none at the top.
    const towns = Array.from({ length: 12 }, (_, k) => dot(30 + k * 48, 340 + (k % 3) * 18, { priority: k }));
    const [b] = placeBlocks([legend], { bounds, labels: towns, margin: 10 });
    expect(b.box[1]).toBeLessThan(200);
    const without = placeLabels(towns, { bounds }).stats.placed;
    const withBlock = placeLabels(towns, { bounds, obstacles: [{ type: 'rect', box: b.box }] }).stats.placed;
    expect(withBlock).toBe(without);
  });
});
