// Download frpc into bridge/ when missing so colleagues need not fetch it by hand.
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import os from 'node:os';

const FRP_VERSION = '0.61.1';

function assetName() {
  if (process.platform === 'win32') return `frp_${FRP_VERSION}_windows_amd64.zip`;
  if (process.platform === 'darwin') {
    return process.arch === 'arm64'
      ? `frp_${FRP_VERSION}_darwin_arm64.tar.gz`
      : `frp_${FRP_VERSION}_darwin_amd64.tar.gz`;
  }
  return process.arch === 'arm64'
    ? `frp_${FRP_VERSION}_linux_arm64.tar.gz`
    : `frp_${FRP_VERSION}_linux_amd64.tar.gz`;
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'cursor-remote-lite' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        download(res.headers.location, dest).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`下载 frpc 失败 HTTP ${res.statusCode}`));
        return;
      }
      const out = fs.createWriteStream(dest);
      res.pipe(out);
      out.on('finish', () => out.close(() => resolve()));
      out.on('error', reject);
    });
    req.on('error', reject);
  });
}

function extractWindowsZip(zipPath, bridgeDir, exeName) {
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'frp-'));
  try {
    execFileSync(
      'powershell.exe',
      ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${staging.replace(/'/g, "''")}' -Force`],
      { stdio: 'ignore', windowsHide: true, timeout: 120000 },
    );
    const found = findFile(staging, exeName);
    if (!found) throw new Error('压缩包里没有 frpc.exe');
    fs.copyFileSync(found, path.join(bridgeDir, exeName));
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

function extractTarGz(archive, bridgeDir, exeName) {
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'frp-'));
  try {
    execFileSync('tar', ['-xzf', archive, '-C', staging], { stdio: 'ignore', timeout: 120000 });
    const found = findFile(staging, exeName);
    if (!found) throw new Error(`压缩包里没有 ${exeName}`);
    fs.copyFileSync(found, path.join(bridgeDir, exeName));
    try { fs.chmodSync(path.join(bridgeDir, exeName), 0o755); } catch {}
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

function findFile(dir, name) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isFile() && ent.name === name) return p;
    if (ent.isDirectory()) {
      const hit = findFile(p, name);
      if (hit) return hit;
    }
  }
  return null;
}

/** Ensure bridge/frpc(.exe) exists. Returns absolute path. */
export async function ensureFrpcBinary(bridgeDir, log = console.log) {
  const exeName = process.platform === 'win32' ? 'frpc.exe' : 'frpc';
  const exe = path.join(bridgeDir, exeName);
  if (fs.existsSync(exe) && fs.statSync(exe).size > 1000) return exe;

  const asset = assetName();
  const url = `https://github.com/fatedier/frp/releases/download/v${FRP_VERSION}/${asset}`;
  log(`未找到 ${exeName}，正在下载 frp v${FRP_VERSION}…`);
  const tmp = path.join(os.tmpdir(), asset);
  try {
    await download(url, tmp);
    if (asset.endsWith('.zip')) extractWindowsZip(tmp, bridgeDir, exeName);
    else extractTarGz(tmp, bridgeDir, exeName);
  } finally {
    try { fs.rmSync(tmp, { force: true }); } catch {}
  }
  if (!fs.existsSync(exe)) throw new Error(`下载后仍缺少 ${exe}`);
  log(`已安装 ${path.relative(process.cwd(), exe)}`);
  return exe;
}

/** Sync wrapper for call sites that cannot await (best-effort via deasync-free blocking). */
export function ensureFrpcBinarySync(bridgeDir, log = console.log) {
  const exeName = process.platform === 'win32' ? 'frpc.exe' : 'frpc';
  const exe = path.join(bridgeDir, exeName);
  if (fs.existsSync(exe) && fs.statSync(exe).size > 1000) return exe;

  // Block with child process running the async download script inline is messy;
  // use PowerShell / curl + Expand-Archive synchronously on Windows.
  const asset = assetName();
  const url = `https://github.com/fatedier/frp/releases/download/v${FRP_VERSION}/${asset}`;
  log(`未找到 ${exeName}，正在下载 frp v${FRP_VERSION}…`);
  const tmp = path.join(os.tmpdir(), asset);
  try {
    execFileSync(
      process.platform === 'win32' ? 'powershell.exe' : 'curl',
      process.platform === 'win32'
        ? ['-NoProfile', '-Command', `Invoke-WebRequest -Uri '${url}' -OutFile '${tmp.replace(/'/g, "''")}'`]
        : ['-fsSL', url, '-o', tmp],
      { stdio: 'ignore', windowsHide: true, timeout: 300000 },
    );
    if (asset.endsWith('.zip')) extractWindowsZip(tmp, bridgeDir, exeName);
    else extractTarGz(tmp, bridgeDir, exeName);
  } finally {
    try { fs.rmSync(tmp, { force: true }); } catch {}
  }
  if (!fs.existsSync(exe)) throw new Error(`下载后仍缺少 ${exe}`);
  log(`已安装 ${path.relative(process.cwd(), exe)}`);
  return exe;
}
