export function boxesOverlap(
  ax0: number, ay0: number, ax1: number, ay1: number,
  bx0: number, by0: number, bx1: number, by1: number
): boolean {
  return ax0 < bx1 && bx0 < ax1 && ay0 < by1 && by0 < ay1;
}

/** Whether segment AB crosses the open box (Liang–Barsky). */
export function segmentHitsBox(
  ax: number, ay: number, bx: number, by: number,
  x0: number, y0: number, x1: number, y1: number
): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q > 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return clip(-dx, ax - x0) && clip(dx, x1 - ax) && clip(-dy, ay - y0) && clip(dy, y1 - ay) && t0 < t1;
}

/** Proper crossing of segments AB and CD (touching endpoints do not count). */
export function segmentsCross(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number
): boolean {
  const o = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
    Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
  return o(ax, ay, bx, by, cx, cy) * o(ax, ay, bx, by, dx, dy) < 0 && o(cx, cy, dx, dy, ax, ay) * o(cx, cy, dx, dy, bx, by) < 0;
}
