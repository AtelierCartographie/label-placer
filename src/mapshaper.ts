import { placeLabels } from './index.ts';
import { textWidth } from './metrics.ts';
import { pointInRings, ringsBox } from './polygon.ts';
import type { LabelInput, LabelMode, Obstacle, PlaceOptions, PlacementResult, Point } from './types.ts';

export { textWidth } from './metrics.ts';

/**
 * Mapshaper adapter: a function for `-run`, which places the labels of the target layer (points,
 * or polygons named inside or outside their outline) and returns the commands that draw them.
 *
 * ```sh
 * mapshaper cities.json -proj EPSG:2154 -style r='Math.sqrt(pop) / 40' fill='#e09b35' \
 *   -require @ateliercartographie/label-placer/mapshaper alias=lp \
 *   -run '{lp.labels(target, io, { text: "name", width: 800 })}' \
 *   -o map.svg target=*
 * ```
 *
 * The returned commands set the SVG frame (`-frame`, the page the labels were placed on), import
 * the leaders as a line layer and the labels as a point layer at their text positions, and style
 * them with `-labels`. Text is measured with the metrics of Helvetica and Arial, which the SVG
 * names first. `-require` and `-run` are command-line only: the web console has no file access.
 */

/** What `-run` exposes of the target layer, as far as this adapter reads it. */
interface MapshaperTarget {
  layer_name?: string;
  bbox: [number, number, number, number] | null;
  geojson: FeatureCollection;
}

interface MapshaperIO {
  /** Writes a temporary input file and resolves to its name, for `-i`. */
  ifile(name: string, data: unknown): Promise<string> | string;
}

interface Feature {
  type: 'Feature';
  properties: Record<string, unknown> | null;
  geometry: { type: string; coordinates: unknown } | null;
}
interface FeatureCollection {
  type: 'FeatureCollection';
  features: Feature[];
}

export interface MapshaperLabelOptions extends Omit<PlaceOptions, 'bounds' | 'obstacles'> {
  /** The field holding the label text. */
  text: string;
  /** Width of the SVG, in pixels. Defaults to 800. */
  width?: number;
  /** Space between the map and the edge of the SVG, in pixels. Defaults to 10. */
  margin?: number;
  /** Extent of the map, in projected units: defaults to the target layer's. Give the basemap's when it is wider. */
  bbox?: [number, number, number, number];
  /** `false` when the commands already hold a `-frame` set with the same `width` and `bbox` (and a zero `margin`). */
  frame?: boolean;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  /** Spacing between the lines of a two-line label, in ems: `-labels line-height`. Defaults to 1.2. */
  lineHeight?: number;
  /** Radius of the point symbols, in pixels: a number, or a field (Mapshaper's `-style r=` writes `r`). Defaults to the `r` field when there is one. */
  r?: number | string;
  /** Field ranking the labels, higher first. Defaults to the radius. */
  priority?: string;
  /**
   * Share of the labels, the most important first, that may take a leader. Defaults to 1. A
   * quarter keeps leaders for the names that matter, and the map clearer.
   */
  leaders?: number;
  /** Every label `required`, for a blank base map. */
  required?: boolean;
  /** Field holding a `LabelMode` per feature, over `required`. */
  mode?: string;
  /** Offer each name on two lines too, cut at the hyphen or space nearest its middle. */
  twoLines?: boolean;
  /** Field holding a short form (an abbreviation, a number), offered as a last layout at `shortCost`. */
  short?: string;
  /** Defaults to 10: dearer than the spots next to the feature, cheaper than a leader. */
  shortCost?: number;
  /**
   * Land, as GeoJSON polygons in the projected coordinates (`targets.land.geojson` with
   * `-run target=places,land`): names prefer the sea, at `landCost` times the share of a box
   * on land (default 2.5), and keep off the coastline, a soft line.
   */
  land?: FeatureCollection;
  landCost?: number;
  /** Further `-labels` options, e.g. `'fill=#333 halo-width=2 halo-color=white'`. */
  labelStyle?: string;
  /** `-style` options of the leaders. Defaults to `'stroke=#4b5967 stroke-width=0.6'`. */
  leaderStyle?: string;
  /** Prefix of the fields written back to the target layer. Defaults to `lp_`. */
  prefix?: string;
  /** Names of the layers made. Default `<layer>-labels` and `<layer>-leaders`. */
  names?: { labels?: string; leaders?: string };
  /** Called with the result, e.g. to read it from a script. */
  onPlace?: (result: PlacementResult) => void;
  /** `false` to keep the one-line summary off the console. */
  log?: boolean;
}

const LAND_COST = 2.5;
const SHORT_COST = 10;
/** Baseline of a line under the middle of its box, in ems: half the cap height of Helvetica and Arial. */
const BASELINE = 0.36;

