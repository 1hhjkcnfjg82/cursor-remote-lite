# 内网自助开户（CLI）设计

日期：2026-11-04  
状态：已确认（修订：无管理员角色，每人自助）

## 问题

内网多人使用时，靠口头分配 `gwUser` 与 frp `remotePort`（18001–18030），手写 `config.json` / `frpc.toml` 易撞号、易填错；网关只接受 ASCII 代号。

## 目标

每人拿到源码后，在本机执行 `npm run provision -- <自己的代号>`：校验代号、分配空闲端口、写入共享台账、生成本机可用的配置。无单独「管理员代开户」流程。

非目标：网关 Web 后台、中文代号、K8s 自动部署、每用户独立登记令牌、iOS 推送。

## 命令

| 调用 | 行为 |
|------|------|
| `npm run provision -- <user>` | 给自己开户 |
| `npm run provision -- --list` | 列出台账 |
| `npm run provision -- --revoke <user>` | 从台账删除并释放端口 |

实现：`bridge/provision.mjs`，`package.json` → `"provision": "node bridge/provision.mjs"`。

## 代号

与网关一致：`/^[a-zA-Z0-9._-]{1,64}$/`（拼音/工号）。

## 台账

`bridge/accounts.json`（纳入版本库）。每人开户前 `git pull`，开完后 commit/push，避免撞号。

## 公司共用密钥（不进 git）

`%USERPROFILE%\.cursor-remote-lite\intranet.json`（兼容旧文件名 `admin.json`）：

- `publicUrlBase`、`gwRegisterToken`、`frpToken`
- 可选 `frpServerAddr` / `frpServerPort`

环境变量：`CR_INTRANET_*`（仍接受旧的 `CR_ADMIN_*`）。

## 开户产物

- 更新 `bridge/accounts.json`
- 写入本机 `~/.cursor-remote-lite/config.json` 与 `bridge/frpc.toml`
- 副本：`bridge/out/<user>/`（gitignore）

## 文档

`使用步骤-Windows-内网使用.md` 按「每人自助」描述；修正中文代号示例。
