import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    lib: {
      entry: { 'label-placer': resolve(import.meta.dirname, 'src/index.ts'), plot: resolve(import.meta.dirname, 'src/plot.ts') },
      fileName: (format, name) => `${name}.${format === 'es' ? 'js' : 'cjs'}`,
      formats: ['es', 'cjs']
    }
  },
  test: {
    include: ['test/**/*.test.ts']
  }
});
