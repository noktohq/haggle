// Minimal static file server for the storefront/ directory — e2e use only.
// Anything not found (including Shopify's /products.json) 404s, which is
// exactly what webmcp-haggle.js sees on a non-Shopify origin.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../storefront', import.meta.url));
const port = Number(process.env.PORT) || 8790;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

http
  .createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url || '/', 'http://x').pathname);
      const file = normalize(join(root, pathname === '/' ? 'demo.html' : pathname));
      if (!file.startsWith(root + sep)) throw new Error('outside root');
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end('{"error":"not found"}');
    }
  })
  .listen(port, () => console.log(`[e2e] storefront static server on :${port}`));
