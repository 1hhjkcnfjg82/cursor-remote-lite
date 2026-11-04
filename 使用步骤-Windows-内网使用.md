# 快速上手（Windows · 公司内网）

用手机 remotely 操作电脑上的 Cursor。手机和电脑都要连**公司 VPN**，走统一网关（不能直连电脑）。

准备：电脑已装 [Node.js 22+](https://nodejs.org/)，手机能装公司 VPN。

## 多人各用各的（同事一起用）

每人：**自己的电脑 + 自己的手机 + 自己的代号**，互不共用。

| 不要共用 | 原因 |
|---------|------|
| `config.json` 里的 `gwUser` / `?u=` | 网关按代号把手机流量转到对应电脑；撞号会串到别人机器或互相挤掉 |
| `gwFrpRemotePort`（在家回连） | 端口冲突会导致 frp 起不来、整站 502 |
| `npm run pair` 打出的配对链接 | 一次性、绑定当前这台电脑的中继 |
| 已配对手机上的凭证 | 手机只应配自己的电脑；换电脑用「重新配对」，不要把别人的链接粘进来 |

代号只能用**拼音或工号**（`a-z` `A-Z` `0-9` `.` `_` `-`），例如 `xiaoming`、`u01234`。**不要用中文**，网关会拒绝登记。

开户与端口分配请走下面「管理员：一键开户」；不要口头随便占端口。

---

## 管理员：一键开户

在**管理员**电脑、本仓库目录操作（开户前先 `git pull`，开完后把 `bridge/accounts.json` 提交并推送，避免撞号）。

**① 一次性：写管理员密钥**（不要提交 git）

`%USERPROFILE%\.cursor-remote-lite\admin.json`：

```json
{
  "publicUrlBase": "http://192.168.120.110:30939",
  "gwRegisterToken": "与网关 REGISTER_TOKEN 相同",
  "frpToken": "与集群 frps auth.token 相同"
}
```

**② 开户**

```powershell
cd d:\company\phoneCursor\cursor-remote-lite
$env:Path = "C:\Program Files\nodejs;" + $env:Path
npm run provision -- xiaoming
```

会自动占用一个空闲端口（18001–18030），更新 `bridge/accounts.json`，并在 `bridge/out/xiaoming/` 生成 `config.json` 与 `frpc.toml`（该目录已 gitignore，内含令牌，用聊天/U 盘发给同事即可）。

```powershell
npm run provision -- --list
npm run provision -- --revoke xiaoming
```

`--revoke` 只改台账、释放端口；若对方还在跑 `frpc`，先让其 `npm run stop`。

**③ 发给同事**

- `config.json` → 对方保存为 `%USERPROFILE%\.cursor-remote-lite\config.json`  
- `frpc.toml` → 对方保存为项目里 `bridge/frpc.toml`  
- 另发 `frpc.exe`（或让对方按手册自行下载）

同事仍需本机执行第 2 步克隆项目、`npm install`，以及第 4–5 步启动与配对。

---

## 1. 手机连 VPN

- 名字：常州  
- 地址：`153.101.29.18:12443`  

之后用手机打开 Remote 时，保持 VPN 开着。

---

## 2. 电脑：装好项目（只需一次）

打开**系统 PowerShell**（不要用 Cursor 里的终端）：

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
cd d:\company\phoneCursor
git clone https://github.com/1hhjkcnfjg82/cursor-remote-lite.git
cd cursor-remote-lite
npm install
```

目录可以自己换，后面命令里的路径跟着改即可。

---

## 3. 电脑：写自己的配置（只需一次）

**推荐**：向管理员要开户产物（见上文「一键开户」），把收到的文件放到：

- `%USERPROFILE%\.cursor-remote-lite\config.json`  
- 项目目录 `bridge/frpc.toml`  
- `frpc.exe` 放到 `bridge/`（仓库不带；或从 [frp Releases](https://github.com/fatedier/frp/releases) 下 Windows amd64 解压）

若需手写，新建 `%USERPROFILE%\.cursor-remote-lite\config.json`（资源管理器地址栏粘贴 `%USERPROFILE%\.cursor-remote-lite`），**代号必须是英文**，例如：

```json
{
  "publicUrl": "http://192.168.120.110:30939/?u=xiaoming",
  "gwUser": "xiaoming",
  "gwRegisterToken": "向管理员要",
  "gwFrpRemotePort": 18001,
  "gwFrpHost": "cursor-remote-frps:18001"
}
```

手写时端口必须与管理员台账一致，不要自己随便改。`npm start` 在直连失败时会自动拉起 `frpc`；不要再单独跑 `bridge/start-bridge.bat`（会和 `npm start` 抢端口）。

电脑电源建议：接通电源后，睡眠选 **从不**。

---

## 4. 每次要用时：电脑开两步

内网请用下面两步；**不要**双击 `start-windows.bat`（那是外网 Cloudflare 隧道）。

系统 PowerShell，进入项目目录后：

**① 让 Cursor 带调试端口（会重启 Cursor）**

```powershell
cd d:\company\phoneCursor\cursor-remote-lite
powershell -ExecutionPolicy Bypass -File .\start-cursor.ps1
```

**② 再开一个窗口，启动中继（这个窗口一直留着，别关）**

```powershell
cd d:\company\phoneCursor\cursor-remote-lite
$env:Path = "C:\Program Files\nodejs;" + $env:Path
npm start
```

**指定登记方式（可选）**——默认 `auto`（先试局域网，失败再 frp）。在家建议直接走 frp，避免每次重连先扫一圈连不上的本机 IP：

```powershell
npm start -- --gw=frp   # 在家：只走 frp
npm start -- --gw=lan   # 公司：只登记本机 IP，不启 frpc
npm start -- --gw=auto  # 默认自动回退
```

**停止（重要）**：Windows 上 `npm start` 再 Ctrl+C，有时杀不掉子进程 `frpc`，下次启动会双开抢端口、网关 502。请用下面任一方式：

```powershell
# 方式 A：另开一个终端
npm run stop

# 方式 B：直接跑 node（Ctrl+C 更干净）
node server.mjs --gw=frp
# 停：本窗口 Ctrl+C，看到「正在停止」后再关
```


也可写进 `config.json`：`"gwMode": "frp"`（命令行优先）。

看到下面任一类似输出就对了：

```text
已向网关登记 xiaoming → 10.x.x.x:3939
```

或在家走回连时：

```text
已启动 frpc 回连（pid=12345），在家也可走网关
已向网关登记 xiaoming → cursor-remote-frps:18001（frp 回连，跳过本机回环探测）
```

---

## 5. 手机配对（每台手机只需一次）

电脑中继保持开着，再开一个 PowerShell：

```powershell
cd d:\company\phoneCursor\cursor-remote-lite
$env:Path = "C:\Program Files\nodejs;" + $env:Path
npm run pair
```

终端会打印**整段链接**（含 `http://…` 与 `#pair=…`）。约 10 分钟有效，过期再执行一次 `npm run pair`。

下面按手机系统操作。配对前请确认：**手机 VPN 已连**，粘贴的是上面的配对链接，**不要**粘贴 `hysteria2://`、`ss://` 或一长串 Base64 的 VPN 订阅。

### 5A. Android

1. 安装 [CursorRemote.apk](https://github.com/Suchenl/cursor-remote-lite/releases/latest/download/CursorRemote.apk)（推荐），或用系统浏览器。  
2. 把整段配对链接发到手机（微信 / 邮件 / 便签均可）。  
3. **App**：打开 App → 若提示填写地址，把整段链接粘贴进去 → 点「打开」/「配对」。  
   **浏览器**：直接打开该链接完成配对。  
4. 以后日常入口见第 6 节（也可用 App 记住的地址）。

### 5B. iPhone / iPad（iOS）

内网没有单独的 iOS 安装包，用 **Safari**（不要用微信内置浏览器长时间使用，容易丢状态）。

1. 手机连上公司 VPN。  
2. 把电脑终端里的**整段配对链接**发到 iPhone（隔空投送 / 邮件 / 备忘录等）。  
3. 用 **Safari** 打开该链接，按页面提示完成配对。  
4. （推荐）配对成功后：Safari 底部分享 → **添加到主屏幕** → 添加。以后从桌面图标打开，接近全屏 App。  
5. **通知**：内网入口是 `http://`（非 HTTPS）。iOS 系统推送通常要求 HTTPS，内网环境下通知可能不可用；不影响对话与画面，可忽略。若以后有 HTTPS 入口，再在菜单里开通知，且须从桌面图标打开（iOS 16.4+）。

---

## 6. 以后日常怎么用

1. 电脑连 VPN → 跑第 4 步的 ①②（`npm start` 窗口别关）  
2. 手机连 VPN → 打开自己的入口（`xiaoming` 换成你的代号）：

```text
http://192.168.120.110:30939/?u=xiaoming
```

### Android

- **App**：若已配对，直接打开 Cursor Remote；连不上时点「重试」。换电脑时在离线页点「重新配对」，再对**新电脑**执行 `npm run pair`。  
- **浏览器**：打开上面的日常入口即可。

### iOS

- 打开桌面「Cursor Remote」图标，或用 Safari 打开上面的日常入口。  
- 若提示未配对 / 换了电脑：在电脑上重新 `npm run pair`，用 Safari 打开新链接；或在页面提供「重新配对」时点掉旧配对再粘贴新链接。

---

## 常见问题

- **代号无效 / 连不上**：先看电脑 `npm start` 有没有「已向网关登记」；手机 VPN 是否已连；入口 `?u=` 是否就是自己的 `gwUser`。  
- **打开后只有一行奇怪字符（像 `aHlzdGVy…`）**：多半把 VPN/Hysteria 订阅链当成了 App 地址。清除 App 数据后，只粘贴网关地址或 `npm run pair` 的整段链接。  
- **未连接到 Cursor**：再跑一次 `start-cursor.ps1`。  
- **换网络 / 重拨 VPN 后连不上**：重新执行一次 `npm start` 即可，不用改配置。  
- **一直登记失败（尤其在家）**：确认公司 VPN 已连；配置了 `gwFrpRemotePort`；存在 `bridge/frpc.exe` 与 `bridge/frpc.toml`。公司 Wi‑Fi 下一般不用 frp。在家可 `npm start -- --gw=frp`。公司 Wi‑Fi 若登记了但网关连不上本机，可在 `config.json` 加 `"gwRegisterIp": "你的10.x地址"`。  
- **手机断开重连很慢（在家）**：多半是 `auto` 先扫局域网超时。改用 `npm start -- --gw=frp`。  
- **手机断开后重连失败 / 刚连上又断（在家 + AnyConnect）**：本机经网关探测时，超过约 1KB 的响应会超时，而认证等小包正常——典型是 **VPN 网卡 MTU 过大**（AnyConnect 常见 1390），frp 隧道大包在路上被丢。用**管理员** PowerShell：
  ```powershell
  netsh interface ipv4 show subinterfaces
  netsh interface ipv4 set subinterface "以太网 5" mtu=1200 store=persistent
  ```
  （把 `以太网 5` 换成上面列表里 Cisco AnyConnect 那一块的名字。）改完后重连 VPN，再 `npm start -- --gw=frp`。手机侧 VPN 若也有 MTU 设置，同样可降到 1200。  
- **断开后要等一会儿才能再连上**：多半是旧 WebSocket/frp 半开连接还没清掉。确认 `bridge/frpc.toml` 里有 `transport.heartbeatInterval = 10`，然后重启 `npm start -- --gw=frp`；手机强制刷新入口页。仍慢的话把手机 VPN 的 MTU 也降到 1200。  
- **端口冲突 / frpc 报错**：`remotePort` 是否和别人重复，问管理员换一个（18001–18030）。  
- **整站 502 /「连不上电脑」且本机刚 Ctrl+C 过**：多半是旧 `frpc` 没退干净。执行 `npm run stop` 再 `npm start -- --gw=frp`；平时停服务优先用 `npm run stop`，不要只关黑窗口。  
- **iPhone 微信里打开不正常**：复制链接，到 Safari 中打开；日常用「添加到主屏幕」的图标。  
- **同事的手机能不能配我的电脑**：可以（同一台电脑 `npm run pair` 多次），但内网多人场景建议一人一机，避免误操作别人的 Cursor。  
- **换电脑 / 只想清掉旧配对**：手机离线页若有「重新配对」就点它；没有则清除 App 数据（Android）或删掉主屏幕图标后重新用 Safari 打开新配对链接（iOS）。新电脑需重新走第 2–5 步。
