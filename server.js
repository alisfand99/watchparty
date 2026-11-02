// Optional relay + static file server. No dependencies. Run with: node server.js
//
// The app does NOT need this to run: by default it uses the public ntfy.sh service as the
// meeting point. This file speaks the same tiny API (POST /<topic>, GET /<topic>/sse), so it can be
// hosted anywhere as a private replacement, and it is what the automated tests run against.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};
const TOPIC = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_BODY = 4096; // same limit as ntfy.sh
const MAX_SUBS = 50;

const topics = new Map(); // topic -> Set<ServerResponse>
let seq = 0;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const parts = url.pathname.split('/').filter(Boolean);

  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', ...CORS });
    return res.end('{"ok":true}');
  }

  // publish
  if (req.method === 'POST' && parts.length === 1 && TOPIC.test(parts[0])) {
    const topic = parts[0];
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size <= MAX_BODY) chunks.push(c);
    });
    req.on('end', () => {
      if (size > MAX_BODY) { res.writeHead(413, CORS); return res.end(); }
      const msg = { id: String(++seq), time: Math.floor(Date.now() / 1000), event: 'message', topic, message: Buffer.concat(chunks).toString('utf8') };
      const payload = `id: ${msg.id}\nevent: message\ndata: ${JSON.stringify(msg)}\n\n`;
      for (const sub of topics.get(topic) || []) sub.write(payload);
      res.writeHead(200, { 'Content-Type': 'application/json', ...CORS });
      res.end(JSON.stringify(msg));
    });
    return;
  }

  // subscribe (server-sent events)
  if (req.method === 'GET' && parts.length === 2 && parts[1] === 'sse' && TOPIC.test(parts[0])) {
    const topic = parts[0];
    const set = topics.get(topic) || new Set();
    if (set.size >= MAX_SUBS) { res.writeHead(429, CORS); return res.end(); }
    topics.set(topic, set);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      ...CORS,
    });
    res.write(`event: open\ndata: ${JSON.stringify({ id: 'open', time: Math.floor(Date.now() / 1000), event: 'open', topic })}\n\n`);
    set.add(res);
    const ka = setInterval(() => res.write(`event: keepalive\ndata: {"event":"keepalive"}\n\n`), 25000);
    req.on('close', () => {
      clearInterval(ka);
      set.delete(res);
      if (set.size === 0) topics.delete(topic);
    });
    return;
  }

  // static files
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

function start(port = PORT) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(Number(port), () => resolve(server.address().port));
  });
}

if (require.main === module) {
  start(PORT).then((p) => console.log(`Relay and static server on http://localhost:${p}`));
}
module.exports = { server, start };
