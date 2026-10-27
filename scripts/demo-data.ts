// Data embedded in docs/comment-ca-marche.html for its other zones.
// Usage: node scripts/demo-data.ts > out.json
// - Normandie: communes of region 28 from the benchmark data, [name, births 2018, x, y] in Lambert-93 decametres.
// - Monde: countries of world-countries.geojson (Natural Earth 1:110m) with their 2023 population (World Bank),
//   projected with Equal Earth in kilometres (y up): rows [French name, population, x, y] at an interior point,
//   and outlines simplified for the background.
// - Départements: the 96 départements of metropolitan France (IGN Admin Express 2025) with their births in 2018
//   summed from the communes, [name, births, x, y] at an interior point in Lambert-93 decametres, their codes,
//   their outlines, and the outline of France (coasts and borders) as lines.
// - Europe: the countries of Europe and its edges by name, for a blank basemap (see below).
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

type Pt = [number, number];
const data = (f: string) => readFileSync(new URL(`../bench/data/${f}`, import.meta.url));
const r1 = (v: number) => Math.round(v * 10) / 10;

const communes: [string, string, number, number, number][] = JSON.parse(gunzipSync(data('communes-2018.json.gz')).toString('utf8'));
const normandie = communes.filter((c) => c[1] === '28').map((c) => [c[0], c[2], r1(c[3] / 10), r1(c[4] / 10)]);

// ISO 3166 alpha-3 to alpha-2, for the French names of Intl.DisplayNames.
const ISO2: Record<string, string> = {
  AFG: 'AF', AGO: 'AO', ALB: 'AL', ARE: 'AE', ARG: 'AR', ARM: 'AM', ATF: 'TF', AUS: 'AU', AUT: 'AT', AZE: 'AZ', BDI: 'BI', BEL: 'BE',
  BEN: 'BJ', BFA: 'BF', BGD: 'BD', BGR: 'BG', BHS: 'BS', BIH: 'BA', BLR: 'BY', BLZ: 'BZ', BMU: 'BM', BOL: 'BO', BRA: 'BR', BRN: 'BN',
  BTN: 'BT', BWA: 'BW', CAF: 'CF', CAN: 'CA', CHE: 'CH', CHL: 'CL', CHN: 'CN', CIV: 'CI', CMR: 'CM', COD: 'CD', COG: 'CG', COL: 'CO',
  CRI: 'CR', CUB: 'CU', CYP: 'CY', CZE: 'CZ', DEU: 'DE', DJI: 'DJ', DNK: 'DK', DOM: 'DO', DZA: 'DZ', ECU: 'EC', EGY: 'EG', ERI: 'ER',
  ESP: 'ES', EST: 'EE', ETH: 'ET', FIN: 'FI', FJI: 'FJ', FLK: 'FK', FRA: 'FR', GAB: 'GA', GBR: 'GB', GEO: 'GE', GHA: 'GH', GIN: 'GN',
  GMB: 'GM', GNB: 'GW', GNQ: 'GQ', GRC: 'GR', GRL: 'GL', GTM: 'GT', GUF: 'GF', GUY: 'GY', HND: 'HN', HRV: 'HR', HTI: 'HT', HUN: 'HU',
  IDN: 'ID', IND: 'IN', IRL: 'IE', IRN: 'IR', IRQ: 'IQ', ISL: 'IS', ISR: 'IL', ITA: 'IT', JAM: 'JM', JOR: 'JO', JPN: 'JP', KAZ: 'KZ',
  KEN: 'KE', KGZ: 'KG', KHM: 'KH', KOR: 'KR', 'CS-KM': 'XK', KWT: 'KW', LAO: 'LA', LBN: 'LB', LBR: 'LR', LBY: 'LY', LKA: 'LK', LSO: 'LS',
  LTU: 'LT', LUX: 'LU', LVA: 'LV', MAR: 'MA', MDA: 'MD', MDG: 'MG', MEX: 'MX', MKD: 'MK', MLI: 'ML', MLT: 'MT', MMR: 'MM', MNE: 'ME',
  MNG: 'MN', MOZ: 'MZ', MRT: 'MR', MWI: 'MW', MYS: 'MY', NAM: 'NA', NCL: 'NC', NER: 'NE', NGA: 'NG', NIC: 'NI', NLD: 'NL', NOR: 'NO',
  NPL: 'NP', NZL: 'NZ', OMN: 'OM', PAK: 'PK', PAN: 'PA', PER: 'PE', PHL: 'PH', PNG: 'PG', POL: 'PL', PRI: 'PR', PRK: 'KP', PRT: 'PT',
  PRY: 'PY', QAT: 'QA', ROU: 'RO', RUS: 'RU', RWA: 'RW', ESH: 'EH', SAU: 'SA', SDN: 'SD', SSD: 'SS', SEN: 'SN', SLB: 'SB', SLE: 'SL',
  SLV: 'SV', SOM: 'SO', SRB: 'RS', SUR: 'SR', SVK: 'SK', SVN: 'SI', SWE: 'SE', SWZ: 'SZ', SYR: 'SY', TCD: 'TD', TGO: 'TG', THA: 'TH',
  TJK: 'TJ', TKM: 'TM', TLS: 'TL', TTO: 'TT', TUN: 'TN', TUR: 'TR', TWN: 'TW', TZA: 'TZ', UGA: 'UG', UKR: 'UA', URY: 'UY', USA: 'US',
  UZB: 'UZ', VEN: 'VE', VNM: 'VN', VUT: 'VU', PSE: 'PS', YEM: 'YE', ZAF: 'ZA', ZMB: 'ZM', ZWE: 'ZW'
};
const fr = new Intl.DisplayNames(['fr'], { type: 'region' });
// Shorter names, as on the Atelier's maps.
const SHORT: Record<string, string> = { CD: 'RD Congo', CG: 'Congo', MM: 'Myanmar', PS: 'Palestine', VA: 'Vatican' };
// World Bank codes that differ from the outlines' ids.
const WB: Record<string, string> = { 'CS-KM': 'XKX' };

