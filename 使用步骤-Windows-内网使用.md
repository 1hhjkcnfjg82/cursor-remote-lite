# 快速上手（Windows · 公司内网）

手机远程用电脑上的 Cursor。手机和电脑都要开**公司 VPN**，经统一网关访问（不能直连电脑 IP）。

**你需要：** 电脑已装 [Node.js 22+](https://nodejs.org/)；手机能连公司 VPN；向运维/内部文档要到两个令牌（网关 `REGISTER_TOKEN`、frp `auth.token`）。

**和同事的关系：** 一人一台电脑、一个手机、一个英文代号（拼音/工号，如 `xiaoming`）。不要共用代号、端口、配对链接。没有「管理员代开户」——拿到源码后按下面自己做。

---

## 两条线：先分清

| 什么时候 | 做什么 |
|---------|--------|
| **第一次**（或换电脑） | 按「一、首次配置」从头做到尾，约 10～20 分钟 |
| **以后每天** | 只看「二、日常使用」：电脑开两步 + 手机开入口 |

下面命令都在**系统 PowerShell**里跑（不要用 Cursor 内置终端）。项目目录示例：`d:\company\phoneCursor\cursor-remote-lite`，你改了路径就全局替换。

每次开 PowerShell 若提示找不到 `node`，先执行：

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
```

---

## 一、首次配置（只做一次）

按顺序做，做完一项勾一项。

### 1. 手机装好 VPN

- 名字：常州  
- 地址：`153.101.29.18:12443`  

后面配对、日常打开 App 时都要保持 VPN 开启。

### 2. 电脑克隆项目

```powershell
cd d:\company\phoneCursor
git clone https://github.com/1hhjkcnfjg82/cursor-remote-lite.git
cd cursor-remote-lite
npm install
```

### 3. 写入公司共用令牌

本机新建文件（**不要提交到 git**）：

`%USERPROFILE%\.cursor-remote-lite\intranet.json`

（资源管理器地址栏粘贴 `%USERPROFILE%\.cursor-remote-lite`，没有文件夹就新建。）

```json
{
  "publicUrlBase": "http://192.168.120.110:30939",
  "gwRegisterToken": "填入网关 REGISTER_TOKEN",
  "frpToken": "填入集群 frps 的 auth.token"
}
```

### 4. 给自己占代号和端口

代号只能用 `a-z` `A-Z` `0-9` `.` `_` `-`，**不能用中文**。把下面的 `xiaoming` 换成你的。

```powershell
cd d:\company\phoneCursor\cursor-remote-lite
git pull
npm run provision -- --list
npm run provision -- xiaoming
git add bridge/accounts.json
git commit -m "provision: xiaoming"
git push
```

这一步会自动生成：

- `%USERPROFILE%\.cursor-remote-lite\config.json`  
- 项目里的 `bridge/frpc.toml`  

`git push` 台账是为了不和同事抢同一端口；开户前务必先 `git pull`。

### 5. 放入 frpc.exe

把 `frpc.exe` 放到项目的 `bridge\` 目录（仓库里没有这个文件）。

来源：[frp Releases](https://github.com/fatedier/frp/releases) 下载 Windows amd64 包解压，或向已配好的同事要一份。

### 6. 电脑电源

接通电源后，睡眠建议选 **从不**（睡眠后手机连不上）。

### 7. 第一次启动电脑端

**窗口 A**（会重启 Cursor）：

```powershell
cd d:\company\phoneCursor\cursor-remote-lite
powershell -ExecutionPolicy Bypass -File .\start-cursor.ps1
```

**窗口 B**（中继，一直别关）：

```powershell
cd d:\company\phoneCursor\cursor-remote-lite
npm start
```

看到类似 `已向网关登记 xiaoming → …` 就对了。

内网**不要**双击 `start-windows.bat`（那是外网 Cloudflare 用法）。

### 8. 手机配对（每台手机一次）

中继窗口 B 仍开着时，再开 **窗口 C**：

```powershell
cd d:\company\phoneCursor\cursor-remote-lite
npm run pair
```

把终端打印的**整段链接**（带 `#pair=…`）发到手机。约 10 分钟有效。

**不要**粘贴 `hysteria2://`、`ss://` 或 VPN 订阅 Base64——那是翻墙配置，不是本软件。

**Android**

1. 安装本仓库 Release 里的 APK：  
   [CursorRemote.apk](https://github.com/1hhjkcnfjg82/cursor-remote-lite/releases/latest/download/CursorRemote.apk)  
   （也可用系统浏览器打开该链接。若 404，说明还没上传 Release，先在 GitHub → Releases 上传 `CursorRemote.apk`。）  
2. 打开 App，粘贴整段配对链接并确认。  

**iPhone / iPad**

1. 用 **Safari** 打开整段配对链接（别长期泡在微信内置浏览器里）。  
2. 配对成功后：分享 → **添加到主屏幕**（推荐）。  
3. 内网是 `http://`，iOS 系统通知多半不可用，不影响聊天和看画面。

至此首次配置结束。以后只看下一节。

---

## 二、日常使用

1. **电脑**连 VPN → 再跑上面的窗口 A（`start-cursor.ps1`）和窗口 B（`npm start`，别关）。  
2. **手机**连 VPN → 打开入口（把 `xiaoming` 换成你的代号）：

```text
http://192.168.120.110:30939/?u=xiaoming
```

- Android：直接开 Cursor Remote App（已配对过）。  
- iOS：开桌面图标，或用 Safari 打开上面的地址。

---

## 三、附录（用到再看）

### 在家连不上 / 想指定登记方式

```powershell
npm start -- --gw=frp   # 在家推荐：只走 frp
npm start -- --gw=lan   # 公司：只登记局域网，不启 frpc
npm start -- --gw=auto  # 默认
```

也可在 `config.json` 里加 `"gwMode": "frp"`。

### 正确停止中继

不要只关黑窗口。任选：

```powershell
npm run stop
```

或用 `node server.mjs --gw=frp` 启动，本窗口 Ctrl+C，等到「正在停止」。

### 释放自己的代号（很少用）

```powershell
npm run provision -- --revoke xiaoming
git add bridge/accounts.json
git commit -m "revoke: xiaoming"
git push
```

释放前先 `npm run stop`。

### 常见问题

| 现象 | 怎么处理 |
|------|----------|
| 连不上 / 代号无效 | 看 `npm start` 有没有「已向网关登记」；手机 VPN；入口 `?u=` 是否等于自己的代号 |
| 屏幕上只有一串怪字符 | 粘错成 VPN 订阅了。清 App 数据，只贴配对链接或网关 `http://…/?u=…` |
| 未连接到 Cursor | 再跑一次 `start-cursor.ps1` |
| 重拨 VPN 后挂了 | 再执行一次 `npm start` |
| 在家登记失败 | VPN；`frpc.exe` + `frpc.toml`；试用 `npm start -- --gw=frp` |
| 在家重连很慢 | 用 `--gw=frp`，不要用默认 `auto` 空扫局域网 |
| 能连上又马上断（AnyConnect） | 管理员权限把 VPN 网卡 MTU 降到 1200，见下方 |
| 整站 502 / 刚 Ctrl+C 过 | `npm run stop` 再启动；多半是旧 `frpc` 没杀掉 |
| 端口冲突 | `git pull` 后 `npm run provision -- --list` 核对 |
| iPhone 微信里怪 | 复制到 Safari；日常用主屏幕图标 |
| 换电脑 | 新电脑重做「一、首次配置」；手机离线页点「重新配对」或清数据后再 `npm run pair` |

**AnyConnect MTU（在家断流时）：**

```powershell
netsh interface ipv4 show subinterfaces
netsh interface ipv4 set subinterface "以太网 5" mtu=1200 store=persistent
```

把 `以太网 5` 换成列表里 Cisco AnyConnect 那一项的名字，然后重连 VPN，再 `npm start -- --gw=frp`。
