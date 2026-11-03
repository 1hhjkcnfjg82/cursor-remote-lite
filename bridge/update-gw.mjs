// Deploy / update cursor-remote-gw in KubeSphere.
// Usage (PowerShell):
//   $env:KS_URL='http://192.168.120.110:30880'
//   $env:KS_USER='zy-haosmart-btp-regular'
//   $env:KS_PASS='...'
//   $env:KS_NS='haosmart-btp-dev'
//   $env:REGISTER_TOKEN='...'   # optional; generated/kept if omitted
//   node bridge/update-gw.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

function encryptPassword(encryptKey, password) {
  const b64Password = Buffer.from(String(password), 'utf8').toString('base64');
  let key = String(encryptKey || 'kubesphere');
  const data = b64Password;
  if (data.length > key.length) key += data.slice(0, data.length - key.length);
  const halfChars = [];
  const parityBits = [];
  for (let i = 0; i < key.length; i++) {
    const dataCode = data.length > i ? data.charCodeAt(i) : 64;
    const sum = key.charCodeAt(i) + dataCode;
    parityBits.push(sum % 2 === 0 ? '0' : '1');
    halfChars.push(String.fromCharCode(Math.floor(sum / 2)));
  }
  return `${Buffer.from(parityBits.join(''), 'utf8').toString('base64')}@${halfChars.join('')}`;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const base = process.env.KS_URL;
const ns = process.env.KS_NS;
const name = 'cursor-remote-gw';
const gwJs = fs.readFileSync(path.join(__dirname, 'gateway.mjs'), 'utf8');

if (!base || !ns || !process.env.KS_USER || !process.env.KS_PASS) {
  console.error('Need KS_URL KS_NS KS_USER KS_PASS');
  process.exit(1);
}

async function login() {
  const res = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: process.env.KS_USER,
      encrypt: encryptPassword('kubesphere', process.env.KS_PASS),
    }),
    redirect: 'manual',
  });
  const setCookie = res.headers.getSetCookie?.() || [];
  let c = res.headers.get('set-cookie') || '';
  if (setCookie.length) c = setCookie.join(',');
  const m = /(?:^|,|\s)token=([^;]+)/.exec(c);
  if (!m) throw new Error(`login fail ${res.status}`);
  return decodeURIComponent(m[1]);
}

async function api(token, method, pathName, body) {
  const res = await fetch(`${base}${pathName}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await res.text();
  let data;
  try {
    data = t ? JSON.parse(t) : null;
  } catch {
    data = t;
  }
  return { ok: res.ok, status: res.status, data };
}

function envList(dep) {
  return dep?.spec?.template?.spec?.containers?.[0]?.env || [];
}

function getEnv(dep, key) {
  return envList(dep).find((e) => e.name === key)?.value;
}

function setEnv(dep, key, value) {
  const c = dep.spec.template.spec.containers[0];
  c.env = c.env || [];
  const hit = c.env.find((e) => e.name === key);
  if (hit) hit.value = value;
  else c.env.push({ name: key, value });
}

const token = await login();
const getCm = await api(token, 'GET', `/api/v1/namespaces/${ns}/configmaps/${name}`);
if (!getCm.ok) throw new Error('configmap missing — run initial deploy first');
const cm = getCm.data;
cm.data['gateway.mjs'] = gwJs;
// Preserve routes.json (boot-time ROUTES_JSON). Never wipe to {}.
// Optional: FORCE_ROUTE_USER + FORCE_ROUTE_HOST rewrite one entry (home frp).
if (process.env.FORCE_ROUTE_USER && process.env.FORCE_ROUTE_HOST) {
  let routes = {};
  try { routes = JSON.parse(cm.data['routes.json'] || '{}'); } catch { routes = {}; }
  routes[process.env.FORCE_ROUTE_USER] = process.env.FORCE_ROUTE_HOST;
  cm.data['routes.json'] = JSON.stringify(routes, null, 2) + '\n';
  console.log('routes.json forced', process.env.FORCE_ROUTE_USER, '->', process.env.FORCE_ROUTE_HOST);
} else if (!cm.data['routes.json'] || !String(cm.data['routes.json']).trim() || String(cm.data['routes.json']).trim() === '{}') {
  console.log('!! routes.json empty — set FORCE_ROUTE_USER/HOST or register from PC after READY');
}
const putCm = await api(token, 'PUT', `/api/v1/namespaces/${ns}/configmaps/${name}`, cm);
console.log('configmap', putCm.status, putCm.ok ? 'ok' : JSON.stringify(putCm.data).slice(0, 300));
if (!putCm.ok) process.exit(1);

const getDep = await api(token, 'GET', `/apis/apps/v1/namespaces/${ns}/deployments/${name}`);
if (!getDep.ok) throw new Error('deployment missing');
const dep = getDep.data;
const existing = process.env.REGISTER_TOKEN || getEnv(dep, 'REGISTER_TOKEN');
const registerToken = existing || crypto.randomBytes(24).toString('base64url');
setEnv(dep, 'REGISTER_TOKEN', registerToken);
const putDep = await api(token, 'PUT', `/apis/apps/v1/namespaces/${ns}/deployments/${name}`, dep);
console.log('deployment', putDep.status, putDep.ok ? 'ok' : JSON.stringify(putDep.data).slice(0, 300));
if (!putDep.ok) process.exit(1);

const pods = await api(token, 'GET', `/api/v1/namespaces/${ns}/pods?labelSelector=app%3D${name}`);
for (const p of pods.data?.items || []) {
  const del = await api(token, 'DELETE', `/api/v1/namespaces/${ns}/pods/${p.metadata.name}`);
  console.log('delete', p.metadata.name, del.status);
}
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const pods2 = await api(token, 'GET', `/api/v1/namespaces/${ns}/pods?labelSelector=app%3D${name}`);
  const items = pods2.data?.items || [];
  const ready = items.some(
    (p) =>
      p.status.phase === 'Running' &&
      (p.status.containerStatuses || []).length &&
      (p.status.containerStatuses || []).every((c) => c.ready)
  );
  console.log(items.map((p) => `${p.metadata.name}:${p.status.phase}`).join(' | ') || '(none)');
  if (ready) {
    console.log('READY');
    console.log('REGISTER_TOKEN=' + registerToken);
    console.log('routes.json=', cm.data['routes.json']);
    process.exit(0);
  }
}
process.exit(2);
