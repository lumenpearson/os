import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const DEFAULT_SITE_URL = 'https://lumen-os-landing.vercel.app';
const DEFAULT_OS_URL = 'https://lumen-os.vercel.app';

/** Fills the %SITE_URL% / %OS_URL% placeholders in index.html, with defaults when the env is unset. */
function htmlEnv(values: Record<string, string>): Plugin {
  return {
    name: 'lumen-html-env',
    transformIndexHtml(html) {
      return html.replace(/%([A-Z_]+)%/g, (match, key: string) => values[key] ?? match);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const siteUrl = (env.VITE_SITE_URL || DEFAULT_SITE_URL).replace(/\/$/, '');
  const osUrl = (env.VITE_OS_URL || DEFAULT_OS_URL).replace(/\/$/, '');
  const rootPackage = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  ) as { version: string };

  return {
    plugins: [react(), tailwindcss(), htmlEnv({ SITE_URL: siteUrl, OS_URL: osUrl })],
    define: {
      __APP_VERSION__: JSON.stringify(rootPackage.version),
      'import.meta.env.VITE_SITE_URL': JSON.stringify(siteUrl),
      'import.meta.env.VITE_OS_URL': JSON.stringify(osUrl),
    },
    build: {
      target: 'es2022',
      sourcemap: false,
      // The scene (three + react-three-fiber) lives behind React.lazy and is one chunk on its own.
      chunkSizeWarningLimit: 1000,
    },
    server: { port: 5175, strictPort: true },
  };
});
