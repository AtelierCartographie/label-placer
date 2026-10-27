import { placeLabels as J } from "./label-placer.js";
const b = "http://www.w3.org/2000/svg", K = 2.5;
function v(c = {}) {
  const { land: e, landCost: o = K, obstacles: n, r: l = 0, lineHeight: p = 1.2, required: a, leaderStroke: r = "currentColor", leaderWidth: i = 0.5, onPlace: d, debug: j, ...z } = c;
  return (w, F, s, x, m, T) => {
    const g = T(w, F, s, x, m), C = g ? [...g.children].filter((t) => t.tagName === "text") : [];
    if (!g || !s.x || !s.y || C.length !== w.length) return g;
    const h = m.document, G = m.ownerSVGElement, N = (t, f) => g.getAttribute(t) ?? G?.getAttribute(t) ?? f, P = N("font-family", "system-ui, sans-serif"), q = N("font-weight", "normal"), R = parseFloat(N("font-size", "10")), V = Q(h), A = Array.from(w, (t, f) => {
      const u = C[f], y = parseFloat(u.getAttribute("font-size") ?? "") || R, E = s.r ? s.r[t] : l;
      return {
        id: t,
        x: s.x[t],
        y: s.y[t],
        width: V(u.textContent ?? "", `${q} ${y}px ${P}`, y),
        height: y * p,
        symbol: E > 0 ? { type: "circle", radius: E } : void 0,
        priority: s.priority ? s.priority[t] : s.r ? s.r[t] : 0,
        mode: s.mode ? s.mode[t] : a ? "required" : void 0
      };
    }), B = X(m.projection), L = typeof n == "function" ? n(B) : n ?? [];
    if (e && m.projection) {
      const t = Y(e, m.projection);
      t.length && L.push({ type: "polygon", rings: t, soft: !0, cost: o }, ...t.map((f) => ({ type: "line", points: [...f, f[0]], soft: !0 })));
    }
    const { width: D, height: H, marginTop: O, marginRight: W, marginBottom: _, marginLeft: I } = x, M = J(A, { ...z, bounds: [I, O, D - W, H - _], obstacles: L });
    d?.(M);
    const k = h.createElementNS(b, "g"), $ = h.createElementNS(b, "g");
    $.setAttribute("fill", "none"), $.setAttribute("stroke", r), $.setAttribute("stroke-width", String(i));
    const S = h.createElementNS(b, "g");
    return S.setAttribute("fill", "none"), S.setAttribute("stroke", "red"), k.append($, g, S), M.labels.forEach((t, f) => {
      const u = C[f];
      if (!t.visible || !t.box) {
        u.remove(), j && A[f].width > 0 && S.append(U(h, A[f].x, A[f].y, t.blocked, u.textContent ?? ""));
        return;
      }
      if (u.setAttribute("transform", `translate(${t.x},${(t.box[1] + t.box[3]) / 2})`), u.setAttribute("y", "0.32em"), u.setAttribute("text-anchor", t.textAnchor), j && t.overlapping && u.setAttribute("fill", "red"), t.leader) {
        const y = h.createElementNS(b, "path");
        y.setAttribute("d", "M" + t.leader.map((E) => E.join(",")).join("L")), $.append(y);
      }
    }), k;
  };
}
function Q(c) {
  let e = null;
  try {
    e = c.createElement("canvas").getContext("2d");
  } catch {
    e = null;
  }
  return (o, n, l) => e ? (e.font = n, e.measureText(o).width) : o.length * l * 0.6;
}
function U(c, e, o, n, l) {
  const p = c.createElementNS(b, "path");
  p.setAttribute("d", n ? `M${e - 3},${o - 3}L${e + 3},${o + 3}M${e - 3},${o + 3}L${e + 3},${o - 3}` : `M${e + 4},${o}A4,4 0 1,1 ${e - 4},${o}A4,4 0 1,1 ${e + 4},${o}`);
  const a = c.createElementNS(b, "title");
  return a.textContent = `${l}: ${n ? "no spot clear of the obstacles" : "its room taken by other labels"}`, p.append(a), p;
}
function X(c) {
  return (e, o) => {
    if (!c) return null;
    let n = null;
    return c.stream({ point: (p, a) => n = [p, a], lineStart() {
    }, lineEnd() {
    }, polygonStart() {
    }, polygonEnd() {
    } }).point(e, o), n;
  };
}
function Y(c, e) {
  const o = [];
  let n = null;
  const l = e.stream({
    point: (r, i) => n?.push([r, i]),
    lineStart: () => n = [],
    lineEnd: () => {
      n && n.length > 2 && o.push(n), n = null;
    },
    polygonStart() {
    },
    polygonEnd() {
    }
  }), p = (r) => {
    l.polygonStart();
    for (const i of r) {
      l.lineStart();
      for (let d = 0; d < i.length - 1; d++) l.point(i[d][0], i[d][1]);
      l.lineEnd();
    }
    l.polygonEnd();
  }, a = (r) => {
    if (r) {
      if (r.type === "FeatureCollection") for (const i of r.features) a(i);
      else if (r.type === "Feature") a(r.geometry);
      else if (r.type === "GeometryCollection") for (const i of r.geometries) a(i);
      else if (r.type === "Polygon") p(r.coordinates);
      else if (r.type === "MultiPolygon") for (const i of r.coordinates) p(i);
    }
  };
  return a(c), o;
}
export {
  v as placeText
};
