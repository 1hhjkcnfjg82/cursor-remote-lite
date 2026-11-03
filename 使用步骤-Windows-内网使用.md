# 快速上手（Windows · 公司内网）

用手机 remotely 操作电脑上的 Cursor。手机和电脑都要连**公司 VPN**，走统一网关（不能直连电脑）。

准备：电脑已装 [Node.js 22+](https://nodejs.org/)，手机能装公司 VPN。

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

新建文件：`%USERPROFILE%\.cursor-remote-lite\config.json`

（资源管理器地址栏粘贴 `%USERPROFILE%\.cursor-remote-lite`，没有这个文件夹就新建一个。）

内容如下，**把两处「小明」换成你自己的代号**（拼音/工号均可，和别人不要重复）：

```json
{
  "publicUrl": "http://192.168.120.110:30939/?u=小明",
  "gwUser": "小明",
  "gwRegisterToken": "向管理员要",
  "gwFrpRemotePort": 18001,
  "gwFrpHost": "cursor-remote-frps:18001"
}
```

- `gwRegisterToken` 问管理员要一串令牌，粘贴替换 `"向管理员要"`。  
- **在家也要用时**（推荐写上）：`gwFrpRemotePort` / `gwFrpHost` 向管理员要（每人一个端口，不要重复）。并把 `bridge/frpc.toml.example` 复制为 `bridge/frpc.toml`，填上 token 和同一个 `remotePort`。  
  `npm start` 在直连失败时会自动拉起 `frpc` 回连公司，手机入口不变。

电脑电源建议：接通电源后，睡眠选 **从不**。

---

## 4. 每次要用时：电脑开两步

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

看到下面任一类似输出就对了：

```text
已向网关登记 小明 → 10.x.x.x:3939
```

或在家走回连时：

```text
已启动 frpc 回连（remotePort=18001），在家也可走网关
已向网关登记 小明 → cursor-remote-frps:18001（frp 回连）
```

---

## 5. 手机配对（每台手机只需一次）

电脑中继保持开着，再开一个 PowerShell：

```powershell
cd d:\company\phoneCursor\cursor-remote-lite
$env:Path = "C:\Program Files\nodejs;" + $env:Path
npm run pair
```

把终端里打印的**整段链接**（带 `#pair=…`）发到手机，用浏览器或 Cursor Remote App 打开。约 10 分钟有效，过期再执行一次 `npm run pair`。

---

## 6. 以后日常怎么用

1. 电脑连 VPN → 跑第 4 步的 ①②（`npm start` 窗口别关）  
2. 手机连 VPN → 打开：

```text
http://192.168.120.110:30939/?u=小明
```

（`小明` 换成你的代号。）

---

## 常见问题

- **代号无效 / 连不上**：先看电脑 `npm start` 有没有「已向网关登记」；手机 VPN 是否已连。  
- **未连接到 Cursor**：再跑一次 `start-cursor.ps1`。  
- **换网络 / 重拨 VPN 后连不上**：重新执行一次 `npm start` 即可，不用改配置。  
- **一直登记失败（尤其在家）**：确认公司 VPN 已连；配置了 `gwFrpRemotePort`；存在 `bridge/frpc.exe` 与 `bridge/frpc.toml`。公司 Wi‑Fi 下一般不用 frp。  
- **端口冲突 / frpc 报错**：`remotePort` 是否和别人重复，问管理员换一个（18001–18030）。
