// Intranet self-setup from bridge/me.json (just set "user"), or CLI.
//   npm start                         → reads me.json, writes local config if needed
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
const ME_FILE = path.join(__dirname, 'me.json');
const OUT_DIR = path.join(__dirname, 'out');
const DEFAULTS_FILE = path.join(__dirname, 'intranet.defaults.json');
const INTRANET_FILE = path.join(os.homedir(), '.cursor-remote-lite', 'intranet.json');
const LEGACY_ADMIN_FILE = path.join(os.homedir(), '.cursor-remote-lite', 'admin.json');
const HOME_CONFIG = path.join(os.homedir(), '.cursor-remote-lite', 'config.json');
const FRPC_TOML = path.join(__dirname, 'frpc.toml');

const USER_RE = /^[a-zA-Z0-9._-]{1,64}$/;
const DEFAULT_PORT_MIN = 18001;
const DEFAULT_PORT_MAX = 18030;
const DEFAULT_FRP_ADDR = '192.168.120.110';
const DEFAULT_FRP_PORT = 30700;

function fail(msg, exitOnError) {
  if (exitOnError) {
    console.error(msg);
    process.exit(1);
  }
  throw new Error(msg);
}

function usage(exit = 1) {
  console.log(`用法：
  推荐：编辑 bridge/me.json 里的 user，然后 npm start（自动开户）
  npm run provision -- <user>           手动开户
  npm run provision -- --list
  npm run provision -- --revoke <user>`);
  process.exit(exit);
}

function readJson(file, fallback = null) {
  try {
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
  return {
    portMin: Number(raw.portMin) || DEFAULT_PORT_MIN,
    portMax: Number(raw.portMax) || DEFAULT_PORT_MAX,
    accounts: Array.isArray(raw.accounts) ? raw.accounts : [],
  };
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
    fail(`缺少内网配置：${missing.join(', ')}（检查 bridge/intranet.defaults.json）`, true);
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

function localReady(user) {
  const existing = readJson(HOME_CONFIG, null);
  return existing?.gwUser === user && fs.existsSync(FRPC_TOML);
}

/** Claim or reuse port, write home config + bridge/frpc.toml, ensure frpc binary. */
export function provision(user, { exitOnError = true, quietIfReady = false } = {}) {
  if (!USER_RE.test(user)) {
    fail(`代号无效：${user}（请用拼音/工号，如 xiaoming）`, exitOnError);
  }
  if (quietIfReady && localReady(user)) return { user, skipped: true };

  const cfg = loadIntranet();
  const ledger = loadLedger();
  let row = ledger.accounts.find(a => a.user === user);
  let port;
  let isNew = false;
  if (row) {
    port = row.port;
  } else {
    port = allocPort(ledger);
    if (port == null) {
      fail(`端口池已满（${ledger.portMin}–${ledger.portMax}）`, exitOnError);
    }
    row = { user, port, createdAt: new Date().toISOString() };
    ledger.accounts.push(row);
    ledger.accounts.sort((a, b) => a.port - b.port);
    saveLedger(ledger);
    isNew = true;
  }

  const config = buildConfig(user, port, cfg);
  const frpc = buildFrpc(user, port, cfg);
  const dir = path.join(OUT_DIR, user);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(config, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'frpc.toml'), frpc);
  fs.mkdirSync(path.dirname(HOME_CONFIG), { recursive: true });
  fs.writeFileSync(HOME_CONFIG, JSON.stringify(config, null, 2) + '\n');
  fs.writeFileSync(FRPC_TOML, frpc);

  try {
    ensureFrpcBinarySync(__dirname, console.log);
  } catch (e) {
    console.log(`!! 自动下载 frpc 失败：${e.message || e}（首次需要 frp 时还会再试）`);
  }

  console.log(isNew ? `已开户 ${user} → 端口 ${port}` : `已套用本机配置 ${user} → 端口 ${port}`);
  if (isNew) {
    console.log(`有空请提交并推送 ${path.relative(ROOT, ACCOUNTS_FILE)}，方便同事避让端口`);
  }
  return { user, port, isNew, skipped: false };
}

/** Used by server.mjs / npm start: if bridge/me.json exists, ensure local config. */
export function ensureFromMeFile() {
  if (!fs.existsSync(ME_FILE)) return false;
  const me = readJson(ME_FILE, {});
  const user = String(me.user || me.gwUser || '').trim();
  if (!user) {
    console.log('!! bridge/me.json 里请填写 "user"（英文代号）');
    return false;
  }
  const existing = readJson(HOME_CONFIG, null);
  if (existing?.gwUser && existing.gwUser !== user) {
    console.log(`!! bridge/me.json 是 ${user}，本机已是 ${existing.gwUser}。改 me.json 或删除 %USERPROFILE%\\.cursor-remote-lite\\config.json 后再开。`);
    return false;
  }
  provision(user, { exitOnError: false, quietIfReady: true });
  return true;
}

function listAccounts() {
  const ledger = loadLedger();
  if (!ledger.accounts.length) {
    console.log('台账为空。编辑 bridge/me.json 后 npm start，或 npm run provision -- <user>');
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
  if (ledger.accounts.length === before) fail(`台账中没有：${user}`, true);
  saveLedger(ledger);
  console.log(`已从台账移除 ${user}。请先 npm run stop，再按需推送 accounts.json。`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  if (!args.length) {
    if (fs.existsSync(ME_FILE)) {
      ensureFromMeFile();
    } else {
      usage();
    }
  } else if (args[0] === '--list' || args[0] === 'list') listAccounts();
  else if (args[0] === '--revoke' || args[0] === 'revoke') revoke(args[1]);
  else if (args[0].startsWith('-')) usage();
  else provision(args[0]);
}
