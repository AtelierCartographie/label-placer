function rt(f, t, s, i, e, o, r, n) {
  return f < r && e < s && t < n && o < i;
}
function ht(f, t, s, i, e, o, r, n) {
  let h = 0, l = 1;
  const a = s - f, c = i - t, u = (d, g) => {
    if (d === 0) return g > 0;
    const y = g / d;
    if (d < 0) {
      if (y > l) return !1;
      y > h && (h = y);
    } else {
      if (y < h) return !1;
      y < l && (l = y);
    }
    return !0;
  };
  return u(-a, f - e) && u(a, r - f) && u(-c, t - o) && u(c, n - t) && h < l;
}
function ft(f, t, s, i, e, o, r, n) {
  const h = (l, a, c, u, d, g) => Math.sign((c - l) * (g - a) - (u - a) * (d - l));
  return h(f, t, s, i, e, o) * h(f, t, s, i, r, n) < 0 && h(e, o, r, n, f, t) * h(e, o, r, n, s, i) < 0;
}
function U(f) {
  let [t, s, i, e] = [1 / 0, 1 / 0, -1 / 0, -1 / 0];
  for (const o of f)
    for (const [r, n] of o)
      t = Math.min(t, r), s = Math.min(s, n), i = Math.max(i, r), e = Math.max(e, n);
  return [t, s, i, e];
}
function ut(f, t, s) {
  let i = !1;
  for (const e of s)
    for (let o = 0, r = e.length - 1; o < e.length; r = o++) {
      const [n, h] = e[o], [l, a] = e[r];
      h > t != a > t && f < (l - n) * (t - h) / (a - h) + n && (i = !i);
    }
  return i;
}
function dt([f, t, s, i], e) {
  for (const o of e)
    for (let r = 0, n = o.length - 1; r < o.length; n = r++) {
      const [h, l] = o[n], [a, c] = o[r];
      if (!(h < f && a < f || h > s && a > s || l < t && c < t || l > i && c > i) && ht(h, l, a, c, f, t, s, i))
        return !0;
    }
  return !1;
}
function H(f, t, s = U(t)) {
  const [i, e, o, r] = f;
  return o <= s[0] || i >= s[2] || r <= s[1] || e >= s[3] ? "outside" : dt(f, t) ? "crossing" : ut((i + o) / 2, (e + r) / 2, t) ? "inside" : "outside";
}
function gt(f, t, s, i, e) {
  let o = 1 / 0;
  for (const r of e)
    for (let n = 0, h = r.length - 1; n < r.length; h = n++) {
      const [l, a] = r[h], c = r[n][0] - l, u = r[n][1] - a, d = s * u - i * c;
      if (d === 0) continue;
      const g = ((l - f) * u - (a - t) * c) / d, y = ((l - f) * i - (a - t) * s) / d;
      g > 0 && y >= 0 && y <= 1 && g < o && (o = g);
    }
  return o === 1 / 0 ? 0 : o;
}
function yt(f, t) {
  if (H(f, t) !== "outside") return 0;
  const [s, i, e, o] = f, r = (h, l) => Math.hypot(Math.max(0, s - h, h - e), Math.max(0, i - l, l - o));
  let n = 1 / 0;
  for (const h of t)
    for (let l = 0, a = h.length - 1; l < h.length; a = l++) {
      const [c, u] = h[a], [d, g] = h[l];
      n = Math.min(n, r(c, u));
      const y = d - c, b = g - u, M = y * y + b * b;
      for (const [x, p] of [[s, i], [e, i], [s, o], [e, o]]) {
        const m = M > 0 ? Math.min(1, Math.max(0, ((x - c) * y + (p - u) * b) / M)) : 0;
        n = Math.min(n, Math.hypot(c + m * y - x, u + m * b - p));
      }
    }
  return n;
}
const q = (f, t, s) => Math.min(Math.max(f, t), s), O = (f) => f < 0 ? -1 : 1, W = (f, t, s) => f < t ? t - f : f > s ? f - s : 0;
function lt([f, t], [s, i]) {
  return { horizontal: W(0, f - s, f + s), vertical: W(0, t - i, t + i) };
}
function at(f, t) {
  const [s, i] = ct(f, t), e = lt(s, i), o = 1e-9 * Math.max(1, e.vertical);
  return e.horizontal === 0 || e.horizontal < e.vertical - o ? "middle" : s[0] > 0 ? "start" : "end";
}
function ct([f, t], [s, i, e, o]) {
  return [
    [(s + e) / 2 - f, (i + o) / 2 - t],
    [(e - s) / 2, (o - i) / 2]
  ];
}
function X([f, t], [s]) {
  const i = f - s > 0 ? f - s : f + s < 0 ? f + s : null;
  return i === null || Math.abs(t) > Math.abs(i) ? null : { port: [i, t], end: "horizontal" };
}
function K([f, t], [s, i]) {
  const e = t - i > 0 ? t - i : t + i < 0 ? t + i : null;
  if (e === null) return null;
  const o = q(0, f - s / 2, f + s / 2);
  if (Math.abs(o) <= Math.abs(e)) return { port: [o, e], end: "vertical" };
  const r = O(o) * Math.abs(e);
  return r >= f - s && r <= f + s ? { port: [r, e], end: "diagonal" } : null;
}
function pt([f, t], [s, i]) {
  const e = O(f), o = O(t), r = Math.max(e * f - s, o * t - i, 0), n = Math.min(e * f + s, o * t + i);
  return r > 0 && r <= n ? { port: [e * r, o * r], end: "diagonal" } : null;
}
function z({ anchor: f, symbol: t, box: s, style: i = "octilinear", symbolGap: e = 0, minGap: o = 0 }) {
  const [r, n] = ct(f, s), [h, l] = r, [a, c] = n, u = [q(0, h - a, h + a), q(0, l - c, l + c)], d = Math.hypot(u[0], u[1]);
  if (d === 0) return null;
  const g = L(t, u[0] / d, u[1] / d, f);
  if (d - g < o) return null;
  const y = lt(r, n), M = (y.horizontal >= y.vertical ? [X, K] : [K, X]).reduce((k, R) => k ?? R(r, n), null) ?? pt(r, n);
  if (!M) return null;
  const { port: x, end: p } = M, [m, w] = x, A = (k) => t?.type === "polygon" ? 0 : k > 0 ? k + e : 0, j = (k) => k.map(([R, G]) => [f[0] + R, f[1] + G]), C = (k, R) => {
    const G = Math.hypot(k, R);
    if (G === 0) return null;
    const B = A(L(t, k / G, R / G, f));
    return B < G ? [k / G * B, R / G * B] : null;
  };
  if (i === "straight") {
    const k = C(m, w);
    return k ? j([k, x]) : null;
  }
  const v = i === "orthogonal" ? p === "vertical" ? [m, 0] : [0, w] : p === "horizontal" ? [O(m) * Math.abs(w), w] : p === "vertical" ? [m, O(w) * Math.abs(m)] : x, I = C(v[0], v[1]);
  if (I) return j(v[0] === m && v[1] === w ? [I, x] : [I, v, x]);
  const S = A(L(t, p === "vertical" ? 0 : O(m), p === "vertical" ? O(w) : 0, f)), E = p === "vertical" ? [m, O(w) * Math.sqrt(Math.max(0, S * S - m * m))] : [O(m) * Math.sqrt(Math.max(0, S * S - w * w)), w];
  return j([E, x]);
}
function L(f, t, s, i) {
  if (!f) return 0;
  switch (f.type) {
    case "circle":
      return f.radius;
    case "rect": {
      const e = t === 0 ? 1 / 0 : f.width / 2 / Math.abs(t), o = s === 0 ? 1 / 0 : f.height / 2 / Math.abs(s);
      return Math.min(e, o);
    }
    case "area":
      return 0;
    case "polygon":
      return i ? gt(i[0], i[1], t, s, f.rings) : 0;
  }
}
const mt = {
  "top-right": [1, -1],
  "top-left": [-1, -1],
  "bottom-right": [1, 1],
  "bottom-left": [-1, 1],
  right: [1, 0],
  left: [-1, 0],
  top: [0, -1],
  bottom: [0, 1]
}, bt = ["right", "top", "left", "bottom", "top-right", "top-left", "bottom-right", "bottom-left"], Y = -1;
function _(f, t, s, i, e, o, r) {
  let [n, h, l, a] = f;
  if (r)
    for (const [c, u] of r)
      n = Math.min(n, c), h = Math.min(h, u), l = Math.max(l, c), a = Math.max(a, u);
  return { x0: f[0], y0: f[1], x1: f[2], y1: f[3], cost: t, placement: s, ring: i, textAnchor: e, baseline: o, leader: r, layout: 0, hard: 0, bx0: n, by0: h, bx1: l, by1: a };
}
const D = [];
for (let f = -6; f <= 6; f++) for (let t = -8; t <= 8; t++) D.push([t / 2, f / 2]);
D.sort((f, t) => Math.hypot(...f) - Math.hypot(...t));
const xt = 0.5;
function $(f, t) {
  const s = J(f, f.width, f.height, t);
  return f.layouts?.forEach((i, e) => {
    if (i.width > 0 && i.height > 0)
      for (const o of J(f, i.width, i.height, t))
        o.cost += i.cost ?? 0.5, o.layout = e + 1, s.push(o);
  }), s.sort((i, e) => i.cost - e.cost);
}
function J(f, t, s, i) {
  const { x: e, y: o, symbol: r } = f, n = [];
  if (r?.type === "polygon") {
    if (i.inside) {
      const l = U(r.rings);
      for (const [a, c] of D) {
        const u = e + a * i.unit, d = o + c * i.unit, g = [u - t / 2, d - s / 2, u + t / 2, d + s / 2];
        H(g, r.rings, l) === "inside" && n.push(_(g, Y + xt * Math.hypot(a, c), "center", 0, "middle", "middle", null));
      }
    }
  } else if (r?.type === "area") {
    const l = Math.hypot(t / 2, s / 2), a = r.inscribedRadius > 0 ? Math.min(1, Math.max(0, l / r.inscribedRadius - 1)) : 1;
    n.push(_([e - t / 2, o - s / 2, e + t / 2, o + s / 2], i.areaOverflowCost * a, "center", 0, "middle", "middle", null));
  } else i.inside && r && (r.type === "circle" ? Math.hypot(t / 2, s / 2) <= r.radius : t <= r.width && s <= r.height) && n.push(_([e - t / 2, o - s / 2, e + t / 2, o + s / 2], Y, "inside", 0, "middle", "middle", null));
  const h = f.leader === !1 ? [0] : [0, ...i.rings];
  for (let l = 0; l < h.length; l++)
    for (let a = 0; a < i.positions.length; a++) {
      const c = i.positions[a], [u, d] = mt[c], g = u !== 0 && d !== 0 ? Math.SQRT1_2 : 1, y = i.gap + h[l];
      let b, M;
      if (r?.type === "rect")
        b = e + u * (r.width / 2 + y * g), M = o + d * (r.height / 2 + y * g);
      else {
        const S = r ? L(r, u * g, d * g, [e, o]) : 0;
        b = e + u * (S + y) * g, M = o + d * (S + y) * g;
      }
      const x = u > 0 ? b : u < 0 ? b - t : b - t / 2, p = d > 0 ? M : d < 0 ? M - s : M - s / 2, m = [x, p, x + t, p + s], w = at([e, o], m), A = d > 0 ? "top" : d < 0 ? "bottom" : "middle", j = r?.type === "area" || r?.type === "polygon" ? a + 1 : a;
      if (l === 0) {
        n.push(_(m, j, c, 0, w, A, null));
        continue;
      }
      const C = z({ anchor: [e, o], symbol: r, box: m, style: i.leaderStyle, symbolGap: i.symbolGap, minGap: i.minGap });
      if (!C) continue;
      let v = 0;
      for (let S = 1; S < C.length; S++) v += Math.hypot(C[S][0] - C[S - 1][0], C[S][1] - C[S - 1][1]);
      if (r?.type === "polygon") {
        const [S, E] = C[0], [k, R] = C[1], G = Math.hypot(k - S, R - E);
        G > 0 && (v -= Math.min(G, L(r, (k - S) / G, (R - E) / G, [S, E])));
      }
      const I = j + i.leaderBaseCost + i.leaderLengthCost * v / i.unit;
      n.push(_(m, I, c, l, w, A, C));
    }
  return n;
}
class Mt {
  x;
  y;
  /** Half extents; a circle has its radius in both. */
  hw;
  hh;
  round;
  /** Compressed grid: the features of cell c are items[start[c]] to items[start[c + 1] - 1]. */
  start;
  items;
  nx;
  ny;
  x0;
  y0;
  size;
  seen;
  visit = 0;
  constructor(t, s, i) {
    const e = t.length;
    this.x = new Float64Array(e), this.y = new Float64Array(e), this.hw = new Float64Array(e), this.hh = new Float64Array(e), this.round = new Uint8Array(e), this.seen = new Int32Array(e), this.x0 = s[0], this.y0 = s[1], this.size = i, this.nx = Math.max(1, Math.ceil((s[2] - s[0]) / i)), this.ny = Math.max(1, Math.ceil((s[3] - s[1]) / i));
    const o = [], r = new Int32Array(this.nx * this.ny + 1);
    t.forEach((n, h) => {
      const l = n.symbol;
      if (this.x[h] = n.x, this.y[h] = n.y, l?.type === "circle" ? (this.hw[h] = this.hh[h] = l.radius, this.round[h] = 1) : l?.type === "rect" && (this.hw[h] = l.width / 2, this.hh[h] = l.height / 2), l?.type === "area" || l?.type === "polygon") return;
      const a = this.range(n.x - this.hw[h], n.y - this.hh[h], n.x + this.hw[h], n.y + this.hh[h]);
      o[h] = a;
      for (let c = a[1]; c <= a[3]; c++) for (let u = a[0]; u <= a[2]; u++) r[c * this.nx + u + 1]++;
    });
    for (let n = 1; n < r.length; n++) r[n] += r[n - 1];
    this.start = r.slice(), this.items = new Int32Array(r[r.length - 1]), o.forEach((n, h) => {
      for (let l = n[1]; l <= n[3]; l++) for (let a = n[0]; a <= n[2]; a++) this.items[r[l * this.nx + a]++] = h;
    });
  }
  /** Distance from the box to feature k: to its circle or rectangle, or to its anchor. */
  distance(t, s, i, e, o) {
    const r = this.x[t], n = this.y[t];
    if (this.round[t]) return Math.max(0, Math.hypot(Math.max(0, s - r, r - e), Math.max(0, i - n, n - o)) - this.hw[t]);
    const h = this.hw[t], l = this.hh[t];
    return Math.hypot(Math.max(0, s - r - h, r - h - e), Math.max(0, i - n - l, n - l - o));
  }
  /**
   * From 0, every other feature at least `margin` farther from the box than feature i (or
   * than `own`), to 1, one as close. A feature whose anchor the box covers is hidden by the label: the soft
   * cost handles it.
   */
  ambiguity(t, [s, i, e, o], r, n = this.distance(t, s, i, e, o)) {
    const h = n + r, [l, a, c, u] = this.range(s - h, i - h, e + h, o + h), d = ++this.visit;
    let g = 0;
    for (let y = a; y <= u; y++)
      for (let b = y * this.nx + l, M = y * this.nx + c; b <= M; b++)
        for (let x = this.start[b], p = this.start[b + 1]; x < p; x++) {
          const m = this.items[x];
          if (m === t || this.seen[m] === d) continue;
          this.seen[m] = d;
          const w = this.x[m], A = this.y[m];
          if (w > s && w < e && A > i && A < o) continue;
          const j = this.distance(m, s, i, e, o);
          if (!(j >= h)) {
            if (r <= 0 || j <= h - r) return 1;
            g = Math.max(g, (h - j) / r);
          }
        }
    return g;
  }
  range(t, s, i, e) {
    const o = (n) => Math.min(this.nx - 1, Math.max(0, Math.floor((n - this.x0) / this.size))), r = (n) => Math.min(this.ny - 1, Math.max(0, Math.floor((n - this.y0) / this.size)));
    return [o(t), r(s), o(i), r(e)];
  }
}
class V {
  cells;
  nx;
  ny;
  x0;
  y0;
  size;
  constructor(t, s, i, e, o) {
    this.x0 = t, this.y0 = s, this.size = o, this.nx = Math.max(1, Math.ceil((i - t) / o)), this.ny = Math.max(1, Math.ceil((e - s) / o)), this.cells = Array.from({ length: this.nx * this.ny }, () => []);
  }
  /** Cell range `[i0, j0, i1, j1]` covering the box, clamped to the grid. */
  range(t, s, i, e) {
    const o = (n) => Math.min(this.nx - 1, Math.max(0, Math.floor((n - this.x0) / this.size))), r = (n) => Math.min(this.ny - 1, Math.max(0, Math.floor((n - this.y0) / this.size)));
    return [o(t), r(s), o(i), r(e)];
  }
  insert(t, s, i, e, o) {
    const [r, n, h, l] = this.range(s, i, e, o);
    for (let a = n; a <= l; a++) for (let c = r; c <= h; c++) this.cells[a * this.nx + c].push(t);
  }
  remove(t, s, i, e, o) {
    const [r, n, h, l] = this.range(s, i, e, o);
    for (let a = n; a <= l; a++)
      for (let c = r; c <= h; c++) {
        const u = this.cells[a * this.nx + c], d = u.indexOf(t);
        d >= 0 && (u[d] = u[u.length - 1], u.pop());
      }
  }
}
class wt {
  width;
  height;
  bx0;
  by0;
  res;
  hard;
  soft;
  hardSat = null;
  softSat = null;
  /** Lines, kept apart because they block label boxes, not leaders. Allocated on first use. */
  lineHard = null;
  lineSoft = null;
  lineHardSat = null;
  lineSoftSat = null;
  /** Soft polygons, as the summed cost of the polygons over each cell. Allocated on first use. */
  areaCost = null;
  areaCostSat = null;
  constructor(t, s) {
    this.bx0 = t[0], this.by0 = t[1], this.res = s, this.width = Math.max(1, Math.ceil((t[2] - t[0]) * s)), this.height = Math.max(1, Math.ceil((t[3] - t[1]) * s)), this.hard = new Uint16Array(this.width * this.height), this.soft = new Uint16Array(this.width * this.height);
  }
  addCircle(t, s, i, e) {
    const o = e ? this.soft : this.hard, { width: r, height: n, res: h } = this, l = (t - this.bx0) * h, a = (s - this.by0) * h, c = i * h, u = Math.max(0, Math.floor(a - c)), d = Math.min(n - 1, Math.ceil(a + c)), g = Math.max(0, Math.floor(l - c)), y = Math.min(r - 1, Math.ceil(l + c));
    let b = !1;
    for (let p = u; p <= d; p++) {
      const m = p + 0.5 - a;
      for (let w = g; w <= y; w++) {
        const A = w + 0.5 - l;
        A * A + m * m <= c * c && (b = !0, o[p * r + w] < 65535 && o[p * r + w]++);
      }
    }
    const M = Math.floor(l), x = Math.floor(a);
    !b && M >= 0 && x >= 0 && M < r && x < n && o[x * r + M] < 65535 && o[x * r + M]++;
  }
  addRect(t, s) {
    const i = s ? this.soft : this.hard, [e, o, r, n] = this.cellRange(t);
    for (let h = o; h < n; h++) for (let l = e; l < r; l++) i[h * this.width + l] < 65535 && i[h * this.width + l]++;
  }
  /** Mark every cell the polyline passes through (Amanatides & Woo traversal). */
  addLine(t, s) {
    const i = this.width * this.height, e = s ? this.lineSoft ??= new Uint16Array(i) : this.lineHard ??= new Uint16Array(i), { width: o, height: r, res: n } = this;
    for (let h = 1; h < t.length; h++) {
      const l = (t[h - 1][0] - this.bx0) * n, a = (t[h - 1][1] - this.by0) * n, c = (t[h][0] - this.bx0) * n - l, u = (t[h][1] - this.by0) * n - a;
      let d = Math.floor(l), g = Math.floor(a);
      const y = Math.floor(l + c), b = Math.floor(a + u), M = Math.sign(c), x = Math.sign(u), p = M === 0 ? 1 / 0 : Math.abs(1 / c), m = x === 0 ? 1 / 0 : Math.abs(1 / u);
      let w = M > 0 ? (d + 1 - l) * p : M < 0 ? (l - d) * p : 1 / 0, A = x > 0 ? (g + 1 - a) * m : x < 0 ? (a - g) * m : 1 / 0;
      for (let j = Math.abs(y - d) + Math.abs(b - g); j >= 0; j--)
        d >= 0 && g >= 0 && d < o && g < r && e[g * o + d] < 65535 && e[g * o + d]++, w < A ? (w += p, d += M) : (A += m, g += x);
    }
  }
  /**
   * Fill the polygon (even-odd rule, holes are rings too): a hard one counts in the hard
   * coverage, a soft one adds its cost to each cell it covers.
   */
  addPolygon(t, s, i = 1) {
    if (s) {
      const e = this.areaCost ??= new Float32Array(this.width * this.height);
      this.fill(t, (o) => e[o] += i);
    } else this.fill(t, (e) => this.hard[e] < 65535 && this.hard[e]++);
  }
  /** Visit each cell whose center lies inside the rings, by scanlines through the cell centers. */
  fill(t, s) {
    const { width: i, height: e, res: o } = this, r = Array.from({ length: e }, () => []);
    for (const n of t)
      for (let h = 0, l = n.length - 1; h < n.length; l = h++) {
        const a = (n[h][0] - this.bx0) * o, c = (n[h][1] - this.by0) * o, u = (n[l][0] - this.bx0) * o, d = (n[l][1] - this.by0) * o;
        if (c === d) continue;
        const g = Math.max(0, Math.ceil(Math.min(c, d) - 0.5)), y = Math.min(e - 1, Math.ceil(Math.max(c, d) - 0.5) - 1);
        for (let b = g; b <= y; b++) r[b].push(a + (b + 0.5 - c) * (u - a) / (d - c));
      }
    for (let n = 0; n < e; n++) {
      const h = r[n].sort((l, a) => l - a);
      for (let l = 0; l + 1 < h.length; l += 2) {
        const a = Math.min(i - 1, Math.ceil(h[l + 1] - 0.5) - 1);
        for (let c = Math.max(0, Math.ceil(h[l] - 0.5)); c <= a; c++) s(n * i + c);
      }
    }
  }
  finalize() {
    this.hardSat = this.sat(this.hard), this.softSat = this.sat(this.soft), this.lineHard && (this.lineHardSat = this.sat(this.lineHard)), this.lineSoft && (this.lineSoftSat = this.sat(this.lineSoft)), this.areaCost && (this.areaCostSat = this.sat(this.areaCost));
  }
  /** Cost of the soft polygons under the box: each one's cost times the share of the box it covers. */
  polygonCost(t) {
    if (!this.areaCostSat) return 0;
    const s = this.cellCount(t);
    return s > 0 ? this.sum(this.areaCostSat, t) / s : 0;
  }
  /** Cells of hard lines under the box (centers inside it). */
  lineCoverage(t) {
    return this.lineHardSat ? this.sum(this.lineHardSat, t) : 0;
  }
  /** Length of soft lines under the box, in units, counted one cell per cell. */
  softLineLength(t) {
    return this.lineSoftSat ? this.sum(this.lineSoftSat, t) / this.res : 0;
  }
  /** Summed hard coverage of the cells whose centers lie inside the box. */
  hardCoverage(t) {
    return this.sum(this.hardSat, t);
  }
  /** Soft coverage area, in squared units. */
  softArea(t) {
    return this.sum(this.softSat, t) / (this.res * this.res);
  }
  /** Number of cells whose centers lie inside the box. */
  cellCount(t) {
    const [s, i, e, o] = this.cellRange(t);
    return Math.max(0, e - s) * Math.max(0, o - i);
  }
  /** Length of the segment over hard (or soft) coverage, sampled once per cell. */
  coveredLength(t, s, i, e, o = !1) {
    const { width: r, height: n, res: h } = this, l = o ? this.soft : this.hard, a = Math.hypot(i - t, e - s), c = Math.ceil(a * h);
    let u = 0;
    for (let d = 1; d < c; d++) {
      const g = d / c, y = Math.floor((t + (i - t) * g - this.bx0) * h), b = Math.floor((s + (e - s) * g - this.by0) * h);
      y >= 0 && b >= 0 && y < r && b < n && l[b * r + y] > 0 && u++;
    }
    return u * a / c;
  }
  cellRange(t) {
    const { res: s } = this, i = Math.max(0, Math.ceil((t[0] - this.bx0) * s - 0.5)), e = Math.min(this.width, Math.floor((t[2] - this.bx0) * s - 0.5) + 1), o = Math.max(0, Math.ceil((t[1] - this.by0) * s - 0.5)), r = Math.min(this.height, Math.floor((t[3] - this.by0) * s - 0.5) + 1);
    return [i, o, e, r];
  }
  sum(t, s) {
    const [i, e, o, r] = this.cellRange(s);
    if (o <= i || r <= e) return 0;
    const n = this.width + 1;
    return t[r * n + o] - t[e * n + o] - t[r * n + i] + t[e * n + i];
  }
  sat(t) {
    const s = this.width, i = s + 1, e = new Float64Array(i * (this.height + 1));
    for (let o = 0; o < this.height; o++) {
      let r = 0;
      for (let n = 0; n < s; n++)
        r += t[o * s + n], e[(o + 1) * i + n + 1] = e[o * i + n + 1] + r;
    }
    return e;
  }
}
const vt = { pinned: 0, required: 1, optional: 2 }, Ct = 4e6, Q = 2, jt = 1, Z = 4, tt = 6, St = [2, 4, 7, 11], At = 3, st = 10, kt = [0, 1, 2, 3, 4, 6, 8, 11, 15, 20], It = 1e3, Gt = 12, Lt = 20, et = { right: 1, left: -1, above: -1, below: 1 }, P = (f) => f === "above" || f === "below";
function Rt(f, t, s) {
  let [i, e, o, r] = [1 / 0, 1 / 0, -1 / 0, -1 / 0];
  for (const n of s) {
    const h = f[n], l = h.symbol, [a, c] = l?.type === "circle" ? [l.radius, l.radius] : l?.type === "rect" ? [l.width / 2, l.height / 2] : [0, 0];
    i = Math.min(i, h.x - a), e = Math.min(e, h.y - c), o = Math.max(o, h.x + a), r = Math.max(r, h.y + c);
  }
  return s.length || ([i, e, o, r] = [0, 0, 0, 0]), {
    id: t.id,
    x: (i + o) / 2,
    y: (e + r) / 2,
    width: s.length ? t.width : 0,
    height: s.length ? t.height : 0,
    layouts: t.layouts,
    symbol: { type: "rect", width: o - i, height: r - e },
    priority: t.priority ?? Math.max(...s.map((n) => f[n].priority ?? 0)),
    leader: t.leader
  };
}
function Et(f) {
  if (f.length === 0) return 1;
  const t = f.slice().sort((s, i) => s - i);
  return t[t.length >> 1] || 1;
}
const nt = /* @__PURE__ */ new Set(["column", "margin"]);
function N(f, t, s = 0) {
  const i = s > 0 && !(nt.has(f.placement) && nt.has(t.placement)) ? s : 0;
  if (rt(f.x0 - i, f.y0 - i, f.x1 + i, f.y1 + i, t.x0, t.y0, t.x1, t.y1) || f.leader && ot(f.leader, t, i) || t.leader && ot(t.leader, f, i)) return !0;
  if (f.leader && t.leader)
    for (let e = 1; e < f.leader.length; e++)
      for (let o = 1; o < t.leader.length; o++) {
        const [r, n] = [f.leader[e - 1], f.leader[e]], [h, l] = [t.leader[o - 1], t.leader[o]];
        if (ft(r[0], r[1], n[0], n[1], h[0], h[1], l[0], l[1])) return !0;
      }
  return !1;
}
function Ot([f, t, s, i], [e, o, r, n]) {
  const h = Math.max(0, Math.min(s, r) - Math.max(f, e)), l = Math.max(0, Math.min(i, n) - Math.max(t, o));
  return (s - f) * (i - t) - h * l;
}
function T(f) {
  let t = 0;
  for (let s = 1; s < (f?.length ?? 0); s++) t += Math.hypot(f[s][0] - f[s - 1][0], f[s][1] - f[s - 1][1]);
  return t;
}
function it(f, t, s, [i, e]) {
  const o = f.length, r = new Array(o).fill(0);
  for (let u = 1; u < o; u++) r[u] = r[u - 1] + (t[u - 1] + t[u]) / 2 + s;
  const n = [];
  for (let u = 0; u < o; u++)
    for (n.push({ sum: f[u] - r[u], count: 1 }); n.length > 1 && n[n.length - 2].sum / n[n.length - 2].count > n[n.length - 1].sum / n[n.length - 1].count; ) {
      const d = n.pop();
      n[n.length - 1].sum += d.sum, n[n.length - 1].count += d.count;
    }
  const h = [];
  for (const u of n) for (let d = 0; d < u.count; d++) h.push(u.sum / u.count + r[h.length]);
  const l = h[0] - t[0] / 2 - i, a = h[o - 1] + t[o - 1] / 2 - e, c = l < 0 ? -l : a > 0 ? -Math.min(a, l) : 0;
  return h.map((u) => u + c);
}
function ot(f, t, s = 0) {
  for (let i = 1; i < f.length; i++) {
    const [e, o] = [f[i - 1], f[i]];
    if (ht(e[0], e[1], o[0], o[1], t.x0 - s, t.y0 - s, t.x1 + s, t.y1 + s)) return !0;
  }
  return !1;
}
class _t {
  labels;
  current;
  /** Movable labels: candidates clear of static obstacles. Pinned labels: their single candidate. */
  feasible = [];
  /** Required labels: clean candidates on one more leader ring, tried when the others are taken. */
  farther = [];
  /** Candidates blocked by static obstacles, kept as a last resort for required labels. */
  blocked = [];
  order;
  /** Position of each label in `order`. */
  rank;
  forced = /* @__PURE__ */ new Set();
  /** Required labels the greedy pass left without a free spot: the chains try them, `force` sets the rest. */
  pending = /* @__PURE__ */ new Set();
  /** Labels that kept their previous placement; polishing leaves them there. */
  sticky = /* @__PURE__ */ new Set();
  grid;
  stamp;
  stampValue = 0;
  journal = null;
  bounds;
  /** Ambiguity is costed lazily, once a label has a chance to be shown. */
  features;
  ambiguityCost;
  ambiguityMargin;
  resolved;
  polygons;
  polygonBoxes = [];
  settings;
  unit;
  raster;
  resolution;
  hardRects = [];
  hardMin;
  softCost;
  /** Clear space kept between label boxes. */
  spacing;
  alignStop = 1 / 0;
  /** Labels given by the caller; the groups' blocks follow them in `labels`. */
  count;
  groupInputs;
  groupMembers;
  /** For each label, the group whose block names it instead, or -1. */
  absorbed;
  work = 0;
  constructor(t, s) {
    this.count = t.length, this.groupInputs = s.groups ?? [], this.groupMembers = this.groupInputs.map((p) => [
      ...new Set(p.members.filter((m) => Number.isInteger(m) && m >= 0 && m < t.length && t[m].width > 0 && t[m].height > 0 && t[m].mode !== "pinned" && !t[m].callout))
    ]);
    const i = this.labels = this.groupInputs.length ? [...t, ...this.groupInputs.map((p, m) => Rt(t, p, this.groupMembers[m]))] : t;
    this.absorbed = new Int32Array(this.count).fill(-1), this.bounds = s.bounds;
    const e = i.length;
    this.current = new Array(e).fill(null), this.stamp = new Int32Array(e);
    const o = Et(t.filter((p) => p.width > 0 && p.height > 0).map((p) => p.height)), [r, n, h, l] = s.bounds;
    this.grid = new V(r, n, h, l, o * 2);
    const a = s.leader === !1 ? null : s.leader ?? {}, c = this.settings = {
      positions: s.positions ?? bt,
      gap: s.gap ?? 0.2 * o,
      inside: s.inside ?? !0,
      rings: a ? a.rings ?? [o, 2 * o] : [],
      leaderStyle: a?.style ?? "octilinear",
      symbolGap: a?.symbolGap ?? 0.25 * o,
      minGap: a?.minGap ?? 0.5 * o,
      leaderBaseCost: a?.baseCost ?? 8,
      leaderLengthCost: a?.lengthCost ?? 2,
      areaOverflowCost: s.areaOverflowCost ?? 6,
      unit: o
    };
    this.unit = o, this.spacing = Math.max(0, s.spacing ?? 0);
    const u = Math.max(1e-9, (h - r) * (l - n)), d = s.resolution ?? Math.min(10 / o, Math.sqrt(Ct / u)), g = this.raster = new wt(s.bounds, d);
    this.resolution = d;
    const y = this.hardMin = s.symbolObstacles?.hardMinRadius ?? 0.25 * o;
    this.softCost = s.symbolObstacles?.softCost ?? 6;
    const b = 0.5 / d;
    for (const p of t)
      if (p.symbol?.type === "circle" && p.symbol.radius > 0)
        g.addCircle(p.x, p.y, Math.max(p.symbol.radius, b), p.symbol.radius < y);
      else if (p.symbol?.type === "rect") {
        const { width: m, height: w } = p.symbol;
        g.addRect([p.x - m / 2, p.y - w / 2, p.x + m / 2, p.y + w / 2], Math.max(m, w) / 2 < y);
      }
    const M = this.hardRects;
    for (const p of s.obstacles ?? [])
      p.type === "circle" ? g.addCircle(p.x, p.y, p.radius, p.soft ?? !1) : p.type === "line" ? g.addLine(p.points, p.soft ?? !1) : p.type === "polygon" ? g.addPolygon(p.rings, p.soft ?? !1, p.cost ?? 1) : (g.addRect(p.box, p.soft ?? !1), p.soft || M.push(p.box));
    g.finalize(), this.ambiguityCost = s.ambiguity?.cost ?? 6, this.ambiguityMargin = s.ambiguity?.margin ?? 0.5 * o, this.features = this.ambiguityCost > 0 ? new Mt(t, s.bounds, o * 2) : null, this.resolved = new Uint8Array(e), this.resolved.fill(1, this.count), this.polygons = new V(r, n, h, l, o * 4), t.forEach((p, m) => {
      if (p.symbol?.type !== "polygon") return;
      const w = this.polygonBoxes[m] = U(p.symbol.rings);
      this.polygons.insert(m, w[0], w[1], w[2], w[3]);
    });
    for (let p = 0; p < e; p++) {
      const m = i[p];
      if (!(m.width > 0 && m.height > 0)) {
        this.feasible.push([]), this.farther.push([]), this.blocked.push([]);
        continue;
      }
      if (m.callout) {
        this.feasible.push([]), this.farther.push([]), this.blocked.push([]);
        continue;
      }
      if (m.mode === "pinned") {
        const [v, I] = m.offset ?? [0, 0], S = m.x + v, E = m.y + I, k = [S - m.width / 2, E - m.height / 2, S + m.width / 2, E + m.height / 2], R = a ? z({ anchor: [m.x, m.y], symbol: m.symbol, box: k, style: c.leaderStyle, symbolGap: c.symbolGap, minGap: c.minGap }) : null;
        this.feasible.push([_(k, 0, "pinned", 0, at([m.x, m.y], k), "middle", R)]), this.farther.push([]), this.blocked.push([]);
        continue;
      }
      const w = m.mode === "required" && c.rings.length ? [...c.rings, Math.max(...c.rings) + o] : c.rings, A = [], j = [], C = [];
      for (const v of $(m, { ...c, rings: w, inside: c.inside && !this.isGroup(p) })) (this.classify(p, v) ? C : v.ring > c.rings.length ? j : A).push(v);
      A.sort((v, I) => v.cost - I.cost), j.sort((v, I) => v.cost - I.cost), this.feasible.push(A), this.farther.push(j), this.blocked.push(C);
    }
    this.placeCallouts();
    const x = (p) => this.isGroup(p) ? 3 : i[p].callout ? 0 : vt[i[p].mode ?? "optional"];
    this.order = i.map((p, m) => m).sort(
      (p, m) => x(p) - x(m) || (i[m].priority ?? 0) - (i[p].priority ?? 0) || p - m
    ), this.rank = new Int32Array(e), this.order.forEach((p, m) => this.rank[p] = m);
  }
  /**
   * Check a candidate against the static obstacles and the bounds, and add their soft costs.
   * Returns whether it is blocked; a blocked candidate gets its hard coverage in `c.hard`. With
   * `leaderOverSymbols`, a leader across a hard symbol only pays, like across a soft one.
   */
  classify(t, s, i = !1) {
    const { raster: e, unit: o, softCost: r } = this, n = this.labels[t], [h, l, a, c] = this.bounds, u = [s.x0, s.y0, s.x1, s.y1], d = s.bx0 < h || s.by0 < l || s.bx1 > a || s.by1 > c, g = s.placement === "inside" && this.ownHardCoverage(n, this.hardMin) ? e.cellCount(u) : 0, y = e.hardCoverage(u) - g, b = e.lineCoverage(u), M = n.symbol?.type === "polygon" && s.placement !== "center" && (H(u, n.symbol.rings, this.polygonBoxes[t]) !== "outside" || s.ring === 0 && this.inOtherPolygon(t, u));
    let x = 0, p = 0;
    for (let j = 1; j < (s.leader?.length ?? 0); j++)
      x += e.coveredLength(...s.leader[j - 1], ...s.leader[j]), p += e.coveredLength(...s.leader[j - 1], ...s.leader[j], !0);
    const m = this.hardRects.some((j) => rt(s.x0, s.y0, s.x1, s.y1, j[0], j[1], j[2], j[3])) || y > 0 || x > 0 && !i || b > 0 || M, w = i ? x : 0;
    if (r > 0 && (s.cost += r * (e.softArea(u) + (p + w + e.softLineLength(u)) * o) / (o * o)), s.cost += e.polygonCost(u), n.symbol?.type === "polygon" && s.ring > 0 && this.inOtherPolygon(t, u) && (s.cost += this.ambiguityCost), !d && !m) return !1;
    const A = (s.x1 - s.x0) * (s.y1 - s.y0);
    return s.hard = (y + b) / (this.resolution * this.resolution) + x * o + Ot(u, this.bounds) + (M ? A / 2 : 0), !0;
  }
  /**
   * Callouts go in a column along the left or right edge of the bounds, or in a row along the
   * top or bottom edge, in the order of their anchors as far as their leaders allow: a leg
   * across from the label, then one along the edge to the symbol (boundary labeling).
   */
  placeCallouts() {
    const t = this.settings, [s, i, e, o] = this.bounds, r = this.labels.map((n, h) => h).filter((n) => this.labels[n].callout && this.labels[n].width > 0 && this.labels[n].height > 0);
    for (const n of [-1, 1]) {
      const h = r.filter((d) => {
        const g = this.labels[d].callout;
        return g === "left" ? n < 0 : g === "right" ? n > 0 : g === !0 && this.labels[d].x < (s + e) / 2 == n < 0;
      });
      if (!h.length) continue;
      const l = Math.max(...h.map((d) => this.labels[d].width)), a = n < 0 ? s + l : e - l, [c, u] = this.untangle(
        h.slice().sort((d, g) => this.labels[d].y - this.labels[g].y || d - g),
        (d) => this.stack(d, n, a, t.gap, [i, o], "margin", (g, y) => this.calloutLeader(g, y, n))
      );
      c.forEach((d, g) => this.feasible[d] = [u[g]]);
    }
    for (const n of [-1, 1]) {
      const h = r.filter((d) => this.labels[d].callout === (n < 0 ? "top" : "bottom"));
      if (!h.length) continue;
      const l = Math.max(...h.map((d) => this.labels[d].height)), a = n < 0 ? i + l : o - l, [c, u] = this.untangle(
        h.slice().sort((d, g) => this.labels[d].x - this.labels[g].x || d - g),
        (d) => this.stackRow(d, n, a, t.gap, [s, e], (g, y) => this.rowCalloutLeader(g, y, n))
      );
      c.forEach((d, g) => this.feasible[d] = [u[g]]);
    }
  }
  /** Swap neighbours of a stack whose leaders cross, as long as that helps. */
  untangle(t, s) {
    let i = s(t);
    for (let e = 0; e < t.length; e++) {
      let o = !1;
      for (let r = 1; r < t.length; r++) {
        if (!N(i[r - 1], i[r])) continue;
        const n = t.slice();
        [n[r - 1], n[r]] = [n[r], n[r - 1]];
        const h = s(n);
        N(h[r - 1], h[r]) || ([t, i, o] = [n, h, !0]);
      }
      if (!o) break;
    }
    return [t, i];
  }
  /**
   * Candidates for labels stacked in a column, in this order, each as close to the height of
   * its anchor as the others allow (isotonic regression), flushed against `column`: right of
   * it when `side` is 1, left of it when -1.
   */
  stack(t, s, i, e, [o, r], n, h, l) {
    const a = (u) => l?.[u] ?? [this.labels[t[u]].width, this.labels[t[u]].height];
    this.work += t.length;
    const c = it(
      t.map((u) => this.labels[u].y),
      t.map((u, d) => a(d)[1]),
      e,
      [o, r]
    );
    return t.map((u, d) => {
      const [g, y] = a(d), b = c[d], M = s > 0 ? [i, b - y / 2, i + g, b + y / 2] : [i - g, b - y / 2, i, b + y / 2], x = h(u, M);
      return _(M, this.settings.leaderBaseCost + this.settings.leaderLengthCost * T(x) / this.unit, n, 1, s > 0 ? "start" : "end", "middle", x);
    });
  }
  /**
   * Candidates for labels set in a row, in this order, each centered as close to its anchor as
   * the others allow, flushed against `row`: below it when `side` is 1, above it when -1.
   */
  stackRow(t, s, i, e, o, r) {
    this.work += t.length;
    const n = it(
      t.map((h) => this.labels[h].x),
      t.map((h) => this.labels[h].width),
      e,
      o
    );
    return t.map((h, l) => {
      const { width: a, height: c } = this.labels[h], u = s > 0 ? [n[l] - a / 2, i, n[l] + a / 2, i + c] : [n[l] - a / 2, i - c, n[l] + a / 2, i], d = r(h, u);
      return _(u, this.settings.leaderBaseCost + this.settings.leaderLengthCost * T(d) / this.unit, "margin", 1, "middle", s > 0 ? "top" : "bottom", d);
    });
  }
  /** Orthogonal leader of a callout in a row: vertical from the label, then horizontal to the symbol. */
  rowCalloutLeader(t, s, i) {
    const e = this.labels[t], { symbolGap: o } = this.settings, r = (u) => u > 0 ? u + o : 0, n = (s[0] + s[2]) / 2, h = i < 0 ? s[3] : s[1], l = n - e.x, a = r(L(e.symbol, 0, i, [e.x, e.y]));
    return Math.abs(l) < a ? [[n, e.y + i * Math.sqrt(a * a - l * l)], [n, h]] : Math.abs(h - e.y) < 1e-9 ? [[e.x + Math.sign(l) * r(L(e.symbol, Math.sign(l), 0, [e.x, e.y])), e.y], [n, h]] : [[e.x + Math.sign(l) * r(L(e.symbol, Math.sign(l), 0, [e.x, e.y])), e.y], [n, e.y], [n, h]];
  }
  /** Orthogonal leader of a callout: horizontal from the label, then vertical to the symbol. */
  calloutLeader(t, s, i) {
    const e = this.labels[t], { symbolGap: o } = this.settings, r = (u) => u > 0 ? u + o : 0, n = (s[1] + s[3]) / 2, h = i < 0 ? s[2] : s[0], l = n - e.y, a = r(L(e.symbol, i, 0, [e.x, e.y]));
    return Math.abs(l) < a ? [[e.x + i * Math.sqrt(a * a - l * l), n], [h, n]] : Math.abs(h - e.x) < 1e-9 ? [[e.x, e.y + Math.sign(l) * r(L(e.symbol, 0, Math.sign(l), [e.x, e.y]))], [h, n]] : [[e.x, e.y + Math.sign(l) * r(L(e.symbol, 0, Math.sign(l), [e.x, e.y]))], [e.x, n], [h, n]];
  }
  ownHardCoverage(t, s) {
    return t.symbol?.type === "circle" ? t.symbol.radius >= s : t.symbol?.type === "rect" ? Math.max(t.symbol.width, t.symbol.height) / 2 >= s : !1;
  }
  /** Add the ambiguity cost to the candidates next to the symbol, once, and sort them again. */
  resolve(t) {
    const s = this.feasible[t];
    if (!this.features || this.resolved[t]) return s;
    this.resolved[t] = 1;
    const i = this.labels[t].symbol;
    if (i?.type === "area" || this.fixed(t)) return s;
    for (const e of s) {
      if (e.ring > 0 || e.placement === "inside" || e.placement === "center") continue;
      const o = [e.x0, e.y0, e.x1, e.y1], r = i?.type === "polygon" ? yt(o, i.rings) : void 0;
      e.cost += this.ambiguityCost * this.features.ambiguity(t, o, this.ambiguityMargin, r);
    }
    return s.sort((e, o) => e.cost - o.cost), s;
  }
  /** Whether the box of polygon label i lies in, or across, another label's polygon. */
  inOtherPolygon(t, s) {
    const [i, e, o, r] = this.polygons.range(s[0], s[1], s[2], s[3]);
    for (let n = e; n <= r; n++)
      for (let h = i; h <= o; h++)
        for (const l of this.polygons.cells[n * this.polygons.nx + h]) {
          const a = this.labels[l].symbol;
          if (l !== t && a?.type === "polygon" && H(s, a.rings, this.polygonBoxes[l]) !== "outside") return !0;
        }
    return !1;
  }
  /** Whether label i is a group's block. */
  isGroup(t) {
    return t >= this.count;
  }
  priority(t) {
    return this.labels[t].priority ?? 0;
  }
  /** Pinned labels and callouts: placed first, where they were put, never moved. */
  fixed(t) {
    return this.mode(t) === "pinned" || !!this.labels[t].callout;
  }
  mode(t) {
    return this.labels[t].mode ?? "optional";
  }
  /** Placed labels in conflict with candidate c of label i, up to `limit`; `spaced: false` checks overlaps only. */
  conflicts(t, s, i = 1 / 0, e = !0) {
    this.work++;
    const o = [], r = ++this.stampValue, n = this.grid, h = e ? this.spacing : 0, [l, a, c, u] = n.range(s.bx0 - h, s.by0 - h, s.bx1 + h, s.by1 + h);
    for (let d = a; d <= u; d++)
      for (let g = l; g <= c; g++)
        for (const y of n.cells[d * n.nx + g]) {
          if (y === t || this.stamp[y] === r) continue;
          this.stamp[y] = r;
          const b = this.current[y];
          if (b && N(s, b, h) && (o.push(y), o.length >= i))
            return o;
        }
    return o;
  }
  /** Pinned, forced and sticky labels stay where they are while chains run. */
  isMovable(t) {
    return !this.fixed(t) && !this.forced.has(t) && !this.sticky.has(t);
  }
  isFree(t, s) {
    return this.conflicts(t, s, 1).length === 0;
  }
  place(t, s) {
    this.journal && !this.journal.has(t) && this.journal.set(t, this.current[t]), this.current[t] && this.unplace(t), this.current[t] = s, this.grid.insert(t, s.bx0, s.by0, s.bx1, s.by1);
  }
  unplace(t) {
    this.journal && !this.journal.has(t) && this.journal.set(t, this.current[t]);
    const s = this.current[t];
    s && (this.grid.remove(t, s.bx0, s.by0, s.bx1, s.by1), this.current[t] = null);
  }
  previous;
  greedy(t) {
    this.previous = t;
    for (const s of this.order) this.fixed(s) && this.feasible[s].length && this.place(s, this.feasible[s][0]);
    for (const s of this.order) {
      if (this.fixed(s) || this.labels[s].symbol?.type !== "polygon") continue;
      const i = this.resolve(s).filter((n) => n.placement === "center"), e = t?.[s], o = e ? i.find((n) => F(n) === e && this.isFree(s, n)) : void 0;
      o && this.sticky.add(s);
      const r = o ?? i.find((n) => this.isFree(s, n));
      r && this.place(s, r);
    }
    for (const s of this.order) {
      const i = this.feasible[s];
      if (this.fixed(s) || this.current[s] || this.isGroup(s)) continue;
      let e = null;
      const o = t?.[s];
      if (o) {
        const r = i.find((n) => n.ring === 0 && F(n) === o);
        r && this.isFree(s, r) && (e = r, this.sticky.add(s));
      }
      !e && i.some((r) => this.isFree(s, r)) && (e = this.resolve(s).find((r) => this.isFree(s, r)) ?? null), !e && this.mode(s) === "required" && (this.resolve(s), e = this.farther[s].find((r) => this.isFree(s, r)) ?? null, e || this.pending.add(s)), e && this.place(s, e);
    }
  }
  /**
   * Required labels still without a spot after the optimizer take their last resort, by mode
   * then priority, and are marked overlapping.
   */
  force() {
    for (const t of this.order) {
      if (!this.pending.has(t) || this.current[t]) continue;
      const s = this.reach(t).find((e) => this.isFree(t, e));
      if (s) {
        this.place(t, s);
        continue;
      }
      const i = this.leastBad(t, [...this.feasible[t], ...this.farther[t]]) ?? this.leastBad(t, this.blocked[t]);
      i && (this.forced.add(t), this.place(t, i));
    }
    this.pending.clear();
  }
  /**
   * Clean candidates of a required label on leader rings beyond its farther one, out to
   * `REACH` label heights more, out of the other polygons: a long leader to the sea beats an
   * overlap.
   */
  reach(t) {
    const { settings: s, unit: i } = this;
    if (!s.rings.length || this.labels[t].leader === !1) return [];
    const e = Math.max(...s.rings) + i, o = St.map((h) => e + h * i), r = this.labels[t].symbol?.type === "polygon", n = $(this.labels[t], { ...s, rings: o, inside: !1 }).filter(
      (h) => h.ring > 0 && !this.classify(t, h) && !(r && this.inOtherPolygon(t, [h.x0, h.y0, h.x1, h.y1]))
    );
    for (const h of n) h.ring += s.rings.length + 1;
    return n.sort((h, l) => h.cost - l.cost);
  }
  /** Last resort of a required label: least static hard coverage, then fewest labels overlapped, then lowest cost. */
  leastBad(t, s) {
    let i = null, e = 0;
    for (const o of s) {
      const r = this.conflicts(t, o).length;
      (!i || (o.hard - i.hard || r - e || o.cost - i.cost) < 0) && (i = o, e = r);
    }
    return i;
  }
  /**
   * Ejection chains: a hidden label takes a candidate if the at most two labels in its way
   * can move to a free spot (or, through one more ejection, to a spot freed for them). A
   * blocker that cannot move is hidden only when it is optional and of lower priority, so
   * the hierarchy never degrades; a required label left without a spot outranks any optional
   * one, and tries its farther ring too. A label inside its own area is never ejected.
   */
  chain(t, s) {
    const i = () => this.work >= t || performance.now() > s;
    let e = !0;
    for (; e && !i(); ) {
      e = !1;
      for (const o of this.order) {
        if (i()) return;
        if (this.current[o] || this.fixed(o) || this.isGroup(o)) continue;
        const r = this.pending.has(o);
        if (!(!r && this.mode(o) !== "optional"))
          for (const n of r ? [...this.resolve(o), ...this.farther[o]] : this.resolve(o)) {
            if (i()) return;
            const h = this.conflicts(o, n, Q + 1);
            if (h.length > Q || h.some((c) => !this.isMovable(c) || this.current[c].placement === "center" && this.labels[c].symbol?.type === "polygon")) continue;
            this.journal = /* @__PURE__ */ new Map();
            for (const c of h) this.unplace(c);
            this.place(o, n);
            let l = !0;
            for (const c of h)
              if (!this.relocate(c, jt, i) && (this.mode(c) === "required" || !r && this.priority(c) >= this.priority(o))) {
                l = !1;
                break;
              }
            const a = this.journal;
            if (this.journal = null, l) {
              this.pending.delete(o), e = !0;
              break;
            }
            for (const [c, u] of a)
              this.unplace(c), u && this.place(c, u);
          }
      }
    }
  }
  relocate(t, s, i) {
    const e = this.current[t];
    for (const o of this.resolve(t))
      if (o !== e && this.isFree(t, o))
        return this.place(t, o), !0;
    if (s <= 0 || i()) return !1;
    for (const o of this.feasible[t]) {
      if (o === e) continue;
      const r = this.conflicts(t, o, 2);
      if (r.length !== 1) continue;
      const n = r[0];
      if (!this.isMovable(n)) continue;
      const h = this.current[n];
      if (this.unplace(n), this.place(t, o), this.relocate(n, s - 1, i)) return !0;
      this.unplace(t), e && this.place(t, e), this.place(n, h);
    }
    return !1;
  }
  /**
   * Stack the labels of each dense cluster in columns beside it, in the order of their anchors,
   * so that their leaders do not cross: the whole cluster on the right, else on the left, else
   * split at its median between both sides, else only the labels that already needed a leader.
   * Hidden labels of the cluster join when they fit; a label that fits nowhere keeps its place.
   */
  align() {
    if (!this.settings.rings.length) return;
    const s = (h, l) => Math.hypot(this.labels[h].x - this.labels[l].x, this.labels[h].y - this.labels[l].y) <= Z * this.unit, i = this.order.filter((h) => this.current[h]).length;
    this.alignStop = this.work + It * i;
    let e = 0;
    const o = this.order.filter(
      (h) => !this.isGroup(h) && this.absorbed[h] < 0 && this.labels[h].width > 0 && this.labels[h].height > 0 && (!!this.current[h] || e++ < i)
    ), r = (h) => {
      if (h.length <= st) return [h];
      const l = (g) => Math.max(...h.map((y) => this.labels[y][g])) - Math.min(...h.map((y) => this.labels[y][g])), a = l("x") >= l("y") ? "x" : "y", c = h.slice().sort((g, y) => this.labels[g][a] - this.labels[y][a]), u = c.length >> 1, d = (g) => g.sort((y, b) => this.rank[y] - this.rank[b]);
      return [...r(d(c.slice(0, u))), ...r(d(c.slice(u)))];
    }, n = (h, l) => h.length <= st ? [h] : l < this.unit ? r(h) : this.clusters(h, (a, c) => Math.hypot(this.labels[a].x - this.labels[c].x, this.labels[a].y - this.labels[c].y) <= l).flatMap((a) => n(a, l * 0.7));
    for (const h of this.clusters(o, s).flatMap((l) => n(l, Z * this.unit * 0.7))) {
      if (h.length < At) continue;
      const l = h.filter((y) => {
        const b = this.current[y];
        return this.labels[y].leader !== !1 && (b ? this.isMovable(y) && b.placement !== "inside" && b.placement !== "center" : this.mode(y) === "optional");
      });
      if (l.length < 2 || !l.some((y) => !this.current[y] || this.current[y].ring > 0) || this.column(l, "right") || this.column(l, "left")) continue;
      const a = l.map((y) => this.labels[y].x).sort((y, b) => y - b), c = a[a.length >> 1], u = l.filter((y) => this.labels[y].x >= c), d = l.filter((y) => this.labels[y].x < c);
      if (![u.length > 1 && this.column(u, "right"), d.length > 1 && this.column(d, "left")].some(Boolean) && !(this.column(l, "above") || this.column(l, "below")))
        for (const y of ["right", "left"]) {
          const b = l.filter((M) => {
            const x = this.current[M];
            return x && x.ring > 0 && (x.x0 + x.x1) / 2 >= this.labels[M].x == (y === "right");
          });
          b.length > 1 && this.column(b, y);
        }
    }
  }
  /** Groups of labels linked by `near`, each in the order given. */
  clusters(t, s) {
    const i = t.map((r, n) => n), e = (r) => i[r] === r ? r : i[r] = e(i[r]);
    for (let r = 0; r < t.length; r++) for (let n = r + 1; n < t.length; n++) s(t[r], t[n]) && (i[e(r)] = e(n));
    const o = /* @__PURE__ */ new Map();
    return t.forEach((r, n) => o.set(e(n), [...o.get(e(n)) ?? [], r])), [...o.values()];
  }
  /**
   * Set the group in a column beside it, at the distance that keeps the most labels, when that
   * shows hidden labels or tidies two leaders or more; a label that does not fit keeps its
   * place. Returns whether a column was set.
   */
  column(t, s) {
    const i = this.settings, e = et[s], o = P(s), r = t.map((c) => {
      const u = this.labels[c];
      return (o ? u.y : u.x) + e * L(u.symbol, o ? 0 : e, o ? e : 0, [u.x, u.y]);
    }), n = (e > 0 ? Math.max(...r) : Math.min(...r)) + e * (i.gap + i.rings[0]), h = (c) => c.some((u) => !this.current[u]) || c.filter((u) => this.current[u].ring > 0).length > 1, l = o ? [this.preferredFlush(t), -this.preferredFlush(t)] : [1];
    let a = null;
    for (const c of l)
      for (const u of kt) {
        if (this.work > this.alignStop) break;
        const d = n + e * u * this.unit, g = this.fitColumn(t, s, d, !1, c), y = (g?.filter((b) => !this.current[b]).length ?? 0) + (g?.length ?? 0) / 4 - u / 8;
        if (g && h(g) && (!a || y > a.score) && (a = { at: d, kept: g, score: y, flush: c }), g && t.every((b) => g.includes(b))) break;
      }
    return a !== null && this.fitColumn(a.kept, s, a.at, !0, a.flush) !== null;
  }
  /**
   * The labels that fit in a column at `at`, from the group: a label of the group whose box is
   * blocked, or whose leader crosses another one of the group, leaves it, the lowest-ranked
   * first; a label in the way of the column outside the group joins it if it may move and its
   * anchor is on the column's side of the group, else the label of the group it hinders leaves.
   * Placed for good with `commit`, else put back.
   */
  fitColumn(t, s, i, e, o = 1) {
    const r = this.settings, [, n, , h] = this.bounds, l = et[s], a = P(s) ? "y" : "x", c = (b) => b.reduce((M, x) => this.rank[M] > this.rank[x] ? M : x), u = /* @__PURE__ */ new Set();
    let d = t.slice();
    const g = (b) => l * (this.labels[b][a] - (l > 0 ? Math.min(...d.map((M) => this.labels[M][a])) : Math.max(...d.map((M) => this.labels[M][a])))) >= 0 && l * (i - this.labels[b][a]) > 0, y = (b) => {
      u.add(b), d = d.filter((M) => M !== b);
    };
    for (; d.length > 1 && d.length <= Lt; ) {
      const b = (C) => {
        const v = this.current[C];
        return v ? [v.x1 - v.x0, v.y1 - v.y0] : [this.labels[C].width, this.labels[C].height];
      }, [M, x] = P(s) ? ((C) => [C, this.staircase(C, l, i, C.map(b))])(this.byStart(d, o)) : this.untangle(
        d.slice().sort((C, v) => this.labels[C].y - this.labels[v].y || C - v),
        (C) => this.stack(
          C,
          l,
          i,
          r.gap,
          [n, h],
          "column",
          (v, I) => z({ anchor: [this.labels[v].x, this.labels[v].y], symbol: this.labels[v].symbol, box: I, style: r.leaderStyle, symbolGap: r.symbolGap, minGap: r.minGap }),
          C.map(b)
        )
      );
      x.forEach((C, v) => C.layout = this.current[M[v]]?.layout ?? 0);
      const p = (C) => (C.leader ?? []).reduce((v, I, S, E) => S ? v + Math.hypot(I[0] - E[S - 1][0], I[1] - E[S - 1][1]) : 0, 0), m = M.filter((C, v) => this.classify(C, x[v], !0) || p(x[v]) > Gt * this.unit);
      if (m.length) {
        y(c(m));
        continue;
      }
      this.journal = /* @__PURE__ */ new Map();
      for (const C of M) this.unplace(C);
      const w = [], A = /* @__PURE__ */ new Set();
      M.forEach((C, v) => {
        const I = this.conflicts(C, x[v]);
        if (!I.length) return this.place(C, x[v]);
        w.push(C);
        for (const S of I) !d.includes(S) && !u.has(S) && this.joins(S) && g(S) && A.add(S);
      });
      const j = this.journal;
      if (this.journal = null, !w.length && e) return d;
      for (const [C, v] of j)
        this.unplace(C), v && this.place(C, v);
      if (!w.length) return d;
      A.size ? d = [...d, ...A] : y(c(w));
    }
    return null;
  }
  /**
   * Labels in rows start over their anchors (1), the rightmost nearest the cluster, unless the
   * most important member lies left of the middle: ending over their anchors (-1), the leftmost
   * are the nearest, and that member keeps a short leader.
   */
  preferredFlush(t) {
    const s = t.map((e) => this.labels[e].x).sort((e, o) => e - o), i = t.reduce((e, o) => this.rank[e] < this.rank[o] ? e : o);
    return this.labels[i].x < s[s.length >> 1] ? -1 : 1;
  }
  /** Members in the order rows need: from left to right when labels start over their anchors, else from right to left. */
  byStart(t, s) {
    return t.slice().sort((i, e) => s * (this.labels[i].x - this.labels[e].x) || i - e);
  }
  /**
   * Candidates for labels in rows above (`sign` -1) or below (1) their cluster, from `at`: each
   * label starts, or ends, right over its anchor, with a vertical leader into its start, or its
   * end, in the order given by `byStart`. A label is set one row farther than any later label
   * whose anchor lies under it, so that no leader runs through a label; labels that do not
   * overlap share a row.
   */
  staircase(t, s, i, e) {
    const o = this.settings, r = t.length;
    this.work += r;
    const n = r < 2 || this.labels[t[0]].x <= this.labels[t[r - 1]].x, h = (c) => this.labels[t[c]].x, l = new Array(r).fill(0);
    for (let c = r - 2; c >= 0; c--)
      for (let u = c + 1; u < r; u++) Math.abs(h(u) - h(c)) < e[c][0] + o.gap && (l[c] = Math.max(l[c], l[u] + 1));
    const a = Math.max(...e.map(([, c]) => c)) + o.gap;
    return t.map((c, u) => {
      const d = this.labels[c], [g, y] = e[u], b = i + s * l[u] * a, [M, x] = n ? [d.x, d.x + g] : [d.x - g, d.x], p = s < 0 ? [M, b - y, x, b] : [M, b, x, b + y], m = L(d.symbol, 0, s, [d.x, d.y]), w = [[d.x, d.y + s * (m > 0 ? m + o.symbolGap : 0)], [d.x, b]];
      return _(p, o.leaderBaseCost + o.leaderLengthCost * T(w) / this.unit, "column", 1, n ? "start" : "end", "middle", w);
    });
  }
  /** Whether a placed label may be taken into a column: one that could move there itself. */
  joins(t) {
    const s = this.current[t];
    return !!s && !this.isGroup(t) && this.isMovable(t) && this.labels[t].leader !== !1 && !["inside", "center", "column", "margin"].includes(s.placement);
  }
  /**
   * Set the groups' blocks, by priority: the members' labels are taken off, and the block takes
   * the candidate that pushes aside the fewest labels, then the cheapest; only movable labels of
   * lower priority may be pushed aside, and they move to a free spot if they have one. In `auto`
   * mode only a group with a member left hidden is tried. When the block finds no room, the
   * members are put back. The hidden labels then take the room the members left, by priority.
   */
  group() {
    const t = this.order.filter((s) => this.isGroup(s));
    if (t.length) {
      for (const s of t) {
        const i = s - this.count, e = this.groupMembers[i];
        if (!e.length || (this.groupInputs[i].mode ?? "auto") === "auto" && e.every((n) => this.current[n])) continue;
        this.journal = /* @__PURE__ */ new Map();
        for (const n of e) this.unplace(n);
        let o = null;
        for (const n of this.feasible[s]) {
          const h = this.conflicts(s, n, (o?.blockers.length ?? tt) + 1);
          if (!(h.length > (o ? o.blockers.length - 1 : tt)) && !h.some((l) => !this.isMovable(l) || this.priority(l) >= this.priority(s) || this.current[l].placement === "center" && this.labels[l].symbol?.type === "polygon") && (o = { c: n, blockers: h }, !h.length))
            break;
        }
        if (o) {
          for (const n of o.blockers) this.unplace(n);
          this.place(s, o.c);
          for (const n of o.blockers) {
            const h = this.resolve(n).find((l) => this.isFree(n, l));
            h && this.place(n, h);
          }
        }
        const r = this.journal;
        if (this.journal = null, o) {
          for (const n of e) this.absorbed[n] = i;
          continue;
        }
        for (const [n, h] of r)
          this.unplace(n), h && this.place(n, h);
      }
      for (const s of this.order) {
        if (this.current[s] || this.isGroup(s) || this.absorbed[s] >= 0 || this.fixed(s)) continue;
        const i = this.resolve(s).find((e) => this.isFree(s, e));
        i && this.place(s, i);
      }
    }
  }
  /** Move each placed label to its best-ranked free candidate. */
  polish() {
    for (const t of this.order) {
      const s = this.current[t];
      if (!s || this.fixed(t) || this.forced.has(t) || this.sticky.has(t) && F(s) === this.previous?.[t]) continue;
      const i = this.farther[t].includes(s) ? 1 / 0 : s.cost;
      for (const e of this.resolve(t)) {
        if (e.cost >= i) break;
        if (this.isFree(t, e)) {
          this.place(t, e);
          break;
        }
      }
    }
  }
  result(t) {
    const s = this.groupInputs.map((o, r) => {
      const n = this.count + r, h = this.labels[n], l = this.current[n], a = l ? this.textPoint(l) : [h.x, h.y];
      return {
        index: r,
        id: o.id,
        visible: !!l,
        members: l ? this.groupMembers[r] : [],
        placement: l?.placement ?? null,
        ring: l?.ring ?? 0,
        layout: l?.layout ?? 0,
        x: a[0],
        y: a[1],
        textAnchor: l?.textAnchor ?? "middle",
        baseline: l?.baseline ?? "middle",
        box: l ? [l.x0, l.y0, l.x1, l.y1] : null,
        leader: l?.leader ?? null
      };
    }), i = this.labels.slice(0, this.count).map((o, r) => {
      const n = this.current[r];
      if (!n)
        return {
          index: r,
          id: o.id,
          visible: !1,
          placement: null,
          ring: 0,
          layout: 0,
          x: o.x,
          y: o.y,
          textAnchor: "middle",
          baseline: "middle",
          offset: [0, 0],
          box: null,
          leader: null,
          overlapping: !1,
          blocked: o.width > 0 && o.height > 0 && this.absorbed[r] < 0 && !this.feasible[r].length && !this.farther[r].length,
          group: this.absorbed[r] >= 0 ? this.absorbed[r] : null
        };
      const [h, l] = this.textPoint(n);
      return {
        index: r,
        id: o.id,
        visible: !0,
        placement: n.placement,
        ring: n.ring,
        layout: n.layout,
        x: h,
        y: l,
        textAnchor: n.textAnchor,
        baseline: n.baseline,
        offset: [h - o.x, l - o.y],
        box: [n.x0, n.y0, n.x1, n.y1],
        leader: n.leader,
        overlapping: this.forced.has(r) || this.fixed(r) && this.conflicts(r, n, 1, !1).length > 0 || this.outOfBounds(n),
        blocked: !1,
        group: null
      };
    }), e = i.filter((o) => o.visible).length;
    return {
      labels: i,
      groups: s,
      stats: {
        placed: e,
        hidden: i.length - e,
        overlapping: i.filter((o) => o.overlapping).length,
        blocked: i.filter((o) => o.blocked).length,
        work: this.work,
        timings: t
      }
    };
  }
  textPoint(t) {
    return [t.textAnchor === "start" ? t.x0 : t.textAnchor === "end" ? t.x1 : (t.x0 + t.x1) / 2, t.baseline === "top" ? t.y0 : t.baseline === "bottom" ? t.y1 : (t.y0 + t.y1) / 2];
  }
  outOfBounds(t) {
    const [s, i, e, o] = this.bounds;
    return t.x0 < s || t.y0 < i || t.x1 > e || t.y1 > o;
  }
}
function F(f) {
  return f.placement ? `${f.placement}:${f.ring}:${f.layout ?? 0}` : null;
}
const Ft = 40;
function Bt(f, t) {
  const s = performance.now(), i = new _t(f, t), e = performance.now();
  i.greedy(Ht(f, t.previous));
  const o = performance.now();
  if ((t.optimize ?? "chain") === "chain") {
    const n = t.budget?.work ?? Ft * f.length, h = t.budget?.timeMs === void 0 ? 1 / 0 : o + t.budget.timeMs;
    i.chain(i.work + n, h), i.polish();
  }
  i.force(), i.group(), t.align === "columns" && i.align();
  const r = performance.now();
  return i.result({ setup: e - s, greedy: o - e, optimize: r - o });
}
function Ht(f, t) {
  if (!t) return;
  const s = /* @__PURE__ */ new Map();
  for (const i of t.labels) i.id !== void 0 && s.set(i.id, F(i));
  return f.map((i, e) => i.id !== void 0 ? s.get(i.id) ?? null : t.labels[e] ? F(t.labels[e]) : null);
}
export {
  bt as DEFAULT_POSITIONS,
  at as flushAlignment,
  z as leaderGeometry,
  Bt as placeLabels
};
