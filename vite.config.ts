import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      name: 'LabelPlacer',
      fileName: 'label-placer',
      formats: ['es', 'cjs']
    }
  },
  test: {
    include: ['test/**/*.test.ts']
  }
});