/** Place the labels of the target layer; resolves to the `-frame`, `-i` and `-labels` commands that draw them. */
export async function labels(target: MapshaperTarget, io: MapshaperIO, options: MapshaperLabelOptions): Promise<string> {
  const {
    text: field,
    width = 800,
    margin = 10,
    bbox: given,
    frame = true,
    fontSize = 12,
    fontWeight = 'normal',
    lineHeight = 1.2,
    r: radius,
    priority: rank,
    leaders: leaderShare = 1,
    required,
    mode: modeField,
    twoLines: split,
    short,
    shortCost = SHORT_COST,
    land,
    landCost = LAND_COST,
    labelStyle = '',
    leaderStyle = 'stroke=#4b5967 stroke-width=0.6',
    prefix = 'lp_',
    names = {},
    onPlace,
    log = true,
    ...place
  } = options;
  const layer = target.layer_name || 'layer';
  const geojson = target.geojson;
  const bbox = given ?? target.bbox;
  if (!bbox) throw new Error('label-placer: the target layer has no extent, give a bbox');

  // The page: the map fitted to `width`, `margin` pixels around it, y down.
  const k = (width - 2 * margin) / Math.max(1e-9, bbox[2] - bbox[0]);
  const f: [number, number, number, number] = [bbox[0] - margin / k, bbox[1] - margin / k, bbox[2] + margin / k, bbox[3] + margin / k];
  const height = (f[3] - f[1]) * k;
  const toPx = ([x, y]: Point): Point => [(x - f[0]) * k, (f[3] - y) * k];
  const toMap = ([x, y]: Point): Point => [f[0] + x / k, f[3] - y / k];

  const bold = fontWeight === 'bold';
  const line = fontSize * lineHeight;
  const size = (lines: string[]) => ({ width: Math.max(...lines.map((t) => textWidth(t, fontSize, bold))) + 2, height: lines.length * line + 1 });
  const blocks: string[][][] = [];
  const labels: LabelInput[] = geojson.features.map((feature, i) => {
    const props = feature.properties ?? {};
    const name = props[field] == null ? '' : String(props[field]);
    const anchor = anchorOf(feature.geometry, toPx);
    if (!anchor || !name) return (blocks[i] = []), { id: i, x: anchor?.point[0] ?? 0, y: anchor?.point[1] ?? 0, width: 0, height: 0 };
    const two = split ? twoLines(name) : null;
    const abbr = short && props[short] != null && String(props[short]) ? [String(props[short])] : null;
    blocks[i] = [[name], ...(two ? [two] : []), ...(abbr ? [abbr] : [])];
    const layouts = [...(two ? [size(two)] : []), ...(abbr ? [{ ...size(abbr), cost: shortCost }] : [])];
    const r = typeof radius === 'number' ? radius : Number(props[radius ?? 'r']) || 0;
    const mode = (modeField && (props[modeField] as LabelMode)) || (required ? 'required' : undefined);
    return {
      id: i,
      x: anchor.point[0],
      y: anchor.point[1],
      ...size([name]),
      layouts: layouts.length ? layouts : undefined,
      symbol: anchor.rings ? { type: 'polygon', rings: anchor.rings } : r > 0 ? { type: 'circle', radius: r } : undefined,
      priority: rank ? Number(props[rank]) || 0 : r,
      mode
    };
  });

  if (leaderShare < 1) {
    const named = labels.filter((l) => l.width > 0).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    named.slice(Math.ceil(named.length * leaderShare)).forEach((l) => (l.leader = false));
  }
  const obstacles: Obstacle[] = [];
  if (land) {
    const rings = land.features.flatMap((g) => polygonRings(g.geometry)).flat().map((ring) => ring.map(toPx));
    if (rings.length) obstacles.push({ type: 'polygon', rings, soft: true, cost: landCost }, ...rings.map((ring): Obstacle => ({ type: 'line', points: ring, soft: true })));
  }
  const result = placeLabels(labels, { ...place, bounds: [0, 0, width, height], obstacles });
  onPlace?.(result);

  // Back to the target layer: whether each label shows, and what to look at.
  for (const p of result.labels) {
    const props = (geojson.features[p.index].properties ??= {});
    props[prefix + 'visible'] = p.visible;
    props[prefix + 'blocked'] = p.blocked;
    props[prefix + 'overlapping'] = p.overlapping;
    // Why it is hidden, and the names in its way.
    props[prefix + 'reason'] = p.reason;
    props[prefix + 'by'] = p.by.map((k) => String(geojson.features[k].properties?.[field] ?? k)).join(', ');
  }
  target.geojson = geojson;

  // The labels, as points at their first baseline; the leaders, as lines.
  const textPoints: Feature[] = [];
  const leaders: Feature[] = [];
  for (const p of result.labels) {
    if (!p.visible || !p.box) continue;
    const lines = blocks[p.index][p.layout];
    const baseline = p.box[1] + 0.5 + line / 2 + BASELINE * fontSize;
    textPoints.push({
      type: 'Feature',
      properties: { [field]: lines.join('\n'), [prefix + 'anchor']: p.textAnchor },
      geometry: { type: 'Point', coordinates: toMap([p.x, baseline]) }
    });
    if (p.leader) leaders.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: p.leader.map(toMap) } });
  }
  const s = result.stats;
  if (log)
    console.error(
      `[label-placer] ${s.placed} placed, ${s.hidden - labels.filter((l) => !(l.width > 0)).length} hidden (${s.blocked} blocked), ${s.overlapping} overlapping, ${leaders.length} leaders`
    );

  const labelsName = names.labels ?? `${layer}-labels`;
  const leadersName = names.leaders ?? `${layer}-leaders`;
  const commands: string[] = [];
  if (frame) commands.push(`-frame width=${width} bbox=${f.map((v) => +v.toFixed(6)).join(',')} name=${layer}-frame`);
  // Leaders first, so that the labels are drawn over them.
  if (leaders.length) {
    const file = await io.ifile(`${leadersName}.json`, { type: 'FeatureCollection', features: leaders });
    commands.push(`-i ${file} name=${leadersName}`, `-style ${leaderStyle}`);
  }
  if (textPoints.length) {
    const file = await io.ifile(`${labelsName}.json`, { type: 'FeatureCollection', features: textPoints });
    const weight = bold ? ' font-weight=bold' : '';
    commands.push(
      `-i ${file} name=${labelsName}`,
      `-labels text=${field} text-anchor=${prefix}anchor font-size=${fontSize}${weight} line-height=${lineHeight} font-family=Helvetica,Arial,sans-serif ${labelStyle}`.trim()
    );
  }
  return commands.join(' ');
}

