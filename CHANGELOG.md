# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- Benchmark on French communes
