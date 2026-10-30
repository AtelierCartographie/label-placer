import { describe, expect, it } from 'vitest';
import { mapLabels } from '../src/maplibre.ts';

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Towns of a made-up region around Rennes, in longitude and latitude. */
function towns(n: number) {
  const rnd = mulberry32(3);
  return {
    type: 'FeatureCollection' as const,
    features: Array.from({ length: n }, (_, i) => ({
      type: 'Feature' as const,
      properties: { name: 'Town ' + i, population: Math.round(Math.pow(rnd(), 3) * 200000) },
      geometry: { type: 'Point', coordinates: [-1.68 + (rnd() - 0.5) * 2, 48.11 + (rnd() - 0.5) * 1.2] }
    }))
  };
}

const world = (z: number) => 512 * Math.pow(2, z);
const project = (z: number, [lon, lat]: number[]) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return [((lon + 180) / 360) * world(z), (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * world(z)];
};

describe('mapLabels', () => {
  const data = towns(120);
  const placed = mapLabels(data, { text: 'name', priority: 'population', r: 3, minzoom: 7, maxzoom: 10, step: 1 });

  it('places the names at every zoom, with the zoom each one shows from', () => {
    const zooms = new Set(placed.labels.features.map((f) => f.properties!.lp_zoom));
    expect([...zooms].sort((a, b) => Number(a) - Number(b))).toEqual([7, 8, 9, 10]);
    expect(placed.result.levels).toHaveLength(4);
    // As many points at a zoom as names shown there, each with the zoom it shows from.
    placed.result.levels.forEach((r, k) => {
      const here = placed.labels.features.filter((f) => f.properties!.lp_zoom === 7 + k);
      expect(here).toHaveLength(r.stats.placed);
      for (const f of here) expect(f.properties!.lp_minzoom).toBeLessThanOrEqual(7 + k);
    });
    // More names as the map grows.
    const counts = placed.result.levels.map((r) => r.stats.placed);
    expect(counts).toEqual(counts.slice().sort((a, b) => a - b));
    expect(counts[3]).toBeGreaterThan(counts[0]);
  });

  it('sets a name next to its symbol at its anchor with an offset in ems, and a name with a leader at its place', () => {
    let near = 0;
    let far = 0;
    placed.result.levels.forEach((r, k) => {
      const z = 7 + k;
      const here = placed.labels.features.filter((f) => f.properties!.lp_zoom === z);
      r.labels.filter((p) => p.visible).forEach((p, j) => {
        const f = here[j];
        expect(f.properties!.name).toBe('Town ' + p.index);
        const at = f.geometry!.coordinates as number[];
        if (!p.leader) {
          near++;
          expect(at).toEqual(data.features[p.index].geometry.coordinates);
          expect(f.properties!.lp_offset).toEqual([p.offset[0] / 12, p.offset[1] / 12]);
        } else {
          far++;
          const [x, y] = project(z, at);
          expect(x).toBeCloseTo(p.x, 6);
          expect(y).toBeCloseTo(p.y, 6);
        }
      });
    });
    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThan(0);
    expect(placed.leaders.features).toHaveLength(far);
  });

  it('names the text anchor as MapLibre does', () => {
    const anchors = new Set(placed.labels.features.map((f) => f.properties!.lp_anchor));
    for (const a of anchors) expect(['left', 'right', 'top', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'center']).toContain(a);
    expect(anchors.has('left')).toBe(true);
  });

  it('places every half zoom by default', () => {
    const half = mapLabels(data, { text: 'name', r: 3, minzoom: 7, maxzoom: 8 });
    expect(half.result.levels).toHaveLength(3);
    expect(half.layers({ labels: 'l', leaders: 'd' }).filter((l) => l.type === 'symbol').map((l) => [l.minzoom, l.maxzoom])).toEqual([[7, 7.5], [7.5, 8], [8, undefined]]);
  });

  it('gives a pair of layers per zoom, each shown from its zoom to the next', () => {
    const layers = placed.layers({ labels: 'src-l', leaders: 'src-d', font: ['Noto Sans Regular'] });
    expect(layers).toHaveLength(8);
    expect(layers.map((l) => [l.type, l.minzoom, l.maxzoom])).toEqual([
      ['line', 7, 8], ['symbol', 7, 8], ['line', 8, 9], ['symbol', 8, 9], ['line', 9, 10], ['symbol', 9, 10], ['line', 10, undefined], ['symbol', 10, undefined]
    ]);
    expect(layers[1]).toMatchObject({ source: 'src-l', filter: ['==', ['get', 'lp_zoom'], 7], layout: { 'text-font': ['Noto Sans Regular'], 'text-allow-overlap': true, 'text-ignore-placement': true } });
  });
});
