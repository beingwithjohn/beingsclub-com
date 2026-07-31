// A static server for the repo, so the log can be opened in a browser while
// `wrangler dev` runs the API beside it. Development only — the real site is
// served by GitHub Pages.
//
//   node practice-log/dev/serve.js [port]

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// PORT wins, so a harness that assigns one is obeyed; the argument is the
// manual case.
const port = Number(process.env.PORT || process.argv[2] || 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.json': 'application/json', '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  // normalize collapses any ../ before it can climb out of the repo
  let path = join(repo, normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));

  try {
    const s = await stat(path).catch(() => null);
    if (s?.isDirectory()) path = join(path, 'index.html');
    const body = await readFile(path);
    res.writeHead(200, {
      'content-type': TYPES[extname(path)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch {
    const four04 = await readFile(join(repo, '404.html')).catch(() => 'Not found');
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(four04);
  }
}).listen(port, () => console.log(`serving ${repo} on http://localhost:${port}`));