// Equal Earth (Šavrič, Patterson & Jenny, 2018), in kilometres on a sphere of radius 6371.
function equalEarth([lon, lat]: Pt): Pt {
  const [A1, A2, A3, A4] = [1.340264, -0.081106, 0.000893, 0.003796];
  const t = Math.asin((Math.sqrt(3) / 2) * Math.sin((lat * Math.PI) / 180));
  const t2 = t * t, t6 = t2 * t2 * t2;
  const x = (2 * Math.sqrt(3) * ((lon * Math.PI) / 180) * Math.cos(t)) / (3 * (9 * A4 * t6 * t2 + 7 * A3 * t6 + 3 * A2 * t2 + A1));
  const y = A4 * t6 * t2 * t + A3 * t6 * t + A2 * t2 * t + A1 * t;
  return [x * 6371, y * 6371];
}

// Douglas–Peucker, on each half of a closed ring.
function simplifyRing(ring: Pt[], tolerance: number): Pt[] {
  const mid = ring.length >> 1;
  return [...simplify(ring.slice(0, mid + 1), tolerance).slice(0, -1), ...simplify(ring.slice(mid), tolerance)];
}
function simplify(ring: Pt[], tolerance: number): Pt[] {
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  const stack: [number, number][] = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = ring[a], [bx, by] = ring[b];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let far = -1, dist = tolerance;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - ring[i][1]) - (ax - ring[i][0]) * (by - ay)) / len;
      if (d > dist) [far, dist] = [i, d];
    }
    if (far > 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return ring.filter((_, i) => keep[i]);
}

const area = (ring: Pt[]) => ring.reduce((s, [x, y], i) => s + x * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * y, 0) / 2;
function inside(x: number, y: number, rings: Pt[][]): boolean {
  let c = false;
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) if (r[i][1] > y !== r[j][1] > y && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
  return c;
}
function edgeDistance(x: number, y: number, rings: Pt[][]): number {
  let best = Infinity;
  for (const r of rings)
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [ax, ay] = r[j], [bx, by] = r[i];
      const l2 = (bx - ax) ** 2 + (by - ay) ** 2;
      const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / l2)) : 0;
      best = Math.min(best, Math.hypot(ax + t * (bx - ax) - x, ay + t * (by - ay) - y));
    }
  return best;
}
// Interior point farthest from the outline, on a 40 × 40 grid over the largest polygon.
function pole(rings: Pt[][]): Pt {
  const xs = rings[0].map((p) => p[0]), ys = rings[0].map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let best: Pt = rings[0][0], d = -1;
  for (let i = 0; i <= 40; i++)
    for (let j = 0; j <= 40; j++) {
      const x = x0 + ((x1 - x0) * i) / 40, y = y0 + ((y1 - y0) * j) / 40;
      if (!inside(x, y, rings)) continue;
      const e = edgeDistance(x, y, rings);
      if (e > d) [best, d] = [[x, y], e];
    }
  return best;
}

