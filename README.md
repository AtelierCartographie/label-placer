# @ateliercartographie/label-placer

Automatic label placement for **maps** and **charts**, independent of the renderer. Give it anchors, label sizes, symbols, priorities and obstacles. It returns where each label goes, how to align its text, and the leader line that joins it to its feature when it had to move away. Draw the result with SVG, Canvas, WebGL or a map library.

- Ordered candidate positions around point symbols (by default the sides first, right, above, left, below, then the corners), inside a symbol when the label fits, centered on areas.
- Polygons: a label goes wholly inside its polygon, or wholly outside, never across its outline.
- Several layouts per label (one line, two lines...): the engine picks the one that fits.
- Aligned labels: dense clusters in columns beside them, callouts in columns along the edge of the map.
- No ambiguity: a label avoids spots as close to another symbol as to its own.
- Priorities and a hierarchy of modes: `pinned` (placed by hand), `required` (never hidden), `optional`.
- Obstacles: other symbols, legend, title, any rectangle or circle, lines such as coastlines, with hard and soft costs.
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

A `required` label with no free candidate tries one more leader ring, a label height beyond the last one (3h by default). When that fails too, it overlaps: it takes the spot that covers the least of the hard obstacles (under the box, along the leader, out of the bounds), then the one that overlaps the fewest labels, then the cheapest.
| `optional` | Hidden when no candidate is free. The default.                                                      |

The optimizer never hides a label to show one of lower or equal priority.

### Candidates

Each movable label tries, in order of cost:

1. `inside` its symbol, when the box fits in it (`inside: false` to disable);
2. `center` for an `area` symbol, cheaper when the label fits in the inscribed circle, or for a `polygon` symbol, wholly inside it: on the anchor, else shifted by up to three label heights across and two along (0.5 per label height);
3. the `positions` around the symbol, in order of preference (default: `right`, `top`, `left`, `bottom`, `top-right`, `top-left`, `bottom-right`, `bottom-left`: the practice of the Atelier de cartographie, sides before corners);
4. the same positions on farther rings, with a leader line (`leader.rings`, default one and two label heights).

A candidate blocked by a hard obstacle or outside the bounds is discarded. A soft obstacle adds a cost per area covered.

### Layouts

Breaking and measuring text needs the fonts, so it stays with the caller. The caller can give other `layouts` of a label, measured beforehand: on two lines, abbreviated. Each is tried like the main `width` × `height`, at an extra `cost` (default 0.5), and `PlacedLabel.layout` tells which won (0 for the main one, k for `layouts[k - 1]`). Draw the lines flushed by `textAnchor`, within `box`. A label on two lines then fits inside a circle or a polygon where one line would not.

### Polygons

`{ type: 'polygon', rings }` gives an area with its outline, in the caller's units, outer ring and holes alike (even-odd rule). Simplify the outlines: every candidate is tested against every edge of its own polygon.

- Inside, the label is centered on its anchor (a pole of inaccessibility is a good one), or shifted on a grid around it, wholly inside.
- Outside, the positions start where the outline crosses the direction from the anchor, with leaders starting on the outline.
- Across the outline, a candidate is discarded: a label of a coastal département sits on land or at sea, never on the coastline.
- Outside its polygon, a label next to it must not land in, or across, another label's polygon. With a leader it may, at the ambiguity cost: the leader names its feature (small areas, such as the départements around Paris).

### Columns

`align: 'columns'` brings order to dense clusters: after the optimizer, the labels of each cluster (three named anchors or more, within 4 label heights of one another, split again when more than ten) are stacked in a column beside it, flushed against a common edge, in the order of their anchors so that their leaders do not cross. The whole cluster goes on the right if it can, else on the left, else split at its median between both sides, else only the labels that already needed a leader. The column steps away from the cluster, by 1, 2, 3 up to 20 label heights, until its boxes are clear, out to sea if need be; leaders may cross the cluster's symbols, not labels: a label in the column's way joins it, when it may move and its anchor lies between the cluster and the column. Neighbours whose leaders would cross are swapped, and a label whose leader would be longer than 12 label heights keeps its place. A label that does not fit keeps its place, and hidden labels of the cluster join when they fit; a column holds twenty labels at most. Columns spend a deterministic budget of 1,000 candidate tests per label shown, the most important clusters first. A column is set only when it shows more names, or tidies two labels or more that already needed a leader: labels that fit next to their symbol stay there. Labels inside their symbol, pinned, sticky or forced labels stay where they are. `placement` is `column`.

### Callouts

