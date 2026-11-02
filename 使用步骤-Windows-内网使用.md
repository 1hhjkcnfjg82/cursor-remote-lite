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

## 2. 登记网关字典（每台电脑一次）

项目 haosmart-btp-dev → 配置字典 → `cursor-remote-gw`  
把**你的用户名**指到本机局域网 IP + 中继端口 `3939`（多人共用同一份字典，各自加一行）：

~~~~~~
{
  "lujichuan": "10.9.16.54:3939",
  "xxxxxx": "ip:3939"
}
~~~~~~

`xxxxxx` / `ip` 换成同事自己的用户名和电脑 IP。手机入口里的 `?u=` 必须和这里的 key 一致。

## 3. 写本机入口（每台电脑一次，建议在配对前完成）

在 `%USERPROFILE%\.cursor-remote-lite\config.json` 写上自己的网关入口（没有该文件就新建）：

~~~~~~
{
  "publicUrl": "http://192.168.120.110:30939/?u=lujichuan"
}
~~~~~~

把 `lujichuan` 换成你自己的用户名（与上一步字典 key 相同）。  
`npm run pair` 会用这里的地址生成配对链接；不配的话配对链接会变成电脑局域网地址，手机走网关会对不上。

## 4. 启动 Cursor（带调试端口）

```powershell
cd d:\company\phoneCursor\cursor-remote-lite
powershell -ExecutionPolicy Bypass -File .\start-cursor.ps1
```

## 5. 开中继（常驻，别关）

另开一个系统 PowerShell 窗口：

```powershell
cd d:\company\phoneCursor\cursor-remote-lite
$env:Path = "C:\Program Files\nodejs;" + $env:Path
npm start
```

## 6. 配对（每台手机一次）

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
