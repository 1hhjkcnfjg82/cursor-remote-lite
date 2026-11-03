# 一、手机安装vpn

![31531a9650d06288a3ef15e172d8daeb](E:\app\apphome\xwechat_files\wxid_369po9kbs1nv22_33f9\temp\RWTemp\2026-11\31531a9650d06288a3ef15e172d8daeb.jpg)

名字：常州

下面填 153.101.29.18:12443

# 二、电脑端（按顺序）

命令一律用**系统 PowerShell**（不要用 Cursor 终端）。若 `node` 不对，先执行：

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
```

电源：接通电源后睡眠选 **从不**（电脑睡了手机就连不上）。

电脑和手机都要连公司 VPN（在家也一样）。手机不能直连电脑，必须走网关。

## 1. 拉源码 & 安装依赖（每台电脑一次）

```powershell
cd d:\company\phoneCursor
git clone https://github.com/1hhjkcnfjg82/cursor-remote-lite.git
cd cursor-remote-lite
npm install
```

以后日常进入目录：

```powershell
cd d:\company\phoneCursor\cursor-remote-lite
```

## 2. 写本机入口（每台电脑一次，建议在配对前完成）

在 `%USERPROFILE%\.cursor-remote-lite\config.json` 写上（没有该文件就新建）：

~~~~~~
{
  "publicUrl": "http://192.168.120.110:30939/?u=lujichuan",
  "gwUser": "lujichuan",
  "gwRegisterToken": "向管理员要登记令牌"
}
~~~~~~

把 `lujichuan` 换成你自己的用户名（手机入口 `?u=` 必须相同）。  
`gwRegisterToken` 向管理员要（全员共用一个）。  

**不用再手改网关字典 IP。** `npm start` 会自动把当前 VPN/内网 IP 登记到网关；IP 变了重新 `npm start`（或等约 2 分钟心跳）即可。

`npm run pair` 会用 `publicUrl` 生成配对链接；不配的话配对链接会变成电脑局域网地址，手机走网关会对不上。

## 3. 启动 Cursor（带调试端口）

```powershell
cd d:\company\phoneCursor\cursor-remote-lite
powershell -ExecutionPolicy Bypass -File .\start-cursor.ps1
```

## 4. 开中继（常驻，别关）

另开一个系统 PowerShell 窗口：

```powershell
cd d:\company\phoneCursor\cursor-remote-lite
$env:Path = "C:\Program Files\nodejs;" + $env:Path
npm start
```

终端出现 `已向网关登记 lujichuan → 10.x.x.x:3939` 即登记成功。

## 5. 配对（每台手机一次）

再开一个窗口跑一次即可（不是常驻）：

```powershell
cd d:\company\phoneCursor\cursor-remote-lite
$env:Path = "C:\Program Files\nodejs;" + $env:Path
npm run pair
```

把终端里打印的**整段链接**（带 `#pair=…`）用手机打开；约 10 分钟有效、只能用一次。过期再跑一次 `npm run pair` 换新链接。

# 三、手机端

下面把 `lujichuan` 换成你自己的用户名。

1. 日常使用  
   `http://192.168.120.110:30939/?u=lujichuan`  
   → 转到你电脑上的中继（电脑要已开 `npm start`，且未睡眠）

2. 配对（每台手机一次）  
   `http://192.168.120.110:30939/?u=lujichuan#pair=……`  
   → 在 1 的基础上带上电脑 `npm run pair` 生成的 `#pair=…`  
   （约 10 分钟有效、只能用一次；过期再跑一次 `npm run pair` 换新链接）
