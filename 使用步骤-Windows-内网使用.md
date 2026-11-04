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

# 窗口 B：中继（一直别关）——会按 me.json 自动写配置并下载 frpc
cd d:\company\phoneCursor\cursor-remote-lite
npm start
```

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

1. 电脑 VPN → 再跑窗口 A、B（`npm start` 别关）  
2. 手机 VPN → 打开 `http://192.168.120.110:30939/?u=你的代号`（或已配对的 App）

---

## 说明

- 公司令牌在仓库 `bridge/intranet.defaults.json`，一般不用改。  
- `frpc.exe` 缺失时会自动下载到 `bridge/`。  
- 首次 `npm start` 若新建了代号，有空把 `bridge/accounts.json` 提交推送，避免同事撞端口。  
- 在家连不上：`npm start -- --gw=frp`。停止：`npm run stop`。

| 问题 | 处理 |
|------|------|
| 连不上 | VPN；是否已登记；`?u=` 是否自己的代号 |
| 一串怪字符 | 粘成 VPN 订阅了，清 App 数据后重贴配对链接 |
| 未连接到 Cursor | 再跑 `start-cursor.ps1` |
| 502 | `npm run stop` 后再 `npm start` |
| 换电脑 | 新电脑重做「首次」；手机「重新配对」 |
