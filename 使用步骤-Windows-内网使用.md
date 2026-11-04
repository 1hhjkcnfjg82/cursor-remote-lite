# 快速上手（Windows · 公司内网）

手机远程用电脑上的 Cursor。手机和电脑都开**公司 VPN**（常州 / `153.101.29.18:12443`）。电脑需 [Node.js 22+](https://nodejs.org/)。

代号用英文（拼音/工号，如 `xiaoming`，不要中文）。命令在**系统 PowerShell**里执行。

---

## 首次

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
cd d:\company\phoneCursor
git clone https://github.com/1hhjkcnfjg82/cursor-remote-lite.git
cd cursor-remote-lite
npm install
copy bridge\me.json.example bridge\me.json
```

用记事本打开 `bridge\me.json`，只改这一处：

```json
{
  "user": "xiaoming"
}
```

然后开两个窗口：

```powershell
# 窗口 A：带调试端口启动 Cursor（会重启 Cursor）
cd d:\company\phoneCursor\cursor-remote-lite
powershell -ExecutionPolicy Bypass -File .\start-cursor.ps1
```

**窗口 B：中继（一直别关）**——会按 `me.json` 自动写配置，缺 `frpc.exe` 时自动下载。三种启动方式选一种：

```powershell
cd d:\company\phoneCursor\cursor-remote-lite

# 默认 auto：先试公司局域网登记，失败再走 frp 回连（一般公司 Wi‑Fi 用这个即可）
npm start

# 公司：只登记本机局域网 IP，不启动 frpc
npm start -- --gw=lan

# 在家 / 只开了 VPN、局域网扫不到本机时：只走 frp 回连（推荐在家用这个）
npm start -- --gw=frp
```

也可在 `%USERPROFILE%\.cursor-remote-lite\config.json` 里写 `"gwMode": "frp"`（或 `lan` / `auto`），效果与命令行相同；命令行优先。

看到 `已向网关登记 …` 后，再开一个窗口配对手机：

```powershell
cd d:\company\phoneCursor\cursor-remote-lite
npm run pair
```

把整段 `#pair=…` 链接发到手机（不要贴 VPN 订阅）：

- **Android**：[CursorRemote.apk](https://github.com/1hhjkcnfjg82/cursor-remote-lite/releases/latest/download/CursorRemote.apk) → 粘贴链接  
- **iPhone**：Safari 打开链接，建议「添加到主屏幕」

电脑睡眠建议选 **从不**。不要双击 `start-windows.bat`（那是外网用法）。

---

## 日常

1. 电脑 VPN → 再跑窗口 A、B（中继窗口别关；在家用 `npm start -- --gw=frp`）  
2. 手机 VPN → 打开 `http://192.168.120.110:30939/?u=你的代号`（或已配对的 App）

---

## 说明

- 公司令牌在仓库 `bridge/intranet.defaults.json`，一般不用改。  
- `frpc.exe` 缺失时会自动下载到 `bridge/`。  
- 首次若新建了代号，有空把 `bridge/accounts.json` 提交推送，避免同事撞端口。  
- 停止中继：`npm run stop`（不要只关黑窗口）。

| 问题 | 处理 |
|------|------|
| 连不上 | VPN；是否已登记；`?u=` 是否自己的代号 |
| 一串怪字符 | 粘成 VPN 订阅了，清 App 数据后重贴配对链接 |
| 未连接到 Cursor | 再跑 `start-cursor.ps1` |
| 502 | `npm run stop` 后再 `npm start` |
| 换电脑 | 新电脑重做「首次」；手机「重新配对」 |