`callout: true` (or `'left'`, `'right'`) sets a label in a column along the left or right edge of the bounds, the nearer one by default: boundary labeling, for a few chosen labels, often on several lines (give their measured size). Callouts are stacked in the order of their anchors, as close to their height as the others allow, and joined to their symbol by an orthogonal leader, horizontal from the label then vertical; neighbours whose leaders would cross are swapped. They are placed first and never moved, like pinned labels, and the others avoid them. `placement` is `margin`.

### Line obstacles

`{ type: 'line', points, soft? }` (coastline, border, river) keeps label boxes off a line; leaders may cross it. A soft line costs `symbolObstacles.softCost` per label height of line under the box.

### Symbols as obstacles

Every label's symbol is an obstacle for the other labels. A symbol drawn without a label (filtered out, or too small to name) is passed as a label with no `width` or `height`: it is never shown, but it is an obstacle and a feature like the others. Symbols at least `symbolObstacles.hardMinRadius` large (default a quarter of a label height) block. Smaller ones only add `symbolObstacles.softCost` per label-height² covered. Making every tiny dot a hard obstacle leaves the largest features of a dense map without a label. A symbol smaller than a raster cell still counts in the cell it sits in.

### Ambiguity

A label next to its symbol is ambiguous when another symbol, or a bare anchor, is as close to it as its own: the reader may attach it to the wrong feature. Such a spot costs `ambiguity.cost` (default 6, in position-rank units), decreasing to nothing for a symbol `ambiguity.margin` (default h/2) farther than the label's own. Symbols under the label are left to the soft cost, and labels with a leader are not concerned: the leader names their feature. The cost is computed once a label has a chance to be shown, so that hidden labels of a dense map cost nothing. Set `ambiguity: { cost: 0 }` to turn it off.

### Leader lines

`leaderGeometry()` is used for leader candidates and for pinned labels, and is exported for interactive editors:

- No leader while the gap between the symbol and the label box stays under `minGap`.
- The leader starts `symbolGap` away from the symbol's edge.
- `octilinear` (default): a 45° leg out of the symbol, then a horizontal leg into the middle of the facing side, or a vertical leg into the top or bottom edge. Every segment is horizontal, vertical or diagonal.
- `orthogonal`: a vertical leg out of the symbol, then a horizontal one into the middle of the facing side, or the reverse into the top or bottom edge, as on many of the Atelier's maps.
- `straight`: a single segment to the same port.

A leader never crosses another label, another leader, or a hard obstacle, except for a `required` label left with no other way. Across a small (soft) symbol it pays the soft cost of a strip one label height wide. Restrict leaders to the labels that deserve them with `leader: false` on the others.

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

`LabelInput`: `id?`, `x`, `y`, `width`, `height` (both 0 for a symbol without a label), `layouts?` (`[{ width, height, cost? }]`), `symbol?` (`{ type: 'circle', radius }`, `{ type: 'rect', width, height }`, `{ type: 'area', inscribedRadius }` or `{ type: 'polygon', rings }`), `priority?`, `mode?`, `offset?` (pinned), `leader?` (default true), `callout?` (`true`, `'left'` or `'right'`).

`PlaceOptions`:

| Option             | Default (h = median label height)                | Description                                                        |
| ------------------ | ------------------------------------------------ | ------------------------------------------------------------------ |
| `bounds`           | required                                         | `[x0, y0, x1, y1]` labels must stay in                             |
| `obstacles`        | `[]`                                             | `{ type: 'rect', box, soft? }`, `{ type: 'circle', x, y, radius, soft? }`, `{ type: 'line', points, soft? }` |
| `positions`        | sides, then corners                              | candidate positions, by preference                                 |
| `gap`              | `0.2h`                                           | space between a symbol and an adjacent label                       |
| `inside`           | `true`                                           | try the label inside its symbol                                    |
| `symbolObstacles`  | `{ hardMinRadius: 0.25h, softCost: 6 }`          | how label symbols block other labels                               |
| `ambiguity`        | `{ cost: 6, margin: 0.5h }`                      | cost of a spot as close to another symbol as to the label's own    |
| `leader`           | `{ rings: [h, 2h], style: 'octilinear', symbolGap: 0.25h, minGap: 0.5h, baseCost: 8, lengthCost: 2 }` | leader candidates; `false` disables them |
| `areaOverflowCost` | `6`                                              | cost of a centered area label twice too large for its area         |
| `resolution`       | about 10 cells per h                             | raster cells per unit for static obstacles                         |
| `optimize`         | `'chain'`                                        | `'none'` keeps the greedy result                                   |
| `align`            | `'none'`                                         | `'columns'` stacks dense clusters in columns                       |
| `budget`           | `{ work: 40 × labels }`                          | optimizer budget                                                   |
| `previous`         | none                                             | earlier result, matched by `id` (else index)                       |

