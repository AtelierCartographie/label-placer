import { describe, expect, it } from 'vitest';
import { placeText } from '../src/plot.ts';
import type { PlacementResult } from '../src/index.ts';

// Just enough of a DOM for the adapter: elements with attributes, children and text.
class FakeElement {
  tagName: string;
  attributes = new Map<string, string>();
  children: FakeElement[] = [];
  parent: FakeElement | null = null;
  textContent = '';
  constructor(tag: string) {
    this.tagName = tag;
  }
  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  append(...nodes: FakeElement[]) {
    for (const n of nodes) {
      n.parent = this;
      this.children.push(n);
    }
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
  }
}
const document = { createElementNS: (_: string, tag: string) => new FakeElement(tag), createElement: (tag: string) => new FakeElement(tag) };

/** A text mark as Plot hands it to `render`: a typed index and the default rendering from `next`. */
function render(names: string[], x: number[], y: number[], options: Parameters<typeof placeText>[0], r?: number[], projection?: unknown) {
  const index = Uint32Array.from(names.keys());
  const next = () => {
    const g = new FakeElement('g');
    for (const i of index) {
      const t = new FakeElement('text');
      t.textContent = names[i];
      g.append(t);
    }
    return g;
  };
  const dimensions = { width: 400, height: 300, marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0 };
  const context = { document, ownerSVGElement: new FakeElement('svg'), projection };
  const fn = placeText(options) as unknown as (...args: unknown[]) => FakeElement;
  return fn(index, {}, { x, y, text: names, r }, dimensions, context, next);
}

describe('placeText', () => {
  it('moves the texts of a Plot text mark to their places and draws the leaders', () => {
    let result: PlacementResult | undefined;
    const out = render(['Alpha', 'Beta'], [100, 300], [100, 200], { onPlace: (r) => (result = r) }, [5, 5]);
    expect(result!.stats.placed).toBe(2);
    const [leaders, texts] = out.children;
    expect(texts.children).toHaveLength(2);
    // Right of its circle by default, flushed left, centred on its box.
    const alpha = texts.children[0];
    expect(alpha.getAttribute('text-anchor')).toBe('start');
    expect(alpha.getAttribute('transform')).toMatch(/^translate\(10\d\.\d*,100\)$/);
    expect(leaders.children).toHaveLength(0);
  });

  it('removes the hidden labels, and marks them in debug mode', () => {
    let result: PlacementResult | undefined;
    // Two labels on the same anchor, with no leader and a single position: one has to go.
    const options = { positions: ['right' as const], leader: false as const, onPlace: (r: PlacementResult) => (result = r) };
    const out = render(['Alpha', 'Beta'], [100, 100], [100, 100], options);
    expect(out.children[1].children).toHaveLength(1);
    expect(result!.labels.filter((l) => !l.visible && !l.blocked)).toHaveLength(1);
    const debug = render(['Alpha', 'Beta'], [100, 100], [100, 100], { ...options, debug: true });
    expect(debug.children[2].children).toHaveLength(1);
  });

  it('dodges the names at the ends of lines, right of their anchors', () => {
    let result: PlacementResult | undefined;
    const out = render(['Alpha', 'Beta'], [300, 300], [100, 102], { dodge: 'right', onPlace: (r) => (result = r) });
    expect(result!.labels.map((l) => l.placement)).toEqual(['dodge', 'dodge']);
    const [first, second] = result!.labels;
    expect(first.y).toBeLessThan(second.y);
    expect(first.box![3]).toBeLessThanOrEqual(second.box![1]);
    expect(out.children[0].children).toHaveLength(2);
  });

  it('tells a label blocked by an obstacle from one crowded out', () => {
    let result: PlacementResult | undefined;
    render(['Alpha'], [100], [100], { positions: ['right'], leader: false, obstacles: [{ type: 'rect', box: [90, 80, 200, 120] }], onPlace: (r) => (result = r) });
    expect(result!.labels[0].blocked).toBe(true);
    expect(result!.stats.blocked).toBe(1);
  });

  it('projects the land through the plot projection, so that names prefer the sea', () => {
    // An identity projection: longitude and latitude are already pixels.
    const projection = {
      stream: (sink: { point(x: number, y: number): void }) => sink
    };
    const land = { type: 'Polygon', coordinates: [[[105, 0], [400, 0], [400, 300], [105, 300], [105, 0]]] };
    let result: PlacementResult | undefined;
    render(['Alpha'], [100], [100], { land, positions: ['right', 'left'], onPlace: (r) => (result = r) }, [3], projection);
    expect(result!.labels[0].placement).toBe('left');
    render(['Alpha'], [100], [100], { positions: ['right', 'left'], onPlace: (r) => (result = r) }, [3], projection);
    expect(result!.labels[0].placement).toBe('right');
  });
});