const population = new Map(
  readFileSync(new URL('../bench/data/world-population-2023.csv', import.meta.url), 'utf8')
    .trim().split('\n').slice(1)
    .map((line) => line.match(/^(?:"[^"]*"|[^,]*),([A-Z]{3}),\d+,(\d*)/))
    .filter((m): m is RegExpMatchArray => !!m && m[2] !== '')
    .map((m) => [m[1], +m[2]])
);
const world = JSON.parse(gunzipSync(data('world-countries.geojson.gz')).toString('utf8'));
const rows: [string, number, number, number][] = [];
const outlines: number[][][] = [];
const missing: string[] = [];
for (const f of world.features) {
  if (f.id === 'ATA') continue;
  const polygons: Pt[][][] = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const projected = polygons.map((p) => p.map((ring) => ring.map(equalEarth)));
  for (const p of projected) for (const ring of p) {
    const s = simplifyRing(ring, 12);
    if (s.length > 3) outlines.push(s.map(([x, y]) => [Math.round(x), Math.round(y)]));
  }
  const iso2 = ISO2[f.id];
  const pop = population.get(WB[f.id] ?? f.id);
  if (!iso2 || !pop) {
    missing.push(`${f.id} ${f.properties.name}`);
    continue;
  }
  const largest = projected.reduce((a, b) => (Math.abs(area(b[0])) > Math.abs(area(a[0])) ? b : a));
  const [x, y] = pole(largest);
  rows.push([SHORT[iso2] ?? fr.of(iso2)!, pop, Math.round(x), Math.round(y)]);
}
// Départements, from france-departements-2025.geojson.gz, made with GDAL from Admin Express (see bench/data).
const deps = JSON.parse(gunzipSync(data('france-departements-2025.geojson.gz')).toString('utf8'));
const depFeatures = deps.features.filter((f: { properties: { code: string } }) => f.properties.code !== 'contour');
const depPolygons: Pt[][][][] = depFeatures.map((f: { geometry: { type: string; coordinates: unknown } }) =>
  f.geometry.type === 'Polygon' ? [f.geometry.coordinates as Pt[][]] : (f.geometry.coordinates as Pt[][][])
);
const boxes = depPolygons.map((polys) => {
  const pts = polys.flat(2);
  return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
});
const births = depPolygons.map(() => 0);
for (const c of communes) {
  const k = depPolygons.findIndex((polys, d) => {
    const b = boxes[d];
    return c[3] >= b[0] && c[3] <= b[2] && c[4] >= b[1] && c[4] <= b[3] && polys.some((p) => inside(c[3], c[4], p));
  });
  if (k >= 0) births[k] += c[2];
}
const dam = (ring: Pt[]) => ring.map(([x, y]) => [Math.round(x / 10), Math.round(y / 10)]);
const departements = {
  rows: depFeatures.map((f: { properties: { nom: string } }, d: number) => {
    const largest = depPolygons[d].reduce((a, b) => (Math.abs(area(b[0])) > Math.abs(area(a[0])) ? b : a));
    const [x, y] = pole(largest);
    return [f.properties.nom, births[d], r1(x / 10), r1(y / 10)];
  }),
  // Official codes (75, 2A...), for maps that number the départements a name does not fit.
  codes: depFeatures.map((f: { properties: { code: string } }) => f.properties.code),
  polygons: depPolygons.map((polys) => polys.flatMap((p) => p.map((ring) => dam(simplifyRing(ring, 1200))).filter((r) => r.length > 3))),
  coast: (deps.features.find((f: { properties: { code: string } }) => f.properties.code === 'contour').geometry.coordinates as Pt[][]).map((line) =>
    dam(line[0][0] === line[line.length - 1][0] && line[0][1] === line[line.length - 1][1] ? simplifyRing(line, 1200) : simplify(line, 1200))
  )
};
// Europe by country, for a blank basemap: Natural Earth outlines in Lambert azimuthal equal-area
// (EPSG:3035 on a sphere), in kilometres with y up, clipped to the frame. Rows as for the world, the
// microstates too small for 1:110m as points (polygon null), and the land around as context.
function laea([lon, lat]: Pt): Pt {
  const [l0, p0] = [(10 * Math.PI) / 180, (52 * Math.PI) / 180];
  const [l, p] = [(lon * Math.PI) / 180, (lat * Math.PI) / 180];
  const k = Math.sqrt(2 / (1 + Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l - l0)));
  return [6371 * k * Math.cos(p) * Math.sin(l - l0), 6371 * k * (Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l - l0))];
}
const FRAME: [number, number, number, number] = [-1800, -1850, 3150, 2200];
// Sutherland–Hodgman against each side of the frame.
function clipRing(ring: Pt[]): Pt[] {
  const sides: [(p: Pt) => boolean, (a: Pt, b: Pt) => Pt][] = [0, 1, 2, 3].map((s) => {
    const axis = s % 2, v = FRAME[s], lo = s < 2;
    const ok = (p: Pt) => (lo ? p[axis] >= v : p[axis] <= v);
    const cut = (a: Pt, b: Pt): Pt => {
      const t = (v - a[axis]) / (b[axis] - a[axis]);
      return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    };
    return [ok, cut];
  });
  let out = ring;
  for (const [ok, cut] of sides) {
    const src = out;
    out = [];
    for (let i = 0; i < src.length; i++) {
      const a = src[(i + src.length - 1) % src.length], b = src[i];
      if (ok(b)) {
        if (!ok(a)) out.push(cut(a, b));
        out.push(b);
      } else if (ok(a)) out.push(cut(a, b));
    }
    if (!out.length) break;
  }
  return out;
}
const EUROPE = [
  'ISL', 'NOR', 'SWE', 'FIN', 'DNK', 'EST', 'LVA', 'LTU', 'IRL', 'GBR', 'NLD', 'BEL', 'LUX', 'FRA', 'DEU', 'POL', 'CZE', 'SVK', 'AUT', 'CHE',
  'ESP', 'PRT', 'ITA', 'SVN', 'HRV', 'BIH', 'SRB', 'MNE', 'CS-KM', 'MKD', 'ALB', 'GRC', 'BGR', 'ROU', 'MDA', 'UKR', 'BLR', 'HUN', 'MLT', 'CYP',
  'RUS', 'TUR', 'GEO', 'ARM', 'AZE'
];
// Andorra, Monaco, Liechtenstein, San Marino, the Vatican: [ISO 3166 alpha-3, alpha-2, lon, lat, population].
const MICRO: [string, string, number, number, number][] = [
  ['AND', 'AD', 1.52, 42.51, 0], ['MCO', 'MC', 7.42, 43.74, 0], ['LIE', 'LI', 9.55, 47.16, 0], ['SMR', 'SM', 12.46, 43.94, 0], ['VAT', 'VA', 12.45, 41.9, 764]
];
const europe = { frame: FRAME, rows: [] as [string, number, number, number][], codes: [] as string[], polygons: [] as (number[][][] | null)[], context: [] as number[][][] };
const euroRings = (f: { geometry: { type: string; coordinates: unknown } }) =>
  (f.geometry.type === 'Polygon' ? [f.geometry.coordinates as Pt[][]] : (f.geometry.coordinates as Pt[][][])).map((p) =>
    p.map((ring) => clipRing(simplifyRing(ring.map(laea), 3))).filter((r) => r.length > 3 && Math.abs(area(r)) > 20)
  ).filter((p) => p.length);
