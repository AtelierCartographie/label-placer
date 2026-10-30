import { describe, expect, it } from 'vitest';
import { labels } from '../src/mapshaper.ts';
import { textWidth } from '../src/metrics.ts';
import type { PlacementResult } from '../src/index.ts';

type Geometry = { type: string; coordinates: unknown };
const feature = (properties: Record<string, unknown>, geometry: Geometry) => ({ type: 'Feature' as const, properties, geometry });
const point = (x: number, y: number): Geometry => ({ type: 'Point', coordinates: [x, y] });

/** What `-run` hands the function: the target layer, and `io` keeping the files it writes. */
function run(features: ReturnType<typeof feature>[], options: Parameters<typeof labels>[2], bbox: [number, number, number, number] = [0, 0, 100, 100]) {
  const files = new Map<string, { features: { properties: Record<string, unknown>; geometry: Geometry }[] }>();
  let geojson = { type: 'FeatureCollection' as const, features };
  const target = {
    layer_name: 'places',
    bbox,
    get geojson() {
      return geojson;
    },
    set geojson(g) {
      geojson = g;
    }
  };
  const io = { ifile: async (name: string, data: unknown) => (files.set(name, data as never), name) };
  return { target, files, commands: labels(target, io, { log: false, ...options }) };
}

describe('textWidth', () => {
  it('measures text with the metrics of Helvetica and Arial', () => {
    expect(textWidth('Paris', 10)).toBeCloseTo(((667 + 556 + 333 + 222 + 500) * 10) / 1000);
    expect(textWidth('Paris', 10, true)).toBeGreaterThan(textWidth('Paris', 10));
    // Accented capitals and lower case of the Latin-1 range.
    expect(textWidth('É', 10)).toBeCloseTo(6.67);
    expect(textWidth('é', 10)).toBeCloseTo(5.56);
  });
});

describe('labels (Mapshaper)', () => {
  it('returns the frame and the commands that draw the labels at their text positions', async () => {
    const { commands, files } = run([feature({ name: 'Alpha', r: 4 }, point(50, 50))], { text: 'name', width: 220, margin: 10 });
    const cmd = await commands;
    // 200 px for 100 units: 2 px a unit, 5 units of margin.
    expect(cmd).toMatch(/^-frame width=220 bbox=-5,-5,105,105 name=places-frame /);
    expect(cmd).toContain('-i places-labels.json name=places-labels -labels text=name text-anchor=lp_anchor font-size=12');
    const label = files.get('places-labels.json')!.features[0];
    expect(label.properties).toEqual({ name: 'Alpha', lp_anchor: 'start' });
    // Right of the circle (anchor at x = 110 px), its baseline under the anchor's level.
    const [x, y] = label.geometry.coordinates as [number, number];
    expect(x).toBeGreaterThan(50 + 4 / 2);
    expect(y).toBeLessThan(50);
  });

  it('writes back whether each label shows, and tells blocked from crowded out', async () => {
    const { commands, target } = run(
      [feature({ name: 'Alpha', r: 4 }, point(50, 50)), feature({ name: 'Beta', r: 4 }, point(50, 50)), feature({ name: '' }, point(10, 10))],
      { text: 'name', width: 220, positions: ['right'], leader: false, inside: false }
    );
    await commands;
    const props = target.geojson.features.map((f) => f.properties);
    expect(props.map((p) => p.lp_visible)).toEqual([true, false, false]);
    expect(props[1].lp_blocked).toBe(false);
  });

  it('names a polygon inside its outline, on two lines or by its short form if need be', async () => {
    const square = (x0: number, y0: number, x1: number, y1: number): Geometry => ({
      type: 'Polygon',
      coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]
    });
    let result: PlacementResult | undefined;
    const { files, commands } = run(
      [feature({ nom: 'Haute-Vienne', code: '87' }, square(0, 0, 40, 40)), feature({ nom: 'Corrèze', code: '19' }, square(40, 0, 100, 100))],
      { text: 'nom', width: 110, margin: 5, fontSize: 9, twoLines: true, short: 'code', required: true, onPlace: (r) => (result = r) }
    );
    await commands;
    expect(result!.stats.overlapping).toBe(0);
    expect(result!.labels.map((p) => p.placement)).toEqual(['center', 'center']);
    // 40 units are 40 px: "Haute-Vienne" (about 52 px at 9 px) only fits on two lines.
    expect(files.get('places-labels.json')!.features[0].properties.nom).toBe('Haute-\nVienne');
  });

  it('keeps leaders for the most important labels when asked', async () => {
    // A small area enclosed in a larger one: its name, too long for it, only gets out with a leader.
    const hole = [[40, 40], [60, 40], [60, 60], [40, 60], [40, 40]];
    const features = [
      feature({ name: 'Alpha', rank: 2 }, { type: 'Polygon', coordinates: [[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]], hole] }),
      feature({ name: 'Beta-Gamma-Delta', rank: 1 }, { type: 'Polygon', coordinates: [hole] })
    ];
    const options = { text: 'name', width: 220, priority: 'rank' };
    const all = run(features, options);
    await all.commands;
    expect(all.target.geojson.features.map((f) => f.properties.lp_visible)).toEqual([true, true]);
    const half = run(features, { ...options, leaders: 0.5 });
    await half.commands;
    expect(half.target.geojson.features.map((f) => f.properties.lp_visible)).toEqual([true, false]);
  });
});
