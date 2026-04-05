import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: '../../dist/star-catcher',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    host: true,
  },
});
