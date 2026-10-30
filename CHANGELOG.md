# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Property tests: on 60 random scenes mixing every feature, the counts and flags agree, nothing shown and not flagged overlaps, crowds the spacing, crosses a leader, leaves the bounds or lies on a hard obstacle, required and pinned labels are shown, and the result is the same twice, and again with itself as `previous`

- `PlacedLabel.reason`: why a label is hidden (`size`, `group`, `bounds`, `obstacles`, `labels`, `stack`), and `by` and `byGroups`: the labels and blocks on the spot it would get with the fewest of them in the way
- `placeBlocks()`: the emptiest spot for a legend, a title or a scale before the names, along the edges of the bounds, clear of hard obstacles and symbols, as little as can be over soft obstacles and the room the names need; `DEFAULT_BLOCK_POSITIONS`
- Demo: the legend and the title placed by `placeBlocks`, against a legend fixed bottom left, with the best spot of each position and its cost
- `placeText({ debug })`: the reason in each hidden label's title, and a dashed line to the labels in its way; Mapshaper: `lp_reason` and `lp_by` (their names) written back to the layer

### Fixed

- Hidden labels take the spots that polishing, columns or groups freed: no label is left hidden by nothing
- A required symbol without a label (no size) no longer gets an empty box and a leader to nothing
- A group's block no longer pushes aside a required label, which could then find no room
- Callouts whose anchor lies in their own column or row, or whose symbol reaches the label: a straight leader, or none, instead of one leaving the bounds

## [0.2.0] - 2026-10-30

### Added

- `dodge: 'left' | 'right'`: names at the ends of the lines of a chart, set beside their anchor and moved only up or down to clear each other, in stacks aligned on their anchors, with straight leaders when an anchor no longer faces its label; `placement: 'dodge'`
- `placeText({ dodge })`: every label of a Plot text mark dodged, into the side margins
- Demo: a line chart in `docs/exemple-plot.html`, the life expectancy of fourteen countries named at the ends of their lines, against Plot alone

### Fixed

- Columns, callouts and rows against an edge of the bounds: only the labels in the way move away from it, no longer the whole stack

## [0.1.0] - 2026-10-30

### Added

- `placeLabels()`: greedy placement by mode and priority over ordered candidate positions, then ejection chains under a deterministic work budget
- Candidates inside a symbol, centered on an area, around circle and rectangle symbols, and on farther rings with a leader line
- Static obstacles rasterized into summed-area tables, hard or soft; label symbols as obstacles with a size threshold
- `pinned`, `required` and `optional` modes, and sticky placements through `previous`
- `leaderGeometry()`: octilinear or straight leaders with a symbol buffer and a minimum gap
- `flushAlignment()`: text flushed towards its feature
- Default positions after the Atelier's practice: right, above, left, below, then the corners
- Ambiguity cost: a label avoids spots as close to another symbol as to its own (`ambiguity`)
- Labels with no size stand for symbols without a label: obstacles and features for the others
- `required` labels try one farther leader ring, then overlap where they cover the least of the hard obstacles
- `layouts`: other measured layouts of a label (two lines...), tried at a small extra cost
- `polygon` symbols: labels wholly inside their polygon, or wholly outside it and out of the others
- `line` obstacles (coastlines, borders): they keep label boxes off, not leaders
- `align: 'columns'`: labels of dense clusters stacked in columns beside them, in the order of their anchors
- `callout`: labels set in columns along the left or right edge, with orthogonal leaders
- Columns take along the labels in their way, untangle crossing leaders, reach the sea if need be, within a deterministic budget
- `orthogonal` leader style: a vertical leg out of the symbol, then a horizontal one into the label
- Demo zones: Bretagne, Normandie, the world and the départements (`?zone=`), and a slider for the share of names to place
- Areas take a spot inside themselves before labels from outside; chains never eject a label from inside its own area; a finer grid of inside positions
- `polygon` obstacles, filled: hard, a mask for label boxes and leaders; soft, a cost by the share of the box they cover, so that names prefer the sea
- Demo: the sea rather than the land, with the coastline as a soft line and the regions beyond the map as a mask
- Callouts along the top or bottom edge (`callout: 'top'`, `'bottom'`), centered over their anchors, with leaders vertical from the label
- Columns in rows above or below a cluster when neither side has room: labels start (or end) over their anchors, with vertical leaders into their start (or end), staggered so that no leader runs through a label
- Demo: a cluster whose sides can be walled off, to see a column, the halves, then rows above or below; callouts on all four edges
- `spacing`: clear space between label boxes, and between leaders and boxes, to thin the dense areas first; demo: a slider on the opening map
- `groups`: one block naming a group too dense to name one by one, set around its members' extent when one of them is left hidden (or always), pushing aside lower labels if need be; `result.groups`, `PlacedLabel.group`
- Demo: group labels (around Rennes, Rouen, the petite couronne, the western Balkans)
- Required labels the greedy pass leaves without a spot go through the ejection chains, which may push aside optional labels, before being forced to overlap: all 96 départements at 9 to 12 px with no overlap instead of 1 to 3
- README: use cases, a clean map at the first go, a blank base map with every name, a map made in code
- Demo: a bar with the zone and the sommaire always at hand; on the départements, every name required, and their number where a name would need a leader
- A required label with no free spot after the chains tries leader rings farther out, up to 11 label heights more and out of the other areas, before overlapping
- Leaders of polygon labels run into the area up to the anchor, not to the outline, which a neighbour shares; only the length outside costs
- Demo: Europe by country (`?zone=europe`), a blank base map where every name is required, the microstates as points, ISO codes as a last layout, a dot at the inner end of the leaders into areas
- `PlacedLabel.blocked` and `stats.blocked`: a hidden label with no spot clear of the static obstacles and the bounds, told from one crowded out by other labels
- `placeText()` (`@ateliercartographie/label-placer/plot`): an Observable Plot `render` function for text marks, with the land as GeoJSON, `onPlace` and a `debug` view of the labels left to look at
- Demo: `docs/exemple-plot.html`, the countries of Europe and a Gapminder scatterplot drawn with Observable Plot, each against Plot alone, at the width of the page, the scatterplot by year with `previous`
- `labels()` (`@ateliercartographie/label-placer/mapshaper`): a Mapshaper `-run` function that places the labels of a point or polygon layer on the SVG page and returns the `-frame`, `-i` and `-labels` commands that draw them, leaders as a line layer; text measured with the metrics of Helvetica and Arial
- Package: public npm metadata, the CHANGELOG in the tarball, `pnpm build:docs` to rebuild the engine embedded in the demo pages
- Benchmark on French communes
