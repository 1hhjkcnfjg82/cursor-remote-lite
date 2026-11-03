/**
 * Single-owner supervisor for bridge/frpc.
 *
 * Windows often leaves frpc alive after node is force-killed; the next npm start
 * then spawns a second client on the same remotePort and the gateway gets
 * ECONNREFUSED on frps. This module:
 *   1. Reaps every frpc whose command line points at our frpc.toml before start
 *   2. Owns exactly one child while the relay runs
 *   3. Restarts on unexpected exit with backoff
 *   4. Never ties frpc lifetime to gateway HTTP register success/failure
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';

export function createFrpcOwner({ bridgeDir, log = console.log, onProxyReady = null } = {}) {
  const exe = path.join(bridgeDir, process.platform === 'win32' ? 'frpc.exe' : 'frpc');
  const conf = path.join(bridgeDir, 'frpc.toml');
  const pidFile = path.join(bridgeDir, 'frpc.pid');
  const confNeedle = conf.replace(/\//g, '\\').toLowerCase();

  let child = null;
  let stopping = false;
  let restartTimer = null;
  let backoffMs = 1000;
  let proxyReady = false;
  let startedOnce = false;

  function confExists() {
    return fs.existsSync(exe) && fs.existsSync(conf);
  }

  function writePid(pid) {
    try { fs.writeFileSync(pidFile, String(pid), { mode: 0o600 }); } catch {}
  }

  function clearPidFile() {
    try { fs.rmSync(pidFile, { force: true }); } catch {}
  }

  function readPidFile() {
    try {
      const n = Number(fs.readFileSync(pidFile, 'utf8').trim());
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  }

  function listFrpcPids() {
    const out = [];
    if (process.platform === 'win32') {
      // Prefer command-line match; fall back to every frpc.exe (this PC only runs our bridge client).
      try {
        const raw = execFileSync(
          'powershell.exe',
          [
            '-NoProfile', '-Command',
            "Get-CimInstance Win32_Process -Filter \"Name='frpc.exe'\" | ForEach-Object { $c = $_.CommandLine; if ($null -eq $c) { $c = '' }; $_.ProcessId.ToString() + '|' + $c }",
          ],
          { encoding: 'utf8', windowsHide: true, timeout: 8000 },
        );
        const matched = [];
        const all = [];
        for (const line of raw.split(/\r?\n/)) {
          const i = line.indexOf('|');
          if (i < 0) continue;
          const pid = Number(line.slice(0, i));
          const cmd = line.slice(i + 1).toLowerCase();
          if (!Number.isFinite(pid) || pid <= 0) continue;
          all.push(pid);
          if (!cmd || cmd.includes(confNeedle) || cmd.includes('frpc.toml')) matched.push(pid);
        }
        out.push(...(matched.length ? matched : all));
      } catch {
        try {
          const raw = execFileSync('tasklist', ['/FI', 'IMAGENAME eq frpc.exe', '/FO', 'CSV', '/NH'], {
            encoding: 'utf8', windowsHide: true, timeout: 5000,
          });
          for (const line of raw.split(/\r?\n/)) {
            const m = /"frpc\.exe","(\d+)"/i.exec(line);
            if (m) out.push(Number(m[1]));
          }
        } catch {}
      }
      const filed = readPidFile();
      if (filed && !out.includes(filed)) out.push(filed);
      return [...new Set(out)];
    }
    try {
      const raw = execFileSync('pgrep', ['-f', conf], { encoding: 'utf8', timeout: 5000 });
      for (const line of raw.split(/\r?\n/)) {
        const pid = Number(line.trim());
        if (Number.isFinite(pid) && pid > 0) out.push(pid);
      }
    } catch {}
    const filed = readPidFile();
    if (filed && !out.includes(filed)) out.push(filed);
    return [...new Set(out)];
  }

  function killPid(pid) {
    if (!pid || pid === process.pid) return;
    try {
      if (process.platform === 'win32') {
        execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
          stdio: 'ignore', windowsHide: true, timeout: 5000,
        });
      } else {
        process.kill(pid, 'SIGTERM');
      }
    } catch {}
  }

  /** Kill every frpc bound to our config (orphans + previous owner). */
  function reap() {
    const pids = listFrpcPids();
    const mine = child?.pid;
    for (const pid of pids) {
      if (mine && pid === mine) continue;
      log(`!! 清理残留 frpc pid=${pid}`);
      killPid(pid);
    }
    if (!child) clearPidFile();
  }

  function clearRestart() {
    if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
  }

  function scheduleRestart() {
    if (stopping) return;
    clearRestart();
    const wait = backoffMs;
    backoffMs = Math.min(30000, Math.round(backoffMs * 1.8));
    log(`!! frpc 将在 ${wait}ms 后自动拉起`);
    restartTimer = setTimeout(() => {
      restartTimer = null;
      start();
    }, wait);
    restartTimer.unref?.();
  }

  function start() {
    if (stopping) return false;
    if (!confExists()) {
      log('!! 本机直连失败，需要 frp 回连：缺少 bridge/frpc 或 frpc.toml');
      return false;
    }
    if (child && !child.killed) return true;

    clearRestart();
    // Drop orphans so remotePort cannot be claimed by a zombie.
    reap();

    proxyReady = false;
    child = spawn(exe, ['-c', conf], {
      cwd: bridgeDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    writePid(child.pid);
    if (!startedOnce) {
      log(`已启动 frpc 回连（pid=${child.pid}），在家也可走网关`);
      startedOnce = true;
    } else {
      log(`已重新拉起 frpc（pid=${child.pid}）`);
    }

    const onChunk = (b) => {
      const s = String(b);
      if (/start proxy success/i.test(s)) {
        const firstReady = !proxyReady;
        proxyReady = true;
        backoffMs = 1000;
        log('[frpc]', s.trim());
        if (firstReady) {
          try { onProxyReady?.(); } catch (e) { log('!! onProxyReady', e.message || e); }
        }
      } else if (/login to server success/i.test(s)) {
        log('[frpc]', s.trim());
      } else if (/error|failed|unauthorized/i.test(s)) {
        log('[frpc]', s.trim());
      }
    };
    child.stdout.on('data', onChunk);
    child.stderr.on('data', (b) => {
      const s = String(b).trim();
      if (s) log('[frpc]', s);
    });
    child.on('exit', (code) => {
      const was = child?.pid;
      child = null;
      proxyReady = false;
      clearPidFile();
      log(`!! frpc 已退出 (pid=${was || '?'} code=${code})`);
      if (!stopping) scheduleRestart();
    });
    return true;
  }

  function stop() {
    stopping = true;
    clearRestart();
    const pid = child?.pid;
    if (child) {
      try { child.kill(); } catch {}
      child = null;
    }
    if (pid) killPid(pid);
    reap();
    clearPidFile();
    proxyReady = false;
  }

  function waitReady(ms = 5000) {
    if (proxyReady) return Promise.resolve(true);
    const t0 = Date.now();
    return new Promise((resolve) => {
      const iv = setInterval(() => {
        if (proxyReady) { clearInterval(iv); resolve(true); }
        else if (Date.now() - t0 > ms) { clearInterval(iv); resolve(false); }
      }, 150);
      iv.unref?.();
    });
  }

  return {
    start,
    stop,
    reap,
    waitReady,
    confExists,
    get alive() { return Boolean(child && !child.killed); },
    get ready() { return proxyReady; },
    get pid() { return child?.pid || null; },
  };
}
