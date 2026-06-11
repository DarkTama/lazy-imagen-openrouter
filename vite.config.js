import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

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
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      // 'auto' injects the registration script into the built index.html;
      // no app-code import needed, so dev/tests never touch the SW.
      injectRegister: 'auto',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Lazy Imagen',
        short_name: 'Imagen',
        description:
          'Lazy image generation UI for OpenRouter — orchestrator mode plus a local (no-AI) upscaler and background removal.',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        // Relative so they resolve against the GitHub Pages subpath
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the app shell; the gallery itself lives in IndexedDB so
        // previously generated images already work offline.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          // OpenRouter API calls are intentionally NOT cached — generation
          // and pricing must always hit the network.
        ],
      },
    }),
  ],
});
