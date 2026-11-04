// Admin CLI: allocate gwUser + frp port, write bridge/accounts.json, emit config for colleagues.
//   npm run provision -- <user>
//   npm run provision -- --list
//   npm run provision -- --revoke <user>
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ACCOUNTS_FILE = path.join(__dirname, 'accounts.json');
const OUT_DIR = path.join(__dirname, 'out');
const ADMIN_FILE = path.join(os.homedir(), '.cursor-remote-lite', 'admin.json');

const USER_RE = /^[a-zA-Z0-9._-]{1,64}$/;
const DEFAULT_PORT_MIN = 18001;
const DEFAULT_PORT_MAX = 18030;
const DEFAULT_FRP_ADDR = '192.168.120.110';
const DEFAULT_FRP_PORT = 30700;

function usage(exit = 1) {
  console.log(`用法：
  npm run provision -- <user>           开户（拼音/工号，如 xiaoming）
  npm run provision -- --list           列出已开户
  npm run provision -- --revoke <user>  从台账释放代号与端口

开户前请 git pull，并配置 %USERPROFILE%\\.cursor-remote-lite\\admin.json
（publicUrlBase、gwRegisterToken、frpToken；可选 frpServerAddr / frpServerPort）。`);
  process.exit(exit);
}

function readJson(file, fallback = null) {
  try {
    // PowerShell Set-Content -Encoding utf8 writes a BOM; strip it.
    const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(text);
  } catch (e) {
    if (fallback !== null && (e.code === 'ENOENT' || !fs.existsSync(file))) return fallback;
    throw e;
  }
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
}

function loadLedger() {
  const raw = readJson(ACCOUNTS_FILE, {
    portMin: DEFAULT_PORT_MIN,
    portMax: DEFAULT_PORT_MAX,
    accounts: [],
  });
  const portMin = Number(raw.portMin) || DEFAULT_PORT_MIN;
  const portMax = Number(raw.portMax) || DEFAULT_PORT_MAX;
  const accounts = Array.isArray(raw.accounts) ? raw.accounts : [];
  return { portMin, portMax, accounts };
}

function saveLedger(ledger) {
  writeJson(ACCOUNTS_FILE, {
    portMin: ledger.portMin,
    portMax: ledger.portMax,
    accounts: ledger.accounts,
  });
}

function loadAdmin() {
  const file = fs.existsSync(ADMIN_FILE) ? readJson(ADMIN_FILE, {}) : {};
  const env = process.env;
  const admin = {
    publicUrlBase: env.CR_ADMIN_PUBLIC_URL_BASE || file.publicUrlBase || '',
    gwRegisterToken: env.CR_ADMIN_GW_REGISTER_TOKEN || file.gwRegisterToken || '',
    frpToken: env.CR_ADMIN_FRP_TOKEN || file.frpToken || '',
    frpServerAddr: env.CR_ADMIN_FRP_SERVER_ADDR || file.frpServerAddr || DEFAULT_FRP_ADDR,
    frpServerPort: Number(env.CR_ADMIN_FRP_SERVER_PORT || file.frpServerPort || DEFAULT_FRP_PORT),
  };
  const missing = [];
  if (!admin.publicUrlBase) missing.push('publicUrlBase');
  if (!admin.gwRegisterToken) missing.push('gwRegisterToken');
  if (!admin.frpToken) missing.push('frpToken');
  if (missing.length) {
    console.error(`缺少管理员配置：${missing.join(', ')}`);
    console.error(`请写入 ${ADMIN_FILE}，例如：`);
    console.error(`{
  "publicUrlBase": "http://192.168.120.110:30939",
  "gwRegisterToken": "与网关 REGISTER_TOKEN 相同",
  "frpToken": "与集群 frps auth.token 相同"
}`);
    process.exit(1);
  }
  admin.publicUrlBase = String(admin.publicUrlBase).replace(/\/+$/, '');
  return admin;
}

function allocPort(ledger) {
  const used = new Set(ledger.accounts.map(a => a.port));
  for (let p = ledger.portMin; p <= ledger.portMax; p++) {
    if (!used.has(p)) return p;
  }
  return null;
}

