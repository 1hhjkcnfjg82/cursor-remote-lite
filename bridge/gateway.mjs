import http from 'node:http';
import { URL } from 'node:url';

const routes = JSON.parse(process.env.ROUTES_JSON || '{}');
const REGISTER_TOKEN = String(process.env.REGISTER_TOKEN || '');
const COOKIE = 'cr_u';
const PORT = Number(process.env.PORT || 8080);

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function normalizeUser(raw) {
  if (!raw) return null;
  return String(raw).trim().replace(/\/+$/, '');
}

function pickUser(req, url) {
  const q = normalizeUser(url.searchParams.get('u') || url.searchParams.get('user'));
  if (q && routes[q]) return q;
  const c = normalizeUser(parseCookies(req.headers.cookie)[COOKIE]);
  if (c && routes[c]) return c;
  return null;
}

function noUserPage() {
  return `<!doctype html><meta charset=utf-8><title>Cursor Remote</title>
<body style="font-family:sans-serif;max-width:28rem;margin:3rem auto;padding:0 1rem;color:#ddd;background:#1e1e1e">
<h1 style="font-size:1.25rem;color:#eee">需要个人入口地址</h1>
<p style="color:#aaa;line-height:1.6">请使用发给你的地址打开，形如：</p>
<pre style="background:#2d2d2d;padding:12px;border-radius:8px;overflow:auto;color:#ccc">http://192.168.120.110:30939/?u=你的代号</pre>
<p style="color:#888;font-size:14px">本页不提供选人列表。不清楚代号请联系管理员。</p>
</body>`;
}

function unknownUserPage(u) {
  return `<!doctype html><meta charset=utf-8><title>Cursor Remote</title>
<body style="font-family:sans-serif;max-width:28rem;margin:3rem auto;padding:0 1rem;color:#ddd;background:#1e1e1e">
<h1 style="font-size:1.25rem;color:#eee">代号无效</h1>
<p style="color:#aaa">没有找到「${String(u).replace(/[<>&]/g, '')}」，请核对入口地址；或在电脑上 npm start 自动登记后再试。</p>
</body>`;
}

function backendUrl(user) {
  const raw = routes[user];
  if (!raw) return null;
  return raw.includes('://') ? raw.replace(/\/?$/, '/') : `http://${raw.replace(/\/?$/, '')}/`;
}

function proxyHeaders(req) {
  const headers = { ...req.headers };
  if (req.headers.host) headers.host = req.headers.host;
  headers['x-forwarded-host'] = req.headers.host || '';
  headers['x-forwarded-proto'] = 'http';
  delete headers['accept-encoding'];
  return headers;
}

function proxy(req, res, targetBase, user) {
  const incoming = new URL(req.url, 'http://x');
  const target = new URL(incoming.pathname + incoming.search, targetBase);
  const headers = proxyHeaders(req);
  const setCookie =
    `${COOKIE}=${encodeURIComponent(user)}; Path=/; SameSite=Lax; Max-Age=31536000`;

  const pReq = http.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || 80,
      path: target.pathname + target.search,
      method: req.method,
      headers,
    },
    (pRes) => {
      const outHeaders = { ...pRes.headers };
      const prev = outHeaders['set-cookie'];
      outHeaders['set-cookie'] = prev
        ? (Array.isArray(prev) ? prev : [prev]).concat(setCookie)
        : setCookie;
      res.writeHead(pRes.statusCode || 502, outHeaders);
      pRes.pipe(res);
    }
  );
  pReq.on('error', (err) => {
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(`连不上电脑（${user}）：${err.message}\n请确认对方已 npm start，且集群能访问其 IP。`);
  });
  req.pipe(pReq);
}

function readBody(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > limit) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function validUser(u) {
  return typeof u === 'string' && /^[a-zA-Z0-9._-]{1,64}$/.test(u);
}

function validHost(host) {
  if (typeof host !== 'string' || host.length > 120) return false;
  const m = /^(.+):(\d{1,5})$/.exec(host.trim());
  if (!m) return false;
  const port = Number(m[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return false;
  const h = m[1];
  // Private IP (LAN / VPN) — blocks SSRF to public internet.
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(h)) {
    const parts = h.split('.').map(Number);
    if (parts.some((x) => x < 0 || x > 255)) return false;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    return false;
  }
  // In-cluster Service name (home frp backend), e.g. cursor-remote-frps:18001
  if (/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i.test(h)) return true;
  if (/^[a-z0-9.-]+\.svc(\.cluster\.local)?$/i.test(h)) return true;
  return false;
}

async function handleRegister(req, res) {
  if (!REGISTER_TOKEN) {
    res.writeHead(503, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'register disabled' }));
    return;
  }
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token || token !== REGISTER_TOKEN) {
    res.writeHead(401, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }
  let body;
  try {
    body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
  } catch {
    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'invalid json' }));
    return;
  }
  const u = body.u || body.user;
  const host = String(body.host || '').trim();
  if (!validUser(u) || !validHost(host)) {
    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'invalid u or host (expect private IP:port)' }));
    return;
  }
  const prev = routes[u] || null;
  routes[u] = host;
  console.log(`[register] ${u} -> ${host}${prev && prev !== host ? ` (was ${prev})` : ''}`);
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: true, u, host, prev }));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://x');
  if (url.pathname === '/_health') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }
  if (url.pathname === '/_register' && req.method === 'POST') {
    handleRegister(req, res).catch((e) => {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: e.message || 'error' }));
    });
    return;
  }

  const qUser = normalizeUser(url.searchParams.get('u') || url.searchParams.get('user'));
  if (qUser && !routes[qUser]) {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(unknownUserPage(qUser));
    return;
  }

  const user = pickUser(req, url);
  if (!user) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(noUserPage());
    return;
  }

  // ?u=xxx → set cookie and land on / (keep #pair= fragment on client)
  if (url.searchParams.has('u') || url.searchParams.has('user')) {
    res.writeHead(302, {
      location: url.pathname || '/',
      'set-cookie': `${COOKIE}=${encodeURIComponent(user)}; Path=/; SameSite=Lax; Max-Age=31536000`,
    });
    res.end();
    return;
  }

  proxy(req, res, backendUrl(user), user);
});

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url || '/', 'http://x');
  const user = pickUser(req, url);
  const base = user && backendUrl(user);
  if (!base) {
    socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  const target = new URL(url.pathname + url.search, base);
  const headers = proxyHeaders(req);
  const pReq = http.request({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || 80,
    path: target.pathname + target.search,
    method: 'GET',
    headers,
  });
  pReq.on('upgrade', (pRes, pSocket, pHead) => {
    const lines = [`HTTP/1.1 101 Switching Protocols`];
    for (const [k, v] of Object.entries(pRes.headers)) {
      if (Array.isArray(v)) v.forEach((x) => lines.push(`${k}: ${x}`));
      else lines.push(`${k}: ${v}`);
    }
    lines.push('', '');
    socket.write(lines.join('\r\n'));
    if (pHead?.length) socket.write(pHead);
    pSocket.pipe(socket);
    socket.pipe(pSocket);
  });
  pReq.on('error', () => socket.destroy());
  pReq.end();
  if (head?.length) pReq.write(head);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`gateway on :${PORT}, users=${Object.keys(routes).length}, register=${REGISTER_TOKEN ? 'on' : 'off'}`);
});
