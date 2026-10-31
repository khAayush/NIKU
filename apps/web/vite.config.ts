import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** White, like the app's background, so the installed app's status bar blends in. */
const THEME_COLOR = '#ffffff';

/** Web app manifest (makes the app installable). Served in dev, emitted on build. */
function manifest(appName: string): string {
  return JSON.stringify(
    {
      id: '/',
      name: appName,
      short_name: appName,
      description: 'Tasks, reminders and a calendar.',
      start_url: '/today',
      scope: '/',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: THEME_COLOR,
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        {
          src: '/icons/icon-maskable-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    },
    null,
    2,
  );
}

/**
 * Makes the app installable and offline-capable:
 * - `%APP_NAME%` / `%THEME_COLOR%` in index.html, and /manifest.webmanifest.
 * - After a build, writes the app-shell file list and a version into dist/sw.js (replacing
 *   `'__APP_SHELL__'`). In development the placeholder stays, which turns caching off.
 */
function pwa(appName: string): Plugin {
  let outDir = '';
  return {
    name: 'app-pwa',
    configResolved: (config) => {
      outDir = resolve(config.root, config.build.outDir);
    },
    transformIndexHtml: (html) =>
      html.replaceAll('%APP_NAME%', escapeHtml(appName)).replaceAll('%THEME_COLOR%', THEME_COLOR),
    configureServer(server) {
      server.middlewares.use('/manifest.webmanifest', (_req, res) => {
        res.setHeader('Content-Type', 'application/manifest+json');
        res.end(manifest(appName));
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: manifest(appName) });
    },
    writeBundle(_options, bundle) {
      const built = Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== 'index.html');
      const urls = [
        '/',
        ...built.map((f) => `/${f}`),
        '/favicon.svg',
        '/apple-touch-icon.png',
        '/icons/icon-192.png',
        '/icons/icon-512.png',
      ].sort();
      // Hashed file names change with their content; index.html covers the rest.
      const version = createHash('sha256')
        .update(urls.join('\n'))
        .update(readFileSync(join(outDir, 'index.html')))
        .update(manifest(appName))
        .digest('hex')
        .slice(0, 12);

      const swPath = join(outDir, 'sw.js');
      const sw = readFileSync(swPath, 'utf8');
      if (!sw.includes(`'__APP_SHELL__'`)) throw new Error('sw.js: app-shell placeholder missing');
      writeFileSync(swPath, sw.replace(`'__APP_SHELL__'`, JSON.stringify({ version, urls })));
    },
  };
}

export default defineConfig(({ mode }) => {
  // APP_NAME comes from the repo-root .env locally, or the Docker build arg in production.
  const env = loadEnv(mode, fileURLToPath(new URL('../..', import.meta.url)), '');
  const appName = (process.env.APP_NAME ?? env.APP_NAME ?? '').trim() || 'Tasks';

  return {
    plugins: [react(), tailwindcss(), pwa(appName)],
    define: { __APP_NAME__: JSON.stringify(appName) },
    server: {
      port: 5173,
      // Same-origin in development so session cookies just work.
      proxy: {
        '/api': 'http://127.0.0.1:3000',
        '/socket.io': { target: 'http://127.0.0.1:3000', ws: true },
      },
    },
  };
});
