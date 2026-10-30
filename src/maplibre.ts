import { textWidth } from './metrics.ts';
import type { LabelInput, LabelMode, Obstacle, PlaceOptions, Point } from './types.ts';
import { placeZooms, type ZoomResult } from './zooms.ts';

/**
 * MapLibre adapter: the names of a point layer placed every half zoom with `placeZooms`,
 * returned as GeoJSON sources for MapLibre's own symbol and line layers, its collision detection
 * turned off. MapLibre is not a dependency: this computes the sources and the layer specs.
 *
 * ```js
 * const placed = mapLabels(towns, { text: 'name', priority: 'population', r: 4, minzoom: 6, maxzoom: 11 });
 * map.addSource('lp-labels', { type: 'geojson', data: placed.labels });
 * map.addSource('lp-leaders', { type: 'geojson', data: placed.leaders });
 * for (const layer of placed.layers({ labels: 'lp-labels', leaders: 'lp-leaders', font: ['Open Sans Semibold'] })) map.addLayer(layer);
 * ```
 *
 * Between two placements the map grows while the text keeps its size:
 * a name next to its symbol is set at its anchor with a `text-offset` in ems, so that it stays
 * there; a name with a leader is set at its place on the map, with its leader, so that both move
 * together. Each zoom placed has its layers, shown from that zoom to the next one placed.
 */

interface Feature {
  type: 'Feature';
  properties: Record<string, unknown> | null;
  geometry: { type: string; coordinates: unknown } | null;
}
interface FeatureCollection {
  type: 'FeatureCollection';
  features: Feature[];
}

export interface MapLibreLabelOptions extends Omit<PlaceOptions, 'bounds' | 'obstacles' | 'previous'> {
  /** The property holding the label text. */
  text: string;
  /** Zooms placed: from `minzoom` (no label below it) to `maxzoom` (its placement above it), every `step`. */
  minzoom: number;
  maxzoom: number;
  /**
   * Zooms between two placements. Defaults to 0.5: until the next one, the map grows by up to
   * 41 %, and a name with a leader drifts with it as much. 1 halves the work, and lets it drift twice as far.
   */
  step?: number;
  /** Text size in pixels, as in the symbol layer's `text-size`. Defaults to 12. */
  fontSize?: number;
  /** Height of a label, in ems. Defaults to 1.2. */
  lineHeight?: number;
  /** Width of a text in pixels. Defaults to the metrics of Helvetica and Arial; MapLibre's glyphs differ: measure them, or widen these. */
  measure?: (text: string, fontSize: number) => number;
  /** Radius of the circles drawn at the points, in pixels: a number, or a property. Defaults to 0. */
  r?: number | string;
  /** Property ranking the labels, higher first. Defaults to the radius. */
  priority?: string;
  /** Every label `required`. */
  required?: boolean;
  /** Property holding a `LabelMode` per feature, over `required`. */
  mode?: string;
  /** Land, as GeoJSON polygons in longitude and latitude: names prefer the sea, at `landCost` (default 2.5). */
  land?: FeatureCollection;
  landCost?: number;
  /** Other obstacles at a zoom, in that zoom's pixels: `project(lon, lat)` gives them. */
  obstacles?: (zoom: number, project: (lon: number, lat: number) => Point) => Obstacle[];
  /** Pixels of a tile: 512 in MapLibre. */
  tileSize?: number;
}

export interface MapLibreLabels {
  /**
   * A point per label and zoom it shows at: at its anchor with `lp_offset` (ems) for a name next
   * to its symbol, at its place for a name with a leader; with `lp_zoom`, `lp_anchor` (a
   * `text-anchor`), `lp_minzoom` and the feature's own properties.
   */
  labels: FeatureCollection;
  /** A line per leader and zoom, with `lp_zoom`. */
  leaders: FeatureCollection;
  /** For each input feature, the first zoom placed its label shows at, or null. */
  minZoom: (number | null)[];
  result: ZoomResult;
  /** Symbol and line layers for these sources, one pair per zoom. */
  layers(sources: { labels: string; leaders: string; font?: string[]; color?: string; halo?: string; leaderColor?: string; id?: string }): Record<string, unknown>[];
}

const LAND_COST = 2.5;

/** Web Mercator, to the pixels of a zoom, y down. */
function projector(zoom: number, tileSize: number): { project: (lon: number, lat: number) => Point; unproject: (p: Point) => Point } {
  const world = tileSize * Math.pow(2, zoom);
  return {
    project: (lon, lat) => {
      const s = Math.sin((Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180);
      return [((lon + 180) / 360) * world, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * world];
    },
    unproject: ([x, y]) => [(x / world) * 360 - 180, (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / world))) * 180) / Math.PI]
  };
}

/** MapLibre's `text-anchor` for the engine's alignment. */
function anchorName(textAnchor: string, baseline: string): string {
  const v = baseline === 'top' ? 'top' : baseline === 'bottom' ? 'bottom' : '';
  const h = textAnchor === 'start' ? 'left' : textAnchor === 'end' ? 'right' : '';
  return v && h ? `${v}-${h}` : v || h || 'center';
}

function pointOf(geometry: Feature['geometry']): Point | null {
  if (geometry?.type === 'Point') return geometry.coordinates as Point;
  if (geometry?.type === 'MultiPoint') return ((geometry.coordinates as Point[])[0] as Point) ?? null;
  return null;
}

function landRings(land: FeatureCollection): Point[][] {
  const out: Point[][] = [];
  for (const f of land.features) {
    const g = f.geometry;
    if (g?.type === 'Polygon') out.push(...(g.coordinates as Point[][]));
    else if (g?.type === 'MultiPolygon') for (const p of g.coordinates as Point[][][]) out.push(...p);
  }
  return out;
}

