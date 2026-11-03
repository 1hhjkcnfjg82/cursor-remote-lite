// Redeploy cursor-remote-frps so home PCs can reverse-tunnel npm start (:3939).
// Usage:
//   $env:KS_URL='http://192.168.120.110:30880'
//   $env:KS_USER='...'
//   $env:KS_PASS='...'
//   $env:KS_NS='haosmart-btp-dev'
//   $env:FRP_TOKEN='...'   # optional; keeps existing if omitted
//   node bridge/deploy-frps.mjs
import crypto from 'node:crypto';

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

const base = process.env.KS_URL;
const ns = process.env.KS_NS;
const name = 'cursor-remote-frps';
const userPorts = [];
for (let p = 18001; p <= 18030; p++) userPorts.push(p);

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

async function api(token, method, path, body) {
  const res = await fetch(`${base}${path}`, {
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

async function upsert(token, obj) {
  const kind = obj.kind;
  const n = obj.metadata.name;
  const item =
    kind === 'Deployment'
      ? `/apis/apps/v1/namespaces/${ns}/deployments/${n}`
      : kind === 'Service'
        ? `/api/v1/namespaces/${ns}/services/${n}`
        : `/api/v1/namespaces/${ns}/configmaps/${n}`;
  const list =
    kind === 'Deployment'
      ? `/apis/apps/v1/namespaces/${ns}/deployments`
      : kind === 'Service'
        ? `/api/v1/namespaces/${ns}/services`
        : `/api/v1/namespaces/${ns}/configmaps`;
  const get = await api(token, 'GET', item);
  if (get.ok) {
    obj.metadata.resourceVersion = get.data.metadata.resourceVersion;
    if (kind === 'Service' && get.data.spec?.clusterIP) obj.spec.clusterIP = get.data.spec.clusterIP;
    if (kind === 'ConfigMap' && !process.env.FRP_TOKEN && get.data.data?.['frps.toml']) {
      const m = /auth\.token\s*=\s*"([^"]+)"/.exec(get.data.data['frps.toml']);
      if (m) process.env.FRP_TOKEN = m[1];
    }
    const put = await api(token, 'PUT', item, obj);
    console.log(kind, n, 'update', put.status, put.ok ? 'ok' : JSON.stringify(put.data).slice(0, 300));
    if (!put.ok) throw new Error('update failed');
  } else {
    const post = await api(token, 'POST', list, obj);
    console.log(kind, n, 'create', post.status, post.ok ? 'ok' : JSON.stringify(post.data).slice(0, 300));
    if (!post.ok) throw new Error('create failed');
  }
}

const token = await login();
const frpToken = process.env.FRP_TOKEN || crypto.randomBytes(24).toString('base64url');

const frpsToml = `bindPort = 7000
auth.method = "token"
auth.token = "${frpToken}"
allowPorts = [
  { start = 18001, end = 18030 }
]
`;

const configMap = {
  apiVersion: 'v1',
  kind: 'ConfigMap',
  metadata: { name, namespace: ns, labels: { app: name } },
  data: { 'frps.toml': frpsToml },
};

const deployment = {
  apiVersion: 'apps/v1',
  kind: 'Deployment',
  metadata: { name, namespace: ns, labels: { app: name } },
  spec: {
    replicas: 1,
    selector: { matchLabels: { app: name } },
    template: {
      metadata: { labels: { app: name } },
      spec: {
        containers: [
          {
            name: 'frps',
            image: 'snowdreamtech/frps:0.61.1',
            args: ['-c', '/etc/frp/frps.toml'],
            ports: [
              { name: 'bind', containerPort: 7000 },
              ...userPorts.map((p) => ({ name: `p${p}`, containerPort: p })),
            ],
            volumeMounts: [{ name: 'cfg', mountPath: '/etc/frp' }],
            readinessProbe: {
              tcpSocket: { port: 7000 },
              initialDelaySeconds: 2,
              periodSeconds: 5,
            },
            resources: {
              requests: { cpu: '50m', memory: '64Mi' },
              limits: { cpu: '500m', memory: '256Mi' },
            },
          },
        ],
        volumes: [{ name: 'cfg', configMap: { name } }],
      },
    },
  },
};

const service = {
  apiVersion: 'v1',
  kind: 'Service',
  metadata: { name, namespace: ns, labels: { app: name } },
  spec: {
    type: 'NodePort',
    selector: { app: name },
    ports: [
      { name: 'bind', port: 7000, targetPort: 7000, nodePort: 30700, protocol: 'TCP' },
      ...userPorts.map((p) => ({
        name: `u${p}`,
        port: p,
        targetPort: p,
        protocol: 'TCP',
      })),
    ],
  },
};

await upsert(token, configMap);
await upsert(token, deployment);
await upsert(token, service);

const pods = await api(token, 'GET', `/api/v1/namespaces/${ns}/pods?labelSelector=app%3D${name}`);
for (const p of pods.data?.items || []) {
  await api(token, 'DELETE', `/api/v1/namespaces/${ns}/pods/${p.metadata.name}`);
}

for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 3000));
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
    console.log('FRP_TOKEN=' + frpToken);
    console.log('frpc server = 192.168.120.110:30700');
    console.log('gateway should register host like: cursor-remote-frps:18001');
    process.exit(0);
  }
}
process.exit(2);
