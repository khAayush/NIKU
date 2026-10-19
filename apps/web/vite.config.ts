import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export default defineConfig(({ mode }) => {
  // APP_NAME comes from the repo-root .env locally, or the Docker build arg in production.
  const env = loadEnv(mode, fileURLToPath(new URL('../..', import.meta.url)), '');
  const appName = (process.env.APP_NAME ?? env.APP_NAME ?? '').trim() || 'Tasks';

  const appNameInHtml: Plugin = {
    name: 'app-name-html',
    transformIndexHtml: (html) => html.replaceAll('%APP_NAME%', escapeHtml(appName)),
  };

  return {
    plugins: [react(), tailwindcss(), appNameInHtml],
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
