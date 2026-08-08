import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Serves the built client from the same process, on the same port.
 *
 * This exists so that connecting the repository to a host and pressing deploy
 * produces a working game. The client asks for `/api/leaderboard` and opens its
 * socket with `io()` — both same-origin, no configured backend URL anywhere —
 * so without this the only way to run it in production was a reverse proxy
 * stitching two processes back together, which is a lot of infrastructure to
 * make one build behave like it does in `pnpm dev`.
 *
 * Deliberately hand-rolled rather than pulling in express/sirv: it is a
 * single-page app with a hashed asset directory, which is about sixty lines of
 * conditions, and the server has no other reason to have a framework.
 */

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

export interface StaticHandler {
  /** Returns true when it answered the request. */
  (req: IncomingMessage, res: ServerResponse): Promise<boolean>;
}

/**
 * `null` when the directory does not exist — a server started without a built
 * client (tests, `pnpm dev`, an API-only deployment) must still run.
 */
export async function createStaticHandler(root: string): Promise<StaticHandler | null> {
  const base = resolve(root);
  const index = join(base, 'index.html');

  try {
    if (!(await stat(index)).isFile()) return null;
  } catch {
    return null;
  }

  async function send(res: ServerResponse, file: string, immutable: boolean): Promise<boolean> {
    let size: number;
    try {
      const info = await stat(file);
      if (!info.isFile()) return false;
      size = info.size;
    } catch {
      return false;
    }

    res.writeHead(200, {
      'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'content-length': size,
      // Asset filenames carry a content hash, so they can be cached forever.
      // Everything else — index.html above all — must be revalidated, or a
      // deploy would never reach a browser that has the old one.
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    createReadStream(file).pipe(res);
    return true;
  }

  return async function serve(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;

    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);

    // `new URL()` above already resolved `..` and `%2e%2e` out of the pathname,
    // so this guard should never fire. It stays because the cost of being wrong
    // about that is arbitrary file read, and because the check is two lines.
    // `base + sep` rather than `base`, so a sibling `dist-old` cannot match.
    const target = join(base, normalize(path));
    if (target !== base && !target.startsWith(base + sep)) {
      res.writeHead(403).end();
      return true;
    }

    if (path.startsWith('/assets/')) {
      if (await send(res, target, true)) return true;
      // A miss under /assets is a stale index.html asking for a bundle this
      // deploy no longer has. Answering with the SPA shell would hand it HTML
      // where it expects JavaScript; 404 lets the service worker fall back.
      res.writeHead(404).end();
      return true;
    }

    if (path !== '/' && (await send(res, target, false))) return true;

    // Single-page app: any other path is a client route, so serve the shell.
    return send(res, index, false);
  };
}
