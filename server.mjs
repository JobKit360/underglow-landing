// UnderGlow landing gate. Serves the static site, but only to visitors who give the password.
//  - LANDING_PUBLIC=1        -> open to everyone (launch switch)
//  - LANDING_PASSWORD set    -> HTTP basic auth (any username, that password)
//  - neither                 -> 401 for everyone
// While locked every response carries X-Robots-Tag: noindex and HTML gets a noindex meta.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', '.json': 'application/json; charset=utf-8', '.webp': 'image/webp' };
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();

function authorized(req) {
  const pw = process.env.LANDING_PASSWORD || '';
  if (!pw) return false;
  const m = /^Basic (.+)$/i.exec(req.headers.authorization || '');
  if (!m) return false;
  const dec = Buffer.from(m[1], 'base64').toString('utf8');
  const given = dec.slice(dec.indexOf(':') + 1);
  return crypto.timingSafeEqual(sha(given), sha(pw));
}

http.createServer((req, res) => {
  const open = process.env.LANDING_PUBLIC === '1';
  const base = { 'Cache-Control': open && !process.env.NO_CACHE ? 'public, max-age=300' : 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  if (!open) base['X-Robots-Tag'] = 'noindex, nofollow';
  if (!open && !authorized(req)) {
    res.writeHead(401, { ...base, 'WWW-Authenticate': 'Basic realm="UnderGlow (private preview)", charset="UTF-8"', 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Private preview. Password required.');
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, base); return res.end(); }
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400, base); return res.end(); }
  if (p === '/app') p = '/app/';
  if (p.endsWith('/')) p += 'index.html';
  // only the site's own top-level files with an allowed extension; never server code, package files or locked/
  let name = p.replace(/^\/+/, '');
  if (/^[a-z]+$/.test(name) && fs.existsSync(path.join(root, name + '.html'))) name += '.html'; // clean URLs: /terms -> terms.html
  const file = path.join(root, name);
  const ext = path.extname(name).toLowerCase();
  // the demo app (website/app/, built from the real app UI) may have sub-folders; everything else stays top-level only
  const inApp = /^app\/(?:[\w.-]+\/)*[\w.-]+$/.test(name) && !name.includes('..');
  const okName = inApp || /^[\w.-]+$/.test(name);
  if (!okName || name.startsWith('.') || !TYPES[ext] || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { ...base, 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not found');
  }
  let body = fs.readFileSync(file);
  if (ext === '.html' && !open) body = Buffer.from(body.toString('utf8').replace('<head>', '<head>\n<meta name="robots" content="noindex, nofollow">'));
  res.writeHead(200, { ...base, 'Content-Type': TYPES[ext] });
  res.end(req.method === 'HEAD' ? undefined : body);
}).listen(Number(process.env.PORT) || 10000, '0.0.0.0');
