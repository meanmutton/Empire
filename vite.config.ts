import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Builds the whole game into one self-contained dist/index.html, like Hexfront.
export default defineConfig({
  plugins: [viteSingleFile()],
  build: { target: 'es2022', assetsInlineLimit: 100_000_000 },
  test: { globals: true, include: ['test/**/*.test.ts'] },
});
