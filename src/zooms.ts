import { placeLabels } from './index.ts';
import type { LabelInput, PlaceOptions, PlacementResult } from './types.ts';

/** One level of zoom: the labels projected at that zoom, in the same order at every level, and its options. */
export interface ZoomLevel {
  /** The zoom, to report in `minZoom`. Defaults to the level's index. */
  zoom?: number;
  labels: LabelInput[];
  options: PlaceOptions;
}

export interface ZoomResult {
  /** One result per level, in the order given. */
  levels: PlacementResult[];
  /** For each label, the zoom of the first level where it shows, or null: a tile layer's `minzoom`. */
  minZoom: (number | null)[];
}

/**
 * Place labels at several zooms, from the most crowded to the roomiest, so that zooming in
 * keeps the names shown and where they were: a label shown at one level ranks above every
 * other at the next, in its own order, and keeps its place there while it stays free
 * (`previous`). It goes only when no spot is left for it, which a roomier map makes rare, and
 * never overlaps for it. Each level is projected by the caller: anchors, sizes, obstacles and
 * bounds at that zoom. Labels are matched by their position in the list. Groups' blocks are
 * placed at each level on their own.
 */
export function placeZooms(levels: ZoomLevel[]): ZoomResult {
  const n = levels[0]?.labels.length ?? 0;
  if (levels.some((l) => l.labels.length !== n)) throw new Error('placeZooms: every level needs the same labels, in the same order');
  const results: PlacementResult[] = [];
  const minZoom: (number | null)[] = new Array(n).fill(null);
  let previous: PlacementResult | undefined;
  levels.forEach((level, k) => {
    let labels: LabelInput[] = level.labels;
    if (previous) {
      // Above every priority of this level, the order among the names kept unchanged.
      const lift = Math.max(0, ...labels.map((l) => l.priority ?? 0)) - Math.min(0, ...labels.map((l) => l.priority ?? 0)) + 1;
      labels = labels.map((l, i) => (previous!.labels[i].visible ? { ...l, priority: (l.priority ?? 0) + lift } : l));
    }
    const result = placeLabels(labels, { ...level.options, previous });
    result.labels.forEach((p, i) => {
      if (p.visible && minZoom[i] === null) minZoom[i] = level.zoom ?? k;
    });
    results.push(result);
    previous = result;
  });
  return { levels: results, minZoom };
}
