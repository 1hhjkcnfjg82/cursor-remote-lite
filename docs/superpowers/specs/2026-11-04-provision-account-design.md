# 管理员一键开户（CLI）设计

日期：2026-11-04  
状态：已确认

## 问题

内网多人使用时，管理员靠口头分配 `gwUser` 与 frp `remotePort`（18001–18030），同事手写 `config.json` / `frpc.toml`。易撞号、易填错；网关 `validUser` 只接受 ASCII，手册里的中文代号示例会登记失败。

## 目标

管理员在仓库目录执行一条 npm 命令即可：校验代号、分配空闲端口、写入共享台账、打印（并可选落盘）可发给同事的配置。

非目标：

- 网关 Web 管理台
- 改网关支持中文代号
- 自动改 K8s / 热更新集群密钥
- iOS 推送 / 每用户独立登记令牌

## 命令

| 调用 | 行为 |
|------|------|
| `npm run provision -- <user>` | 开户 |
| `npm run provision -- --list` | 列出台账 |
| `npm run provision -- --revoke <user>` | 从台账删除该用户并释放端口 |

实现文件：`bridge/provision.mjs`（或等价路径），`package.json` 增加 `"provision": "node bridge/provision.mjs"`。

## 代号规则

与网关一致：`/^[a-zA-Z0-9._-]{1,64}$/`。  
不符合则退出码非 0，并提示使用拼音/工号（如 `xiaoming`、`u01234`）。

## 台账（防撞）

路径：`bridge/accounts.json`（纳入版本库，管理员之间靠 git 同步）。

示例：

```json
{
  "portMin": 18001,
  "portMax": 18030,
  "accounts": [
    {
      "user": "xiaoming",
      "port": 18001,
      "createdAt": "2026-11-04T00:00:00.000Z"
    }
  ]
}
```

- 开户前：若 `user` 已存在 → 拒绝。  
- 端口：在 `[portMin, portMax]` 取未被占用的最小整数；无空闲 → 拒绝。  
- `--revoke`：只改台账，不主动断开已在线的 frpc/登记。  
- 文件不存在时：按默认端口范围创建空 `accounts` 数组。

并发：单管理员顺序执行即可；不实现文件锁（文档注明开户前先 `git pull`）。

## 管理员密钥（不进 git）

路径：`%USERPROFILE%\.cursor-remote-lite\admin.json`（也可用环境变量覆盖同名键）。

```json
{
  "publicUrlBase": "http://192.168.120.110:30939",
  "gwRegisterToken": "与网关 REGISTER_TOKEN 相同",
  "frpToken": "与集群 frps auth.token 相同",
  "frpServerAddr": "192.168.120.110",
  "frpServerPort": 30700
}
```

- `frpServerAddr` / `frpServerPort` 缺省与 `bridge/frpc.toml.example` 一致。  
- 缺少必要字段时开户失败并提示如何填写。  
- `bridge/accounts.json` **不得**写入任何 token。

环境变量（可选，优先于文件）：`CR_ADMIN_PUBLIC_URL_BASE`、`CR_ADMIN_GW_REGISTER_TOKEN`、`CR_ADMIN_FRP_TOKEN`、`CR_ADMIN_FRP_SERVER_ADDR`、`CR_ADMIN_FRP_SERVER_PORT`。

## 开户产物

成功时：

1. 更新 `bridge/accounts.json`。  
2. 终端打印完整的 `config.json` 与 `frpc.toml` 正文（可直接复制）。  
3. 同时写入 `bridge/out/<user>/config.json` 与 `bridge/out/<user>/frpc.toml`（`bridge/out/` 应 gitignore，避免把含 token 的文件提交上去）。

`config.json` 字段：

- `publicUrl`: `{publicUrlBase}/?u={user}`（注意 base 无尾斜杠时的拼接）  
- `gwUser`: `{user}`  
- `gwRegisterToken`  
- `gwFrpRemotePort`: 分配的端口  
- `gwFrpHost`: `cursor-remote-frps:{port}`

`frpc.toml`：基于 example，填入 `auth.token`、`remotePort`、`name = "cursor-remote-{user}"`，以及 admin 中的 server 地址端口。

## 文档

更新 `使用步骤-Windows-内网使用.md`：

- 文首/配置示例代号改为 `xiaoming` 等 ASCII。  
- 新增「管理员：一键开户」：准备 `admin.json` → `git pull` → `npm run provision -- <user>` → 把 `bridge/out/<user>/` 发给同事；同事放入家目录配置与 `bridge/frpc.toml`，并自备 `frpc.exe`。  
- 说明撞号以台账为准，开户前拉取最新 `accounts.json`。

## 验收

1. 无 `admin.json` 时开户失败，有明确提示。  
2. `npm run provision -- xiaoming` 成功后台账有一条，端口为当前最小空闲。  
3. 再次 `provision xiaoming` 失败；`provision other` 拿到下一端口。  
4. `--list` 展示用户与端口；`--revoke xiaoming` 后端口可再分配。  
5. 非法代号（含中文）被拒绝。  
6. `bridge/out/` 含 token 文件不被 git 跟踪（gitignore）。

## 风险

- 台账未 `git pull`/`push` 时两名管理员仍可能撞号 → 文档约定流程。  
- revoke 不踢在线会话 → 可接受；端口复用前应确认旧同事已停 `frpc`。  
- 共享 `gwRegisterToken` 不变：持有令牌者仍可覆盖任意 `u` 的登记；本特性只解决配置发放与端口/代号台账，不升级为每用户 ACL。
