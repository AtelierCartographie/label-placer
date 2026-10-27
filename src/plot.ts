import { placeLabels } from './index.ts';
import type { LabelInput, LabelMode, Obstacle, PlaceOptions, PlacementResult, Point } from './types.ts';

/**
 * Observable Plot adapter: a `render` function for a text mark, which places its labels and
 * draws their leaders. Plot is not a dependency: this reads what Plot hands a mark's `render`.
 *
 * ```js
 * Plot.text(cities, {
 *   x: 'lon', y: 'lat', text: 'name',
 *   channels: { r: { value: 'population', scale: 'r' } },
 *   render: placeText({ land })
 * })
 * ```
 */

/** The channels this adapter reads, in Plot's screen space (`r` through the `r` scale). */
interface PlotValues {
  x?: ArrayLike<number>;
  y?: ArrayLike<number>;
  text?: ArrayLike<unknown>;
  r?: ArrayLike<number>;
  priority?: ArrayLike<number>;
  mode?: ArrayLike<LabelMode>;
}

interface PlotDimensions {
  width: number;
  height: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
}

/** A d3 geo stream, which Plot's projection feeds. */
interface GeoStream {
  point(x: number, y: number): void;
  lineStart(): void;
  lineEnd(): void;
  polygonStart(): void;
  polygonEnd(): void;
  sphere?(): void;
}

interface PlotContext {
  document: Document;
  ownerSVGElement?: SVGSVGElement;
  projection?: { stream(sink: GeoStream): GeoStream } | null;
}

type Render = (
  index: ArrayLike<number>,
  scales: unknown,
  values: PlotValues,
  dimensions: PlotDimensions,
  context: PlotContext,
  next: (index: ArrayLike<number>, scales: unknown, values: PlotValues, dimensions: PlotDimensions, context: PlotContext) => SVGElement | null
) => SVGElement | null;

/** GeoJSON, as far as land goes: polygons, alone or in features and collections. */
type GeoJSONLike =
  | { type: 'FeatureCollection'; features: GeoJSONLike[] }
  | { type: 'Feature'; geometry: GeoJSONLike | null }
  | { type: 'GeometryCollection'; geometries: GeoJSONLike[] }
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] }
  | { type: string };

export interface PlotPlacementOptions extends Omit<PlaceOptions, 'bounds' | 'obstacles'> {
  /**
   * Land, as GeoJSON polygons in longitude and latitude, projected with the plot's projection:
   * a soft polygon costing `landCost` times the share of a box on it (default 2.5, above the
   * spot left of a symbol) and its outline as a soft line, so that names prefer the sea.
   */
  land?: GeoJSONLike;
  landCost?: number;
  /**
   * Obstacles in pixels, or a function of `project`, from longitude and latitude to pixels
   * (null when clipped, or without a projection).
   */
  obstacles?: Obstacle[] | ((project: (lon: number, lat: number) => Point | null) => Obstacle[]);
  /** Radius of the symbols without an `r` channel, in pixels: 3 for Plot's default dots. Defaults to 0. */
  r?: number;
  /** Height of a label, in ems of its font size. Defaults to 1.2. */
  lineHeight?: number;
  /** Every label `required`, for a blank base map. A `mode` channel wins. */
  required?: boolean;
  /** Leaders: stroke and width. Default `currentColor`, 0.5. */
  leaderStroke?: string;
  leaderWidth?: number;
  /** Called with the result of each render, e.g. to keep it as the next `previous`. */
  onPlace?: (result: PlacementResult) => void;
  /**
   * Show what to look at: overlapping labels in red, and at the anchor of each hidden label a
   * red cross when it was `blocked` (obstacles, bounds), a red ring when other labels took
   * its room. A `<title>` names it.
   */
  debug?: boolean;
}

const SVG = 'http://www.w3.org/2000/svg';
const LAND_COST = 2.5;

