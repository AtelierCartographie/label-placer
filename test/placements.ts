import { placeLabels } from '../src/index.ts';
import type { PlacementResult } from '../src/index.ts';
import type { NamedScene } from './scenes.ts';

/**
 * A placement as text, one label per line, for the regression snapshots: what a reviewer reads
 * in a diff. Shown: its placement, ring and layout, and the center of its box; hidden: why.
 */
export function placementText(scene: NamedScene, result: PlacementResult = placeLabels(scene.labels, scene.options)): string {
  const lines = [`# ${scene.title}: ${result.stats.placed} shown, ${result.stats.hidden} hidden, ${result.stats.overlapping} overlapping`];
  result.labels.forEach((p, i) => {
    if (!(scene.labels[i].width > 0 && scene.labels[i].height > 0)) return;
    const name = `${i} ${scene.names[i]}`;
    if (!p.visible) return lines.push(`${name} | hidden ${p.reason}`);
    const b = p.box!;
    lines.push(`${name} | ${p.placement}:${p.ring}:${p.layout} ${((b[0] + b[2]) / 2).toFixed(1)},${((b[1] + b[3]) / 2).toFixed(1)}${p.overlapping ? ' overlapping' : ''}`);
  });
  result.groups.forEach((g, k) => lines.push(`group ${k} | ${g.visible ? `${g.placement}:${g.ring}:${g.layout} ${((g.box![0] + g.box![2]) / 2).toFixed(1)},${((g.box![1] + g.box![3]) / 2).toFixed(1)}` : 'hidden'}`));
  return lines.join('\n') + '\n';
}
