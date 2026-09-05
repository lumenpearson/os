import { cpSync, existsSync, readFileSync, statSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

/** The package catalogue, which lives at the root of the repository. */
const STORE_DIR = fileURLToPath(new URL('../../store/', import.meta.url));

const CONTENT_TYPES: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

/**
 * Serve the package catalogue beside the OS at `/store/`.
 *
 * The catalogue is a directory of static files meant to be lifted into a
 * repository of its own and deployed separately; until it is, the host that
 * serves Lumen serves it too, which is what `settings.store.origin` defaults
 * to. Nothing in the OS knows the difference — it fetches a base URL.
 *
 * A checkout that has not run `pnpm store` has no catalogue, and that is not
 * a build error: the storefront reports an unreachable store the same way it
 * reports being offline.
 */
function storeCatalogue(): Plugin {
  return {
    name: 'lumen-store-catalogue',
    configureServer(server) {
      server.middlewares.use('/store', (req, res, next) => {
        // `normalize` collapses any `..` a request tries to walk out with,
        // and the prefix check refuses what is left if it still escapes.
        const rel = normalize(decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/'));
        const file = join(STORE_DIR, rel);
        if (!file.startsWith(STORE_DIR)) {
          res.statusCode = 403;
          res.end();
          return;
        }
        if (!existsSync(file) || !statSync(file).isFile()) return next();
        const dot = file.lastIndexOf('.');
        res.setHeader('Content-Type', CONTENT_TYPES[file.slice(dot)] ?? 'application/octet-stream');
        res.end(readFileSync(file));
      });
    },
    closeBundle() {
      if (!existsSync(STORE_DIR)) return;
      cpSync(STORE_DIR, fileURLToPath(new URL('./dist/store/', import.meta.url)), {
        recursive: true,
      });
    },
  };
}

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    tailwindcss(),
    storeCatalogue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Lumen OS',
        short_name: 'Lumen OS',
        description: 'A desktop operating environment that runs in the browser.',
        display: 'fullscreen',
        background_color: '#141517',
        theme_color: '#141517',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
  server: { port: 5173, strictPort: true },
});