/** Where a feature is labelled, in pixels: a point, or the interior point of a polygon with its rings. */
function anchorOf(geometry: Feature['geometry'], toPx: (p: Point) => Point): { point: Point; rings?: Point[][] } | null {
  if (!geometry) return null;
  if (geometry.type === 'Point') return { point: toPx(geometry.coordinates as Point) };
  if (geometry.type === 'MultiPoint') {
    const first = (geometry.coordinates as Point[])[0];
    return first ? { point: toPx(first) } : null;
  }
  const polygons = polygonRings(geometry).map((p) => p.map((ring) => ring.map(toPx)));
  if (!polygons.length) return null;
  // The largest part holds the anchor; every part bounds the label.
  const largest = polygons.reduce((a, b) => (Math.abs(area(b[0])) > Math.abs(area(a[0])) ? b : a));
  return { point: interiorPoint(largest), rings: polygons.flat() };
}

function polygonRings(geometry: Feature['geometry']): Point[][][] {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates as Point[][]];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates as Point[][][];
  return [];
}

const area = (ring: Point[]) => ring.reduce((s, [x, y], i) => s + x * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * y, 0) / 2;

/** The point of a 32 × 32 grid over the polygon farthest from its outline. */
function interiorPoint(rings: Point[][]): Point {
  const [x0, y0, x1, y1] = ringsBox(rings);
  let best: Point = rings[0][0];
  let bestDistance = -1;
  for (let i = 0; i <= 32; i++)
    for (let j = 0; j <= 32; j++) {
      const x = x0 + ((x1 - x0) * i) / 32;
      const y = y0 + ((y1 - y0) * j) / 32;
      if (!pointInRings(x, y, rings)) continue;
      const d = edgeDistance(x, y, rings);
      if (d > bestDistance) [best, bestDistance] = [[x, y], d];
    }
  return best;
}

function edgeDistance(x: number, y: number, rings: Point[][]): number {
  let best = Infinity;
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[j];
      const [bx, by] = ring[i];
      const l2 = (bx - ax) ** 2 + (by - ay) ** 2;
      const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / l2)) : 0;
      best = Math.min(best, Math.hypot(ax + t * (bx - ax) - x, ay + t * (by - ay) - y));
    }
  return best;
}

/** Two lines, cut at the hyphen or space nearest the middle (the hyphen kept), or null. */
function twoLines(name: string): string[] | null {
  let best = -1;
  for (let k = 1; k < name.length - 1; k++)
    if ((name[k] === '-' || name[k] === ' ') && (best < 0 || Math.abs(k - name.length / 2) < Math.abs(best - name.length / 2))) best = k;
  return best < 0 ? null : [name.slice(0, name[best] === '-' ? best + 1 : best), name.slice(best + 1)];
}
