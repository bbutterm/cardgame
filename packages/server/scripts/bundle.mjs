import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';

/**
 * Bundles the server into a single file plain Node can run.
 *
 * `tsc` alone is not enough here: the workspace packages resolve to their
 * TypeScript sources (their package.json `main` points at src/index.ts, which is
 * what lets Vite and Vitest consume them without a build step), so the emitted
 * JS imports `.js` paths that do not exist. Bundling pulls engine, cards and
 * protocol in as source and produces something deployable.
 *
 * Node built-ins and socket.io stay external — socket.io ships optional native
 * bits and has no business being inlined.
 */
await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'dist/server.js',
  external: ['socket.io'],
  sourcemap: true,
  logLevel: 'info',
  banner: {
    // socket.io reaches for require() from ESM.
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});

/**
 * The bundle is ESM, and `node dist/server.js` decides that from the nearest
 * package.json. In this repository that is the server package, which says
 * `"type": "module"` — but a deployment that copies only `dist/` (the Docker
 * image does exactly that) has no such file above it, and Node falls back to
 * reparsing the file as CommonJS and warns on every boot. Stating it inside
 * `dist/` makes the directory self-describing wherever it is copied to.
 */
await writeFile('dist/package.json', JSON.stringify({ type: 'module' }, null, 2) + '\n');
