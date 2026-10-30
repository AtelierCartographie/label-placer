// Data embedded in docs/exemple-maplibre.html: the communes of Bretagne (region 53) from the
// benchmark data, [name, births 2018, longitude, latitude], from Lambert-93 (EPSG:2154).
// Usage: node scripts/maplibre-data.ts > out.json
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const communes: [string, string, number, number, number][] = JSON.parse(gunzipSync(readFileSync(new URL('../bench/data/communes-2018.json.gz', import.meta.url))).toString('utf8'));

// Lambert-93 to longitude and latitude on GRS80 (IGN, ALG0004).
const E = 0.0818191910428158;
const N = 0.725607765053267;
const C = 11754255.426096;
const XS = 700000;
const YS = 12655612.049876;
const LON0 = (3 * Math.PI) / 180;
function toLonLat(x: number, y: number): [number, number] {
  const dx = x - XS;
  const dy = y - YS;
  const r = Math.hypot(dx, dy);
  const gamma = Math.atan2(dx, -dy);
  const l = -Math.log(r / C) / N;
  let phi = 2 * Math.atan(Math.exp(l)) - Math.PI / 2;
  for (let k = 0; k < 10; k++) phi = 2 * Math.atan(Math.pow((1 + E * Math.sin(phi)) / (1 - E * Math.sin(phi)), E / 2) * Math.exp(l)) - Math.PI / 2;
  return [((LON0 + gamma / N) * 180) / Math.PI, (phi * 180) / Math.PI];
}

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const rows = communes.filter((c) => c[1] === '53').map((c) => {
  const [lon, lat] = toLonLat(c[3], c[4]);
  return [c[0], c[2], r4(lon), r4(lat)];
});
console.log(JSON.stringify(rows));
