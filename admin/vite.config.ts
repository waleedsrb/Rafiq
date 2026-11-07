import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Relative paths, so the site works both locally and under https://waleedsrb.github.io/Rafiq/
// Two pages: index.html (admin review) and share.html (Share my trip, for family).
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        share: resolve(__dirname, 'share.html'),
      },
    },
  },
});
