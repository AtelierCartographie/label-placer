import { describe, expect, it } from 'vitest';
import { placementText } from './placements.ts';
import { referenceScenes } from './scenes.ts';

/**
 * The placements of reference scenes, kept in `__snapshots__/placements/`: a change to the
 * engine that moves a label fails here, label by label. See them with `pnpm regress`, which
 * draws each change; accept them with `pnpm test -u`.
 */
describe('placements of the reference scenes', () => {
  for (const scene of referenceScenes())
    it(scene.title, async () => {
      await expect(placementText(scene)).toMatchFileSnapshot(`./__snapshots__/placements/${scene.id}.txt`);
    });
});