/** Place the names of a point layer at every `step` from `minzoom` to `maxzoom`, as GeoJSON for MapLibre. */
export function mapLabels(points: FeatureCollection, options: MapLibreLabelOptions): MapLibreLabels {
  const {
    text: field,
    minzoom,
    maxzoom,
    fontSize = 12,
    lineHeight = 1.2,
    measure = textWidth,
    r: radius = 0,
    priority: rank,
    required,
    mode: modeField,
    land,
    landCost = LAND_COST,
    obstacles,
    tileSize = 512,
    step = 0.5,
    ...place
  } = options;
  const zooms: number[] = [];
  for (let k = 0; minzoom + k * step <= maxzoom + 1e-9; k++) zooms.push(+(minzoom + k * step).toFixed(6));
  const features = points.features;
  const anchors = features.map((f) => pointOf(f.geometry));
  const landPolygons = land ? landRings(land) : [];
  // Room around the points for the names at the edges.
  const longest = Math.max(0, ...features.map((f) => measure(String(f.properties?.[field] ?? ''), fontSize)));
  const pad = longest + 4 * fontSize;

  const levels = zooms.map((zoom) => {
    const { project } = projector(zoom, tileSize);
    const px = anchors.map((a) => (a ? project(a[0], a[1]) : null));
    const xs = px.filter(Boolean).map((p) => p![0]);
    const ys = px.filter(Boolean).map((p) => p![1]);
    const bounds: [number, number, number, number] = xs.length ? [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad] : [0, 0, 1, 1];
    const labels: LabelInput[] = features.map((f, i) => {
      const props = f.properties ?? {};
      const name = props[field] == null ? '' : String(props[field]);
      const p = px[i];
      if (!p || !name) return { id: i, x: p?.[0] ?? 0, y: p?.[1] ?? 0, width: 0, height: 0 };
      const r = typeof radius === 'number' ? radius : Number(props[radius]) || 0;
      return {
        id: i,
        x: p[0],
        y: p[1],
        width: measure(name, fontSize) + 2,
        height: fontSize * lineHeight,
        symbol: r > 0 ? { type: 'circle', radius: r } : undefined,
        priority: rank ? Number(props[rank]) || 0 : r,
        mode: (modeField && (props[modeField] as LabelMode)) || (required ? 'required' : undefined)
      };
    });
    const obs: Obstacle[] = obstacles ? obstacles(zoom, project) : [];
    if (landPolygons.length) {
      const rings = landPolygons.map((ring) => ring.map(([lon, lat]) => project(lon, lat)));
      obs.push({ type: 'polygon', rings, soft: true, cost: landCost }, ...rings.map((points): Obstacle => ({ type: 'line', points, soft: true })));
    }
    return { zoom, labels, options: { ...place, bounds, obstacles: obs } };
  });
  const result = placeZooms(levels);

  const labelFeatures: Feature[] = [];
  const leaderFeatures: Feature[] = [];
  result.levels.forEach((res, k) => {
    const zoom = zooms[k];
    const { unproject } = projector(zoom, tileSize);
    for (const p of res.labels) {
      if (!p.visible) continue;
      const anchor = anchors[p.index]!;
      const props = { ...(features[p.index].properties ?? {}), lp_zoom: zoom, lp_anchor: anchorName(p.textAnchor, p.baseline), lp_minzoom: result.minZoom[p.index] };
      // A leader and its name move with the map; a name next to its symbol stays next to it.
      const at: Point = p.leader ? unproject([p.x, p.y]) : anchor;
      const offset: Point = p.leader ? [0, 0] : [p.offset[0] / fontSize, p.offset[1] / fontSize];
      labelFeatures.push({ type: 'Feature', properties: { ...props, lp_offset: offset }, geometry: { type: 'Point', coordinates: at } });
      if (p.leader) leaderFeatures.push({ type: 'Feature', properties: { lp_zoom: zoom, lp_index: p.index }, geometry: { type: 'LineString', coordinates: p.leader.map(unproject) } });
    }
  });

  return {
    labels: { type: 'FeatureCollection', features: labelFeatures },
    leaders: { type: 'FeatureCollection', features: leaderFeatures },
    minZoom: result.minZoom,
    result,
    layers: ({ labels, leaders, font = ['Open Sans Regular'], color = '#15202b', halo = '#ffffff', leaderColor = '#4b5967', id = 'lp' }) =>
      zooms.flatMap((zoom, k) => {
        // Shown from this zoom to the next; the last one from there on.
        const range = { minzoom: zoom, ...(k < zooms.length - 1 ? { maxzoom: zooms[k + 1] } : {}) };
        const filter = ['==', ['get', 'lp_zoom'], zoom];
        return [
          { id: `${id}-leaders-${zoom}`, type: 'line', source: leaders, filter, ...range, paint: { 'line-color': leaderColor, 'line-width': 0.75 } },
          {
            id: `${id}-labels-${zoom}`,
            type: 'symbol',
            source: labels,
            filter,
            ...range,
            layout: {
              'text-field': ['get', field],
              'text-font': font,
              'text-size': fontSize,
              'text-anchor': ['get', 'lp_anchor'],
              'text-offset': ['get', 'lp_offset'],
              'text-justify': 'auto',
              'text-allow-overlap': true,
              'text-ignore-placement': true
            },
            paint: { 'text-color': color, 'text-halo-color': halo, 'text-halo-width': 1.5 }
          }
        ];
      })
  };
}