function buildConfig(user, port, admin) {
  return {
    publicUrl: `${admin.publicUrlBase}/?u=${user}`,
    gwUser: user,
    gwRegisterToken: admin.gwRegisterToken,
    gwFrpRemotePort: port,
    gwFrpHost: `cursor-remote-frps:${port}`,
  };
}

function buildFrpc(user, port, admin) {
  return `serverAddr = "${admin.frpServerAddr}"
serverPort = ${admin.frpServerPort}

auth.method = "token"
auth.token = "${admin.frpToken}"

transport.heartbeatInterval = 10
transport.heartbeatTimeout = 30

[[proxies]]
name = "cursor-remote-${user}"
type = "tcp"
localIP = "127.0.0.1"
localPort = 3939
remotePort = ${port}
`;
}

function provision(user) {
  if (!USER_RE.test(user)) {
    console.error(`代号无效：${user}`);
    console.error('请使用拼音或工号，仅允许 a-z A-Z 0-9 . _ -（最长 64），例如 xiaoming、u01234。');
    process.exit(1);
  }
  const admin = loadAdmin();
  const ledger = loadLedger();
  if (ledger.accounts.some(a => a.user === user)) {
    console.error(`代号已存在：${user}（先 npm run provision -- --list，或 --revoke ${user}）`);
    process.exit(1);
  }
  const port = allocPort(ledger);
  if (port == null) {
    console.error(`端口池已满（${ledger.portMin}–${ledger.portMax}），请 --revoke 空闲账号或扩大 portMax。`);
    process.exit(1);
  }

  ledger.accounts.push({ user, port, createdAt: new Date().toISOString() });
  ledger.accounts.sort((a, b) => a.port - b.port);
  saveLedger(ledger);

  const config = buildConfig(user, port, admin);
  const frpc = buildFrpc(user, port, admin);
  const dir = path.join(OUT_DIR, user);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(config, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'frpc.toml'), frpc);

  console.log(`已开户 ${user} → 端口 ${port}`);
  console.log(`台账：${path.relative(ROOT, ACCOUNTS_FILE)}（请 git add / commit / push，避免同事撞号）`);
  console.log(`已写入：${path.relative(ROOT, dir)}\\config.json 与 frpc.toml\n`);
  console.log('======== 发给同事：config.json ========');
  console.log(`保存为 %USERPROFILE%\\.cursor-remote-lite\\config.json\n`);
  console.log(JSON.stringify(config, null, 2));
  console.log('\n======== 发给同事：frpc.toml ========');
  console.log(`保存为 项目目录\\bridge\\frpc.toml（另向管理员要 frpc.exe）\n`);
  console.log(frpc);
}

function listAccounts() {
  const ledger = loadLedger();
  if (!ledger.accounts.length) {
    console.log('台账为空。开户：npm run provision -- <user>');
    return;
  }
  console.log(`端口池 ${ledger.portMin}–${ledger.portMax}，已用 ${ledger.accounts.length} 个：\n`);
  for (const a of ledger.accounts) {
    console.log(`${String(a.port).padStart(5)}  ${a.user.padEnd(20)}  ${a.createdAt || ''}`);
  }
}

function revoke(user) {
  if (!user) usage();
  const ledger = loadLedger();
  const before = ledger.accounts.length;
  ledger.accounts = ledger.accounts.filter(a => a.user !== user);
  if (ledger.accounts.length === before) {
    console.error(`台账中没有：${user}`);
    process.exit(1);
  }
  saveLedger(ledger);
  console.log(`已从台账移除 ${user}（端口已释放）。若对方仍在跑 frpc，请让其先 npm run stop。`);
  console.log('请 git commit / push 更新后的 bridge/accounts.json。');
}

const args = process.argv.slice(2);
if (!args.length) usage();
if (args[0] === '--list' || args[0] === 'list') listAccounts();
else if (args[0] === '--revoke' || args[0] === 'revoke') revoke(args[1]);
else if (args[0].startsWith('-')) usage();
else provision(args[0]);
