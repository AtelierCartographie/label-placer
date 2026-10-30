import type { Box, LabelInput, PlacementResult } from './types.ts';

/**
 * What to look at in a placement, as marks any renderer can draw: overlapping labels, and at
 * the anchor of each hidden one a cross when it was `blocked` (obstacles, bounds), a ring when
 * other labels took its room, with a dashed line to each of them. Labels named by a group's
 * block, and symbols without a label, are left out: nothing to look at there.
 */
export interface DebugMark {
  kind: 'overlapping' | 'blocked' | 'crowded' | 'by';
  /** The label the mark is about. */
  index: number;
  /** SVG path data, in the placement's units. */
  d: string;
  /** What the mark says, for a tooltip: the name and why it is hidden. */
  title: string;
}

export interface DebugOptions {
  /** A name per label, for the titles. Defaults to the labels' ids, else their indices. */
  names?: string[];
  /** Half the size of a cross, in the placement's units. Defaults to 0.3 median label heights. */
  size?: number;
}

const REASONS: Record<string, string> = {
  bounds: 'no spot within the bounds',
  obstacles: 'no spot clear of the obstacles',
  labels: 'its room taken by other labels',
  stack: 'no room left in its stack'
};

const f = (v: number) => +v.toFixed(2);

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[sorted.length >> 1] || 1;
}

/** The marks of a placement: see `DebugMark`. */
export function debugMarks(labels: LabelInput[], result: PlacementResult, options: DebugOptions = {}): DebugMark[] {
  const name = (i: number) => options.names?.[i] ?? String(labels[i].id ?? i);
  const s = options.size ?? 0.3 * median(labels.filter((l) => l.width > 0 && l.height > 0).map((l) => l.height));
  const center = (b: Box) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  const marks: DebugMark[] = [];
  for (const p of result.labels) {
    const l = labels[p.index];
    if (p.visible) {
      if (p.overlapping && p.box) {
        const [x0, y0, x1, y1] = p.box.map(f);
        marks.push({ kind: 'overlapping', index: p.index, d: `M${x0},${y0}H${x1}V${y1}H${x0}Z`, title: `${name(p.index)}: overlapping` });
      }
      continue;
    }
    if (!p.reason || p.reason === 'size' || p.reason === 'group') continue;
    const [x, y] = [f(l.x), f(l.y)];
    const by = p.by.filter((k) => result.labels[k].box);
    const why = by.length ? 'hidden by ' + by.map(name).join(', ') : (REASONS[p.reason] ?? 'hidden');
    const title = `${name(p.index)}: ${why}`;
    if (p.blocked) marks.push({ kind: 'blocked', index: p.index, d: `M${f(x - s)},${f(y - s)}L${f(x + s)},${f(y + s)}M${f(x - s)},${f(y + s)}L${f(x + s)},${f(y - s)}`, title });
    else {
      const r = f(s * 1.33);
      marks.push({ kind: 'crowded', index: p.index, d: `M${f(x + r)},${y}A${r},${r} 0 1,1 ${f(x - r)},${y}A${r},${r} 0 1,1 ${f(x + r)},${y}`, title });
    }
    for (const k of by) {
      const [cx, cy] = center(result.labels[k].box!).map(f);
      marks.push({ kind: 'by', index: p.index, d: `M${x},${y}L${cx},${cy}`, title });
    }
  }
  return marks;
}

const STYLE: Record<DebugMark['kind'], string> = {
  overlapping: 'fill="none" stroke="#d00" stroke-width="1"',
  blocked: 'fill="none" stroke="#d00" stroke-width="1"',
  crowded: 'fill="none" stroke="#d00" stroke-width="1"',
  by: 'fill="none" stroke="#d00" stroke-width="0.5" stroke-dasharray="2,2"'
};

const escape = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The marks as an SVG group, to lay over a rendering made with any tool; with `bounds`, as a
 * whole SVG of that extent.
 */
export function debugSVG(labels: LabelInput[], result: PlacementResult, options: DebugOptions & { bounds?: Box } = {}): string {
  const body = debugMarks(labels, result, options)
    .map((m) => `<path class="lp-${m.kind}" d="${m.d}" ${STYLE[m.kind]}><title>${escape(m.title)}</title></path>`)
    .join('');
  const group = `<g class="label-placer-debug">${body}</g>`;
  const b = options.bounds;
  return b ? `<svg xmlns="http://www.w3.org/2000/svg" width="${f(b[2] - b[0])}" height="${f(b[3] - b[1])}" viewBox="${f(b[0])} ${f(b[1])} ${f(b[2] - b[0])} ${f(b[3] - b[1])}">${group}</svg>` : group;
}
