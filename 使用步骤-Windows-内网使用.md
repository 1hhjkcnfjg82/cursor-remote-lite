# 快速上手（Windows · 公司内网）

手机远程操作电脑上的 Cursor。手机和电脑都要开**公司 VPN**。

准备：电脑已装 [Node.js 22+](https://nodejs.org/)，手机能连 VPN（常州 / `153.101.29.18:12443`）。

每人一个**英文代号**（拼音或工号，如 `xiaoming`，不能中文）。命令都在**系统 PowerShell**里跑。

---

## 首次（只做一次）

把下面的 `xiaoming` 换成你的代号，路径按你的目录改。

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
cd d:\company\phoneCursor
git clone https://github.com/1hhjkcnfjg82/cursor-remote-lite.git
cd cursor-remote-lite
npm install

git pull
npm run provision -- xiaoming
git add bridge/accounts.json
git commit -m "provision: xiaoming"
git push
```

`provision` 会：占一个空闲端口、写好本机配置、需要时**自动下载** `bridge/frpc.exe`。公司网关令牌已在仓库 `bridge/intranet.defaults.json`，一般不用再手写。

电脑电源：接通后睡眠建议选 **从不**。

### 启动电脑端

**窗口 A**（会重启 Cursor）：

```powershell
cd d:\company\phoneCursor\cursor-remote-lite
powershell -ExecutionPolicy Bypass -File .\start-cursor.ps1
```

**窗口 B**（中继，别关）：

```powershell
cd d:\company\phoneCursor\cursor-remote-lite
npm start
```

看到 `已向网关登记 xiaoming → …` 即可。不要双击 `start-windows.bat`（那是外网用法）。

### 手机配对（每台手机一次）

窗口 B 开着时再开一个窗口：

```powershell
cd d:\company\phoneCursor\cursor-remote-lite
npm run pair
```

把打印的**整段** `#pair=…` 链接发到手机（不要贴 VPN/Hysteria 订阅）。

- **Android**：安装 [CursorRemote.apk](https://github.com/1hhjkcnfjg82/cursor-remote-lite/releases/latest/download/CursorRemote.apk)，打开后粘贴链接。  
- **iPhone**：用 Safari 打开链接；建议「分享 → 添加到主屏幕」。内网 `http` 下系统通知多半不可用，不影响使用。

---

## 日常

1. 电脑 VPN → 再跑上面的窗口 A、B（`npm start` 别关）  
2. 手机 VPN → 打开：

```text
http://192.168.120.110:30939/?u=xiaoming
```

（换成你的代号。Android 也可直接开已配对的 App。）

---

## 附录

**在家连不上时：**

```powershell
npm start -- --gw=frp
```

**停中继：** `npm run stop`（不要只关黑窗口）。

**释放自己的代号：** `npm run provision -- --revoke xiaoming`，再 commit/push `bridge/accounts.json`。

| 问题 | 处理 |
|------|------|
| 连不上 | VPN；`npm start` 是否已登记；入口 `?u=` 是否自己的代号 |
| 屏幕一串怪字符 | 粘成 VPN 订阅了，清 App 数据后只贴配对链接 |
| 未连接到 Cursor | 再跑 `start-cursor.ps1` |
| 端口冲突 | `git pull` 后 `npm run provision -- --list` |
| 502 / 刚关过窗口 | `npm run stop` 再 `npm start` |
| 换电脑 | 新电脑重做「首次」；手机点「重新配对」或清数据后再 `npm run pair` |