for (const id of EUROPE) {
  // Northern Cyprus is drawn with Cyprus, as on the maps of the countries recognized.
  const fs = world.features.filter((f: { id: string; properties: { name: string } }) => f.id === id || (id === 'CYP' && f.properties.name === 'Northern Cyprus'));
  const polys = fs.flatMap(euroRings);
  const largest = polys.reduce((a: Pt[][], b: Pt[][]) => (Math.abs(area(b[0])) > Math.abs(area(a[0])) ? b : a));
  const [x, y] = pole(largest);
  const iso2 = ISO2[id];
  europe.rows.push([SHORT[iso2] ?? fr.of(iso2)!, population.get(WB[id] ?? id)!, Math.round(x), Math.round(y)]);
  europe.codes.push(iso2);
  europe.polygons.push(polys.flat().map((r: Pt[]) => r.map(([px, py]) => [Math.round(px), Math.round(py)])));
}
for (const [iso3, iso2, lon, lat, pop] of MICRO) {
  const [x, y] = laea([lon, lat]);
  europe.rows.push([SHORT[iso2] ?? fr.of(iso2)!, population.get(iso3) ?? pop, Math.round(x), Math.round(y)]);
  europe.codes.push(iso2);
  europe.polygons.push(null);
}
for (const f of world.features)
  if (!EUROPE.includes(f.id) && f.properties.name !== 'Northern Cyprus')
    for (const p of euroRings(f)) for (const r of p) europe.context.push(r.map(([px, py]) => [Math.round(px), Math.round(py)]));
process.stderr.write(`europe ${europe.rows.length}, points ${europe.polygons.flat(2).length}, context ${europe.context.length} rings\n`);
process.stderr.write(`departements ${departements.rows.length}, births ${births.reduce((a, b) => a + b, 0)}, points ${departements.polygons.flat(2).length}, coast ${departements.coast.flat().length}\n`);
process.stderr.write(`normandie ${normandie.length}, world ${rows.length}, outlines ${outlines.length} (${outlines.reduce((s, r) => s + r.length, 0)} points), without data: ${missing.join('; ')}\n`);
process.stdout.write(JSON.stringify({ normandie, world: { rows, outlines }, departements, europe }));
