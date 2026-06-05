import { defineConfig } from 'vite';

// Pages deploys under https://<user>.github.io/lazy-imagen-openrouter/, so
// Vite must emit asset URLs prefixed with that subpath. Without this, the
// built dist/index.html would reference /assets/... which 404s on Pages.
// Override locally with --base=/ for `vite preview` at the root.
export default defineConfig({
  root: '.',
  base: '/lazy-imagen-openrouter/',
  build: {
    outDir: 'dist',
    target: 'esnext',
  },
  server: {
    open: true,
  },
});
