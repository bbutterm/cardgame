import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InMemoryRatingRepository } from '../src/ratings.js';
import { startServer, type RunningServer } from '../src/server.js';

/**
 * The server serves the built client so that connecting the repository to a
 * host and pressing deploy yields a working game — the client's socket and its
 * `/api` calls are both same-origin with no configurable backend URL, so
 * anything else needs a reverse proxy in front of two processes.
 *
 * Served against a fixture directory rather than the real `packages/client/dist`,
 * so the suite does not require a client build to have happened first.
 */

let server: RunningServer;
let root: string;

const INDEX = '<!doctype html><title>shell</title>';

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'delezh-static-'));
  await mkdir(join(root, 'assets'));
  await writeFile(join(root, 'index.html'), INDEX);
  await writeFile(join(root, 'assets', 'index-abc123.js'), 'export const x = 1;');
  await writeFile(join(root, 'sw.js'), '/* worker */');
  await writeFile(join(root, 'manifest.webmanifest'), '{"name":"d"}');
  // A file that must never be reachable: it sits beside the served root.
  await writeFile(join(root, '..', 'delezh-secret.txt'), 'do not serve me');

  server = await startServer({
    port: 0,
    repository: new InMemoryRatingRepository(),
    clientDir: root,
  });
});

afterAll(async () => {
  await server?.close();
  await rm(root, { recursive: true, force: true });
  await rm(join(root, '..', 'delezh-secret.txt'), { force: true });
});

const get = (path: string) => fetch(`http://127.0.0.1:${server.port}${path}`);

describe('serving the client', () => {
  it('serves the shell at the root', async () => {
    const res = await get('/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    expect(await res.text()).toBe(INDEX);
  });

  it('serves real files with the right content type', async () => {
    for (const [path, type] of [
      ['/sw.js', /javascript/],
      ['/manifest.webmanifest', /manifest\+json/],
      ['/assets/index-abc123.js', /javascript/],
    ] as const) {
      const res = await get(path);
      expect(res.status, path).toBe(200);
      expect(res.headers.get('content-type'), path).toMatch(type);
    }
  });

  it('caches hashed assets forever and revalidates everything else', async () => {
    // Asset names carry a content hash so they are immutable; index.html and
    // sw.js must not be, or a deploy would never reach a returning browser.
    expect((await get('/assets/index-abc123.js')).headers.get('cache-control')).toMatch(/immutable/);
    expect((await get('/')).headers.get('cache-control')).toBe('no-cache');
    expect((await get('/sw.js')).headers.get('cache-control')).toBe('no-cache');
  });

  it('falls back to the shell for client routes', async () => {
    const res = await get('/some/deep/route');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(INDEX);
  });

  it('404s a missing asset instead of handing it the shell', async () => {
    // A stale index.html asking for a bundle this deploy no longer has must not
    // receive HTML where it expects JavaScript.
    expect((await get('/assets/index-gone.js')).status).toBe(404);
  });

  it('does not serve files outside the client directory', async () => {
    for (const path of [
      '/../delezh-secret.txt',
      '/../../delezh-secret.txt',
      '/%2e%2e/delezh-secret.txt',
      '/assets/../../delezh-secret.txt',
    ]) {
      const res = await get(path);
      expect(await res.text(), path).not.toContain('do not serve me');
    }
  });

  it('leaves the API surface alone', async () => {
    const res = await get('/api/health');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
  });
});

describe('serving nothing', () => {
  it('still starts, and still answers the API, with no client build', async () => {
    // `pnpm dev` and API-only deployments are both legitimate; a missing bundle
    // must not stop the process from coming up.
    const bare = await startServer({
      port: 0,
      repository: new InMemoryRatingRepository(),
      clientDir: join(root, 'does-not-exist'),
    });
    try {
      expect((await fetch(`http://127.0.0.1:${bare.port}/api/health`)).status).toBe(200);
      expect((await fetch(`http://127.0.0.1:${bare.port}/`)).status).toBe(404);
    } finally {
      await bare.close();
    }
  });
});