Costs are in position-rank units: the n-th preferred position costs n.

`PlacedLabel`: `index`, `id`, `visible`, `placement`, `ring`, `layout`, `x`, `y`, `textAnchor`, `baseline`, `offset`, `box`, `leader`, `overlapping`.

### `leaderGeometry({ anchor, symbol?, box, style?, symbolGap?, minGap? }): Point[] | null`

### `flushAlignment(anchor, box): 'start' | 'middle' | 'end'`

## How it works

1. **Static obstacles** (symbols, page items) are rasterized once into coverage counts with summed-area tables, so testing a box costs four lookups. Hard rectangles are also tested exactly.
2. **Candidates** are built for each label and filtered against the static obstacles.
3. **Greedy pass**: by mode then priority, each label takes its first free candidate. Placed labels and their leaders go in a uniform grid.
4. **Ejection chains**: a hidden label takes a candidate if the one or two labels in its way can move to free spots, directly or by pushing one more label. A label that cannot move is hidden only if it ranks lower.
5. **Polish**: each label moves to its best-ranked free candidate.
6. **Columns** (with `align: 'columns'`): dense clusters are stacked in columns, positions solved by isotonic regression (pool adjacent violators) around the anchors' heights. Callouts use the same stacking along the edges, before the greedy pass.

Inspirations, none of whose code is reused: Imhof's position preferences, reordered after the Atelier's practice; Christensen, Marks & Shieber (1995) on point-feature label placement; the FALP and ejection-chain search of QGIS's PAL; MapLibre's sticky anchors and grid index; vega-label's occupancy bitmap; d3-annotation's connectors; Philippe Rivière's *Automated label placement (France)* notebook; Bekos, Kaufmann, Symvonis & Wolff (2007) on boundary labeling; the excentric and aligned callouts of the Atelier's maps.

## Demo

`docs/comment-ca-marche.html` (in French) shows each step on the real engine, embedded in the page. `?zone=normandie` or `?zone=monde` switches its data from Bretagne to the communes of Normandie or to the countries of the world (Equal Earth), to see the engine at other scales.

## Benchmark

`node bench/run.ts [--svg]` places the names of French communes next to proportional symbols of births (INSEE 2018) on an A4 landscape page, with a legend as obstacle. Apple M4 Max, Node 22, one thread:

| Scenario                             | Variant        | Total  | Placed | Top 100 placed | Top 1000 placed | Ambiguous |
| ------------------------------------ | -------------- | ------ | ------ | -------------- | --------------- | --------- |
| Bretagne, 1,202 communes             | greedy         | 15 ms  | 381    | 85 %           | 36.0 %          | 189       |
|                                      | ejection chains| 20 ms  | 402    | 86 %           | 38.1 %          | 188       |
| Bretagne, 100 largest labelled       | greedy         | 6 ms   | 85     | 85 %           |                 | 42        |
|                                      | ejection chains| 6 ms   | 88     | 88 %           |                 | 43        |
| Grand Est + BFC + IdF, 10,066        | greedy         | 69 ms  | 397    | 29 %           | 25.0 %          | 309       |
|                                      | ejection chains| 106 ms | 416    | 29 %           | 27.3 %          | 307       |
| France, 34,734                       | greedy         | 111 ms | 409    | 56 %           | 26.1 %          | 339       |
|                                      | ejection chains| 432 ms | 445    | 56 %           | 28.2 %          | 336       |

*Ambiguous*: labels next to their symbol with another symbol, not under the label, at least as close. Every commune has a symbol, so in these dense scenes a label rarely finds a spot clear of the smallest ones; without the ambiguity cost, Bretagne counts 218 and its 100 largest 50.

The top 100 of the larger scenarios is capped by the Paris area, where the largest communes are too close together for 9 px labels on an A4 page.

## Roadmap

- Callouts along the top and bottom edges, and an exact boundary labeling (minimal total leader length without crossings).
- Columns on a world map: Central and Eastern Europe still lack room (Russia, Ukraine and Turkey fill the east); leaders routed around labels rather than taking them along.
- Columns above or below a cluster, labels stacked with vertical leaders from their start.
- Group labels: one block listing a group too dense to name one by one ("Caraïbes, du Nord au Sud : …").
- Filled polygon obstacles: masks for interrupted projections, land as a soft obstacle so that labels prefer the sea.
- Columnar input and output (typed arrays) for Web Workers.
- A stateful placer for editors: `pin`, `unpin`, incremental updates.
- A demo page rendering the same placement with SVG, Canvas and deck.gl.

Out of scope: labels along lines and curved labels; breaking and measuring text, left to the caller (see Layouts).
