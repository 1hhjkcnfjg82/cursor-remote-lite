#!/usr/bin/env node
// Graceful stop for Windows/npm: kill relay on :3939 and reap every frpc for this bridge.
// Usage: npm run stop
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createFrpcOwner } from './bridge/frpc-owner.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3939);
const bridgeDir = path.join(__dirname, 'bridge');

function killPortListeners(port) {
  if (process.platform === 'win32') {
    try {
      const raw = execFileSync(
        'powershell.exe',
        [
          '-NoProfile', '-Command',
          `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique`,
        ],
        { encoding: 'utf8', windowsHide: true, timeout: 8000 },
      );
      for (const line of raw.split(/\r?\n/)) {
        const pid = Number(line.trim());
        if (!Number.isFinite(pid) || pid <= 0) continue;
        console.log(`停止占用 ${port} 的进程 pid=${pid}`);
        try {
          execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
            stdio: 'ignore', windowsHide: true, timeout: 8000,
          });
        } catch {}
      }
    } catch {}
    return;
  }
  try {
    const raw = execFileSync('lsof', ['-ti', `tcp:${port}`], { encoding: 'utf8', timeout: 5000 });
    for (const line of raw.split(/\r?\n/)) {
      const pid = Number(line.trim());
      if (!Number.isFinite(pid) || pid <= 0) continue;
      console.log(`停止占用 ${port} 的进程 pid=${pid}`);
      try { process.kill(pid, 'SIGTERM'); } catch {}
    }
  } catch {}
}

killPortListeners(PORT);

// Also stop any node server.mjs that might not be listening yet / already closing.
if (process.platform === 'win32') {
  try {
    const raw = execFileSync(
      'powershell.exe',
      [
        '-NoProfile', '-Command',
        "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'server\\.mjs' } | ForEach-Object { $_.ProcessId }",
      ],
      { encoding: 'utf8', windowsHide: true, timeout: 8000 },
    );
    for (const line of raw.split(/\r?\n/)) {
      const pid = Number(line.trim());
      if (!Number.isFinite(pid) || pid <= 0 || pid === process.pid) continue;
      console.log(`停止 server.mjs pid=${pid}`);
      try {
        execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
          stdio: 'ignore', windowsHide: true, timeout: 8000,
        });
      } catch {}
    }
  } catch {}
}

const frpc = createFrpcOwner({ bridgeDir, log: (...a) => console.log(...a) });
frpc.reap();
console.log('已停止 Cursor Remote Lite（含 frpc）');
