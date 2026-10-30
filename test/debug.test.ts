import { describe, expect, it } from 'vitest';
import { debugMarks, debugSVG, placeLabels } from '../src/index.ts';
import type { LabelInput } from '../src/index.ts';

const at = (id: string, x: number, y: number, extra: Partial<LabelInput> = {}): LabelInput => ({ id, x, y, width: 40, height: 10, symbol: { type: 'circle', radius: 2 }, leader: false, ...extra });
const labels = [
  // Walled in by a hard obstacle.
  at('walled', 300, 100),
  // Two on one spot with one position: the lower one goes, behind the higher one.
  at('high', 100, 200, { priority: 2 }),
  at('low', 100, 200, { priority: 1, width: 60 }),
  // Required and walled in too: forced onto the obstacle, overlapping.
  at('forced', 300, 90, { mode: 'required' }),
  // A symbol alone.
  at('symbol', 50, 50, { width: 0, height: 0 })
];
const result = placeLabels(labels, { bounds: [0, 0, 400, 300], positions: ['right'], obstacles: [{ type: 'rect', box: [230, 60, 370, 140] }] });

describe('debugMarks', () => {
  it('marks what to look at: a cross where obstacles block, a ring and lines where labels crowd, overlapping boxes', () => {
    const marks = debugMarks(labels, result);
    expect(marks.map((m) => [m.kind, labels[m.index].id])).toEqual([
      ['blocked', 'walled'],
      ['crowded', 'low'],
      ['by', 'low'],
      ['overlapping', 'forced']
    ]);
    expect(marks[0].title).toBe('walled: no spot clear of the obstacles');
    expect(marks[1].title).toBe('low: hidden by high');
    // The lines run from the hidden label's anchor to the middle of each label in its way.
    const box = result.labels[1].box!;
    expect(marks[2].d).toBe(`M100,200L${+((box[0] + box[2]) / 2).toFixed(2)},${+((box[1] + box[3]) / 2).toFixed(2)}`);
    // The cross: 0.3 label heights each way.
    expect(marks[0].d).toBe('M297,97L303,103M297,103L303,97');
  });

  it('takes names and a size', () => {
    const marks = debugMarks(labels, result, { names: ['Mur', 'Haut', 'Bas', 'Forcé', 'Point'], size: 5 });
    expect(marks[1].title).toBe('Bas: hidden by Haut');
    expect(marks[0].d).toBe('M295,95L305,105M295,105L305,95');
  });
});

describe('debugSVG', () => {
  it('draws the marks as an SVG group with titles, or as a whole SVG of the bounds', () => {
    const g = debugSVG(labels, result);
    expect(g.startsWith('<g class="label-placer-debug">')).toBe(true);
    expect(g.match(/<path /g)).toHaveLength(4);
    expect(g).toContain('<title>low: hidden by high</title>');
    expect(g).toContain('stroke-dasharray="2,2"');
    const svg = debugSVG(labels, result, { bounds: [0, 0, 400, 300] });
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="400" height="300" viewBox="0 0 400 300"><g /);
    expect(debugSVG(labels, result, { names: ['<a>', 'b & c', 'd', 'e', 'f'] })).toContain('&lt;a&gt;: no spot');
  });
});
