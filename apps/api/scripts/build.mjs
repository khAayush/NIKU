// Bundles the API into dist/server.js for production.
// Workspace packages (@todo/shared) and the generated Prisma client are bundled in;
// npm dependencies stay external and are installed in the production image.
import { build } from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies).filter((name) => !name.startsWith('@todo/'));

rmSync(new URL('../dist', import.meta.url), { recursive: true, force: true });
await build({
  entryPoints: ['src/server.ts'],
  outfile: 'dist/server.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  // Bare package and subpath imports (e.g. "better-auth/node") stay external.
  external: [...external, ...external.map((name) => `${name}/*`)],
  // Some CommonJS dependencies call require(); give ESM output a require.
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: 'info',
});
