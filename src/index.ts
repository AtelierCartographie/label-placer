import { candidateKey, Placer } from './engine.ts';
import type { LabelInput, PlaceOptions, PlacementResult } from './types.ts';

export { flushAlignment, leaderGeometry, type LeaderParams } from './leader.ts';
export { DEFAULT_POSITIONS } from './candidates.ts';
export type * from './types.ts';

/** Default optimizer budget: candidate tests per label. */
const DEFAULT_WORK_PER_LABEL = 40;

/**
 * Place labels around their anchors, avoiding each other and the obstacles.
 *
 * Inputs and outputs are in the caller's coordinate space (y down). The greedy pass gives
 * each label, by mode then priority, its first free candidate; ejection chains then fit
 * hidden labels by moving the ones in their way, within a deterministic work budget.
 */
export function placeLabels(labels: LabelInput[], options: PlaceOptions): PlacementResult {
  const t0 = performance.now();
  const placer = new Placer(labels, options);
  const t1 = performance.now();
  placer.greedy(previousKeys(labels, options.previous));
  const t2 = performance.now();
  if ((options.optimize ?? 'chain') === 'chain') {
    const work = options.budget?.work ?? DEFAULT_WORK_PER_LABEL * labels.length;
    const deadline = options.budget?.timeMs === undefined ? Infinity : t2 + options.budget.timeMs;
    placer.chain(placer.work + work, deadline);
    placer.polish();
  }
  placer.group();
  if (options.align === 'columns') placer.align();
  const t3 = performance.now();
  return placer.result({ setup: t1 - t0, greedy: t2 - t1, optimize: t3 - t2 });
}

function previousKeys(labels: LabelInput[], previous: PlacementResult | undefined): (string | null)[] | undefined {
  if (!previous) return undefined;
  const byId = new Map<string | number, string | null>();
  for (const p of previous.labels) if (p.id !== undefined) byId.set(p.id, candidateKey(p));
  return labels.map((l, i) => (l.id !== undefined ? (byId.get(l.id) ?? null) : previous.labels[i] ? candidateKey(previous.labels[i]) : null));
}
