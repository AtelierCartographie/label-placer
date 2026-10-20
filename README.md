# @ateliercartographie/label-placer

Automatic label placement for **maps** and **charts**, independent of the renderer. Give it anchors, label sizes, symbols, priorities and obstacles. It returns where each label goes, how to align its text, and the leader line that joins it to its feature when it had to move away. Draw the result with SVG, Canvas, WebGL or a map library.

- Ordered candidate positions around point symbols (Imhof's preferences by default), inside a symbol when the label fits, centered on areas.
- Priorities and a hierarchy of modes: `pinned` (placed by hand), `required` (never hidden), `optional`.
- Obstacles: other symbols, legend, title, any rectangle or circle, with hard and soft costs.
- Leader lines with cartographic rules: octilinear routes, a clear buffer around the symbol, and no leader while the label still reads as attached.
- Flush alignment: a label is left-aligned on the right of its feature, right-aligned on the left, centered above or below.
- A deterministic optimizer (ejection chains) on top of a fast greedy pass, and sticky placements across re-runs.

Zero dependencies. Works in any unit (pixels, points, millimetres) and in a Web Worker.

**Created by:** [Thomas Ansart — Atelier de cartographie de Sciences Po](https://www.sciencespo.fr/cartographie/)
**License:** ISC

> Status: early development, not yet published to npm. The API may still change.

## Quick start

```ts
import { placeLabels } from '@ateliercartographie/label-placer';

const result = placeLabels(
  cities.map((c) => ({
    id: c.code,
    x: c.screenX, // anchor, in your own coordinate space (y down)
    y: c.screenY,
    width: measure(c.name).width, // the box the label occupies, padding and halo included
    height: 11,
    symbol: { type: 'circle', radius: c.radius },
    priority: c.population
  })),
  {
    bounds: [0, 0, width, height],
    obstacles: [{ type: 'rect', box: legendBox }]
  }
);

for (const label of result.labels) {
  if (!label.visible) continue;
  // label.x, label.y, label.textAnchor, label.baseline, label.leader
}
```

## Concepts

### Coordinates

You project, the library places. Anchors, sizes, obstacles and bounds are in your coordinate space, with y pointing down: screen pixels, page points, millimetres. Results are in the same space, and `offset` gives the text point relative to the anchor. An offset survives panning, which translates everything. After a zoom, run the placement again with `previous` so labels keep their positions where they can. Only placements next to the symbol are sticky: a label that needed a leader is placed afresh, so leaders disappear once there is room again.

Lengths you leave undefined default to multiples of the **median label height**, so the defaults hold in any unit.

### Modes and priorities

Labels are placed by mode, then by decreasing `priority`:

| Mode       | Behaviour                                                                                           |
| ---------- | --------------------------------------------------------------------------------------------------- |
| `pinned`   | Placed at `offset` (center of the box relative to the anchor), never moved. An obstacle for others. |
| `required` | Always shown. Moved or given a leader when needed; overlaps only as a last resort (`overlapping`).  |
| `optional` | Hidden when no candidate is free. The default.                                                      |

The optimizer never hides a label to show one of lower or equal priority.

### Candidates

Each movable label tries, in order of cost:

1. `inside` its symbol, when the box fits in it (`inside: false` to disable);
2. `center` for an `area` symbol, cheaper when the label fits in the inscribed circle;
3. the `positions` around the symbol, in order of preference (default: `top-right`, `top-left`, `bottom-right`, `bottom-left`, `right`, `left`, `top`, `bottom`);
4. the same positions on farther rings, with a leader line (`leader.rings`, default one and two label heights).

A candidate blocked by a hard obstacle or outside the bounds is discarded. A soft obstacle adds a cost per area covered.

### Symbols as obstacles

Every label's symbol is an obstacle for the other labels. Symbols at least `symbolObstacles.hardMinRadius` large (default a quarter of a label height) block. Smaller ones only add `symbolObstacles.softCost` per label-height² covered. Making every tiny dot a hard obstacle leaves the largest features of a dense map without a label.

### Leader lines

`leaderGeometry()` is used for leader candidates and for pinned labels, and is exported for interactive editors:

- No leader while the gap between the symbol and the label box stays under `minGap`.
- The leader starts `symbolGap` away from the symbol's edge.
- `octilinear` (default): a 45° leg out of the symbol, then a horizontal leg into the middle of the facing side, or a vertical leg into the top or bottom edge. Every segment is horizontal, vertical or diagonal.
- `straight`: a single segment to the same port.

A leader never crosses another label, another leader, or a hard obstacle. Restrict leaders to the labels that deserve them with `leader: false` on the others.

### Budget and determinism

The greedy pass is deterministic. The optimizer runs ejection chains until its `budget.work` (candidate tests, default 40 per label) is spent, so the same input gives the same output on every machine. `budget.timeMs` adds a wall-clock guard that makes the result machine-dependent when it triggers.

## Rendering

The result uses the vocabulary that SVG, Canvas and deck.gl share: `textAnchor` (`start`, `middle`, `end`) and `baseline` (`top`, `middle`, `bottom`).

**SVG**

```js
const baseline = { top: 'text-before-edge', middle: 'central', bottom: 'text-after-edge' };
for (const l of result.labels.filter((l) => l.visible)) {
  svg.append('text')
    .attr('x', l.x).attr('y', l.y)
    .attr('text-anchor', l.textAnchor)
    .attr('dominant-baseline', baseline[l.baseline])
    .text(names.get(l.id));
  if (l.leader) svg.append('polyline').attr('points', l.leader.join(' ')).attr('fill', 'none');
}
```

**Canvas 2D**

```js
for (const l of result.labels) {
  if (!l.visible) continue;
  ctx.textAlign = { start: 'left', middle: 'center', end: 'right' }[l.textAnchor];
  ctx.textBaseline = l.baseline;
  ctx.fillText(names.get(l.id), l.x, l.y);
  if (l.leader) {
    ctx.beginPath();
    l.leader.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }
}
```

**deck.gl**: place in screen space, keep world positions, pass the offset in pixels.

```js
new TextLayer({
  data: rows.filter((d) => placement.get(d.id).visible),
  getPosition: (d) => d.coordinates,
  getPixelOffset: (d) => placement.get(d.id).offset,
  getTextAnchor: (d) => placement.get(d.id).textAnchor,
  getAlignmentBaseline: (d) => ({ top: 'top', middle: 'center', bottom: 'bottom' })[placement.get(d.id).baseline],
  updateTriggers: { getPixelOffset: placementVersion }
});
```

**MapLibre**: write the result as GeoJSON properties and turn MapLibre's own collision off (`text-allow-overlap` and `text-ignore-placement`), so it does not place the labels again. `text-anchor` names the side of the text at the anchor: a `top-right` placement is `text-anchor: bottom-left`. Leaders go in a `line` layer after `map.unproject`.

## API

### `placeLabels(labels, options): PlacementResult`

`LabelInput`: `id?`, `x`, `y`, `width`, `height`, `symbol?` (`{ type: 'circle', radius }`, `{ type: 'rect', width, height }` or `{ type: 'area', inscribedRadius }`), `priority?`, `mode?`, `offset?` (pinned), `leader?` (default true).

`PlaceOptions`:

| Option             | Default (h = median label height)                | Description                                                        |
| ------------------ | ------------------------------------------------ | ------------------------------------------------------------------ |
| `bounds`           | required                                         | `[x0, y0, x1, y1]` labels must stay in                             |
| `obstacles`        | `[]`                                             | `{ type: 'rect', box, soft? }`, `{ type: 'circle', x, y, radius, soft? }` |
| `positions`        | Imhof order                                      | candidate positions, by preference                                 |
| `gap`              | `0.2h`                                           | space between a symbol and an adjacent label                       |
| `inside`           | `true`                                           | try the label inside its symbol                                    |
| `symbolObstacles`  | `{ hardMinRadius: 0.25h, softCost: 6 }`          | how label symbols block other labels                               |
| `leader`           | `{ rings: [h, 2h], style: 'octilinear', symbolGap: 0.25h, minGap: 0.5h, baseCost: 8, lengthCost: 2 }` | leader candidates; `false` disables them |
| `areaOverflowCost` | `6`                                              | cost of a centered area label twice too large for its area         |
| `resolution`       | about 10 cells per h                             | raster cells per unit for static obstacles                         |
| `optimize`         | `'chain'`                                        | `'none'` keeps the greedy result                                   |
| `budget`           | `{ work: 40 × labels }`                          | optimizer budget                                                   |
| `previous`         | none                                             | earlier result, matched by `id` (else index)                       |

Costs are in position-rank units: the n-th preferred position costs n.

`PlacedLabel`: `index`, `id`, `visible`, `placement`, `ring`, `x`, `y`, `textAnchor`, `baseline`, `offset`, `box`, `leader`, `overlapping`.

### `leaderGeometry({ anchor, symbol?, box, style?, symbolGap?, minGap? }): Point[] | null`

### `flushAlignment(anchor, box): 'start' | 'middle' | 'end'`

## How it works

1. **Static obstacles** (symbols, page items) are rasterized once into coverage counts with summed-area tables, so testing a box costs four lookups. Hard rectangles are also tested exactly.
2. **Candidates** are built for each label and filtered against the static obstacles.
3. **Greedy pass**: by mode then priority, each label takes its first free candidate. Placed labels and their leaders go in a uniform grid.
4. **Ejection chains**: a hidden label takes a candidate if the one or two labels in its way can move to free spots, directly or by pushing one more label. A label that cannot move is hidden only if it ranks lower.
5. **Polish**: each label moves to its best-ranked free candidate.

Inspirations, none of whose code is reused: Imhof's position preferences; Christensen, Marks & Shieber (1995) on point-feature label placement; the FALP and ejection-chain search of QGIS's PAL; MapLibre's sticky anchors and grid index; vega-label's occupancy bitmap; d3-annotation's connectors; Philippe Rivière's *Automated label placement (France)* notebook.

## Benchmark

`node bench/run.ts [--svg]` places the names of French communes next to proportional symbols of births (INSEE 2018) on an A4 landscape page, with a legend as obstacle. Apple M4 Max, Node 22, one thread:

| Scenario                             | Variant        | Total  | Placed | Top 100 placed | Top 1000 placed |
| ------------------------------------ | -------------- | ------ | ------ | -------------- | --------------- |
| Bretagne, 1,202 communes             | greedy         | 12 ms  | 377    | 82 %           | 35.8 %          |
|                                      | ejection chains| 18 ms  | 402    | 84 %           | 38.3 %          |
| Grand Est + BFC + IdF, 10,066        | greedy         | 39 ms  | 399    | 28 %           | 25.7 %          |
|                                      | ejection chains| 87 ms  | 419    | 28 %           | 27.7 %          |
| France, 34,734                       | greedy         | 89 ms  | 404    | 56 %           | 26.2 %          |
|                                      | ejection chains| 320 ms | 441    | 56 %           | 29.0 %          |

The top 100 of the larger scenarios is capped by the Paris area, where the largest communes are too close together for 9 px labels on an A4 page.

## Roadmap

- Columnar input and output (typed arrays) for Web Workers.
- A stateful placer for editors: `pin`, `unpin`, incremental updates.
- An ambiguity cost: a label closer to another anchor than to its own.
- A demo page rendering the same placement with SVG, Canvas and deck.gl.

Out of scope: labels along lines and curved labels.