/** A `render` function for `Plot.text` that places the labels instead of writing them at their anchors. */
export function placeText(options: PlotPlacementOptions = {}): Render {
  const { land, landCost = LAND_COST, obstacles, r: radius = 0, lineHeight = 1.2, required, leaderStroke = 'currentColor', leaderWidth = 0.5, onPlace, debug, ...place } = options;
  return (index, scales, values, dimensions, context, next) => {
    const g = next(index, scales, values, dimensions, context);
    const texts = g ? [...g.children].filter((e): e is SVGTextElement => e.tagName === 'text') : [];
    if (!g || !values.x || !values.y || texts.length !== index.length) return g;
    const doc = context.document;
    const svg = context.ownerSVGElement;
    const attr = (name: string, fallback: string) => g.getAttribute(name) ?? svg?.getAttribute(name) ?? fallback;
    const family = attr('font-family', 'system-ui, sans-serif');
    const weight = attr('font-weight', 'normal');
    const size = parseFloat(attr('font-size', '10'));
    const measure = measurer(doc);

    // Plot's index is a typed array: map it into a plain one.
    const labels: LabelInput[] = Array.from(index, (i, k) => {
      const el = texts[k];
      const fontSize = parseFloat(el.getAttribute('font-size') ?? '') || size;
      const r = values.r ? values.r[i] : radius;
      return {
        id: i,
        x: values.x![i],
        y: values.y![i],
        width: measure(el.textContent ?? '', `${weight} ${fontSize}px ${family}`, fontSize),
        height: fontSize * lineHeight,
        symbol: r > 0 ? { type: 'circle', radius: r } : undefined,
        priority: values.priority ? values.priority[i] : values.r ? values.r[i] : 0,
        mode: values.mode ? values.mode[i] : required ? 'required' : undefined
      };
    });

    const project = projector(context.projection);
    const all: Obstacle[] = typeof obstacles === 'function' ? obstacles(project) : (obstacles ?? []);
    if (land && context.projection) {
      const rings = projectRings(land, context.projection);
      if (rings.length) all.push({ type: 'polygon', rings, soft: true, cost: landCost }, ...rings.map((ring): Obstacle => ({ type: 'line', points: [...ring, ring[0]], soft: true })));
    }
    const { width, height, marginTop, marginRight, marginBottom, marginLeft } = dimensions;
    const result = placeLabels(labels, { ...place, bounds: [marginLeft, marginTop, width - marginRight, height - marginBottom], obstacles: all });
    onPlace?.(result);

    const out = doc.createElementNS(SVG, 'g');
    const leaders = doc.createElementNS(SVG, 'g');
    leaders.setAttribute('fill', 'none');
    leaders.setAttribute('stroke', leaderStroke);
    leaders.setAttribute('stroke-width', String(leaderWidth));
    const marks = doc.createElementNS(SVG, 'g');
    marks.setAttribute('fill', 'none');
    marks.setAttribute('stroke', 'red');
    out.append(leaders, g, marks);
    result.labels.forEach((p, k) => {
      const el = texts[k];
      if (!p.visible || !p.box) {
        el.remove();
        if (debug && labels[k].width > 0) marks.append(hiddenMark(doc, labels[k].x, labels[k].y, p.blocked, el.textContent ?? ''));
        return;
      }
      // Centered on its box, with Plot's own middle baseline.
      el.setAttribute('transform', `translate(${p.x},${(p.box[1] + p.box[3]) / 2})`);
      el.setAttribute('y', '0.32em');
      el.setAttribute('text-anchor', p.textAnchor);
      if (debug && p.overlapping) el.setAttribute('fill', 'red');
      if (p.leader) {
        const path = doc.createElementNS(SVG, 'path');
        path.setAttribute('d', 'M' + p.leader.map((q) => q.join(',')).join('L'));
        leaders.append(path);
      }
    });
    return out;
  };
}

/** Text width through a canvas, or an estimate where there is none (server-side rendering). */
function measurer(doc: Document): (text: string, font: string, size: number) => number {
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = doc.createElement('canvas').getContext('2d');
  } catch {
    ctx = null;
  }
  return (text, font, size) => {
    if (!ctx) return text.length * size * 0.6;
    ctx.font = font;
    return ctx.measureText(text).width;
  };
}

function hiddenMark(doc: Document, x: number, y: number, blocked: boolean, name: string): SVGElement {
  const e = doc.createElementNS(SVG, 'path');
  e.setAttribute('d', blocked ? `M${x - 3},${y - 3}L${x + 3},${y + 3}M${x - 3},${y + 3}L${x + 3},${y - 3}` : `M${x + 4},${y}A4,4 0 1,1 ${x - 4},${y}A4,4 0 1,1 ${x + 4},${y}`);
  const title = doc.createElementNS(SVG, 'title');
  title.textContent = `${name}: ${blocked ? 'no spot clear of the obstacles' : 'its room taken by other labels'}`;
  e.append(title);
  return e;
}

/** From longitude and latitude to pixels through the projection's stream, null when clipped. */
function projector(projection: PlotContext['projection']): (lon: number, lat: number) => Point | null {
  return (lon, lat) => {
    if (!projection) return null;
    let p: Point | null = null;
    const stream = projection.stream({ point: (x, y) => (p = [x, y]), lineStart() {}, lineEnd() {}, polygonStart() {}, polygonEnd() {} });
    stream.point(lon, lat);
    return p;
  };
}

/** Rings of the polygons, projected, resampled and clipped as Plot draws them. */
function projectRings(geo: GeoJSONLike, projection: NonNullable<PlotContext['projection']>): Point[][] {
  const rings: Point[][] = [];
  let ring: Point[] | null = null;
  const stream = projection.stream({
    point: (x, y) => ring?.push([x, y]),
    lineStart: () => (ring = []),
    lineEnd: () => {
      if (ring && ring.length > 2) rings.push(ring);
      ring = null;
    },
    polygonStart() {},
    polygonEnd() {}
  });
  const polygon = (coordinates: number[][][]) => {
    stream.polygonStart();
    for (const r of coordinates) {
      stream.lineStart();
      // Rings are closed in GeoJSON, open in a geo stream.
      for (let k = 0; k < r.length - 1; k++) stream.point(r[k][0], r[k][1]);
      stream.lineEnd();
    }
    stream.polygonEnd();
  };
  const visit = (g: GeoJSONLike | null): void => {
    if (!g) return;
    if (g.type === 'FeatureCollection') for (const f of (g as { features: GeoJSONLike[] }).features) visit(f);
    else if (g.type === 'Feature') visit((g as { geometry: GeoJSONLike | null }).geometry);
    else if (g.type === 'GeometryCollection') for (const h of (g as { geometries: GeoJSONLike[] }).geometries) visit(h);
    else if (g.type === 'Polygon') polygon((g as { coordinates: number[][][] }).coordinates);
    else if (g.type === 'MultiPolygon') for (const p of (g as { coordinates: number[][][][] }).coordinates) polygon(p);
  };
  visit(geo);
  return rings;
}
