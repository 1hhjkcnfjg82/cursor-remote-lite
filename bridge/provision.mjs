// Self-service intranet onboarding: claim a gwUser + frp port, update bridge/accounts.json,
// write your own config.json + frpc.toml.
//   npm run provision -- <user>
//   npm run provision -- --list
//   npm run provision -- --revoke <user>
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureFrpcBinarySync } from './ensure-frpc.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ACCOUNTS_FILE = path.join(__dirname, 'accounts.json');
const OUT_DIR = path.join(__dirname, 'out');
const DEFAULTS_FILE = path.join(__dirname, 'intranet.defaults.json');
const INTRANET_FILE = path.join(os.homedir(), '.cursor-remote-lite', 'intranet.json');
const LEGACY_ADMIN_FILE = path.join(os.homedir(), '.cursor-remote-lite', 'admin.json');

const USER_RE = /^[a-zA-Z0-9._-]{1,64}$/;
const DEFAULT_PORT_MIN = 18001;
const DEFAULT_PORT_MAX = 18030;
const DEFAULT_FRP_ADDR = '192.168.120.110';
const DEFAULT_FRP_PORT = 30700;

function usage(exit = 1) {
  console.log(`用法：
  npm run provision -- <user>           给自己开户（拼音/工号，如 xiaoming）
  npm run provision -- --list           查看台账里已占用的代号/端口
  npm run provision -- --revoke <user>  从台账释放代号与端口

开户前请 git pull。令牌默认读仓库里的 bridge/intranet.defaults.json
（也可本机覆盖：%USERPROFILE%\\.cursor-remote-lite\\intranet.json）。
开完后请把 bridge/accounts.json 提交并推送，避免同事撞号。`);
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

function loadIntranet() {
  const defaults = readJson(DEFAULTS_FILE, {});
  const pathUsed = fs.existsSync(INTRANET_FILE) ? INTRANET_FILE
    : fs.existsSync(LEGACY_ADMIN_FILE) ? LEGACY_ADMIN_FILE
    : null;
  const file = pathUsed ? readJson(pathUsed, {}) : {};
  const env = process.env;
  const pick = (envKeys, key) => {
    for (const k of envKeys) if (env[k]) return env[k];
    if (file[key] != null && file[key] !== '') return file[key];
    if (defaults[key] != null && defaults[key] !== '') return defaults[key];
    return '';
  };
  const cfg = {
    publicUrlBase: pick(['CR_INTRANET_PUBLIC_URL_BASE', 'CR_ADMIN_PUBLIC_URL_BASE'], 'publicUrlBase'),
    gwRegisterToken: pick(['CR_INTRANET_GW_REGISTER_TOKEN', 'CR_ADMIN_GW_REGISTER_TOKEN'], 'gwRegisterToken'),
    frpToken: pick(['CR_INTRANET_FRP_TOKEN', 'CR_ADMIN_FRP_TOKEN'], 'frpToken'),
    frpServerAddr: pick(['CR_INTRANET_FRP_SERVER_ADDR', 'CR_ADMIN_FRP_SERVER_ADDR'], 'frpServerAddr') || DEFAULT_FRP_ADDR,
    frpServerPort: Number(pick(['CR_INTRANET_FRP_SERVER_PORT', 'CR_ADMIN_FRP_SERVER_PORT'], 'frpServerPort') || DEFAULT_FRP_PORT),
  };
  const missing = [];
  if (!cfg.publicUrlBase) missing.push('publicUrlBase');
  if (!cfg.gwRegisterToken) missing.push('gwRegisterToken');
  if (!cfg.frpToken) missing.push('frpToken');
  if (missing.length) {
    console.error(`缺少内网配置：${missing.join(', ')}`);
    console.error(`请补全仓库内 bridge/intranet.defaults.json，或本机 ${INTRANET_FILE}`);
    process.exit(1);
  }
  cfg.publicUrlBase = String(cfg.publicUrlBase).replace(/\/+$/, '');
  return cfg;
}

function allocPort(ledger) {
  const used = new Set(ledger.accounts.map(a => a.port));
  for (let p = ledger.portMin; p <= ledger.portMax; p++) {
    if (!used.has(p)) return p;
  }
  return null;
}

function buildConfig(user, port, cfg) {
  return {
    publicUrl: `${cfg.publicUrlBase}/?u=${user}`,
    gwUser: user,
    gwRegisterToken: cfg.gwRegisterToken,
    gwFrpRemotePort: port,
    gwFrpHost: `cursor-remote-frps:${port}`,
  };
}

function buildFrpc(user, port, cfg) {
  return `serverAddr = "${cfg.frpServerAddr}"
serverPort = ${cfg.frpServerPort}

auth.method = "token"
auth.token = "${cfg.frpToken}"

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
  const cfg = loadIntranet();
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

  const config = buildConfig(user, port, cfg);
  const frpc = buildFrpc(user, port, cfg);
  const dir = path.join(OUT_DIR, user);
  fs.mkdirSync(dir, { recursive: true });
  const configPath = path.join(dir, 'config.json');
  const frpcPath = path.join(dir, 'frpc.toml');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  fs.writeFileSync(frpcPath, frpc);

  // Also install into the usual runtime locations for this machine.
  const homeCfg = path.join(os.homedir(), '.cursor-remote-lite', 'config.json');
  fs.mkdirSync(path.dirname(homeCfg), { recursive: true });
  fs.writeFileSync(homeCfg, JSON.stringify(config, null, 2) + '\n');
  fs.writeFileSync(path.join(__dirname, 'frpc.toml'), frpc);

  try {
    ensureFrpcBinarySync(__dirname, console.log);
  } catch (e) {
    console.log(`!! 自动下载 frpc 失败：${e.message || e}（首次 npm start 时还会再试）`);
  }

  console.log(`已开户 ${user} → 端口 ${port}`);
  console.log(`台账：${path.relative(ROOT, ACCOUNTS_FILE)}（请 git add / commit / push，避免同事撞号）`);
  console.log(`已写入本机：`);
  console.log(`  ${homeCfg}`);
  console.log(`  ${path.join(__dirname, 'frpc.toml')}`);
  console.log('\n接下来：start-cursor.ps1 → npm start → npm run pair（详见 使用步骤-Windows-内网使用.md）');
}

function listAccounts() {
  const ledger = loadLedger();
  if (!ledger.accounts.length) {
    console.log('台账为空。给自己开户：npm run provision -- <user>');
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
  console.log(`已从台账移除 ${user}（端口已释放）。若本机还在跑 frpc，请先 npm run stop。`);
  console.log('请 git commit / push 更新后的 bridge/accounts.json。');
}

const args = process.argv.slice(2);
if (!args.length) usage();
if (args[0] === '--list' || args[0] === 'list') listAccounts();
else if (args[0] === '--revoke' || args[0] === 'revoke') revoke(args[1]);
else if (args[0].startsWith('-')) usage();
else provision(args[0]);
