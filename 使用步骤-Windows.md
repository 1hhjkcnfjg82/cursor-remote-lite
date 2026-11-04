**电脑不用带在身边，也能正常干活。** 电脑留在家里或公司开着，出门只带手机，就能接着用电脑上的 Cursor

源码：

目录：`d:\company\phoneCursor\cursor-remote-lite`  
App：https://1hhjkcnfjg82.github.io/cursor-remote-app/  
APK：https://github.com/1hhjkcnfjg82/cursor-remote-lite/releases/latest/download/CursorRemote.apk  

命令一律用**系统 PowerShell**（不要用 Cursor 终端）。若 `node` 不对，先执行：

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
```

电源：接通电源后睡眠选 **从不**。

---

## 日常使用

资源管理器里双击项目目录中的 `start-windows.bat` 即可（会重启 Cursor 并开中继；**保持弹出的窗口开着**）。

手机打开 Cursor Remote → 左上角切窗口 → 底部发消息。

若仍想手动分两步：

```powershell
cd d:\company\phoneCursor\cursor-remote-lite
powershell -ExecutionPolicy Bypass -File .\start-cursor.ps1
```

再开一个窗口（常驻，别关）：

```powershell
cd d:\company\phoneCursor\cursor-remote-lite
$env:Path = "C:\Program Files\nodejs;" + $env:Path
npm run public
```

---

## 配对（每台手机一次）

先完成上面两步，再执行：

```powershell
cd d:\company\phoneCursor\cursor-remote-lite
$env:Path = "C:\Program Files\nodejs;" + $env:Path
npm run pair
```

把终端里的**整段配对链接**粘贴到 App，点打开（约 10 分钟有效）。  
建议：App 里 **⋯ → 开启通知**。

---

## 备注

- 多账号：在电脑 Cursor 里切换即可，手机不用换号  
- `npm run devices` 查看已配对设备  
- 「未连接到 Cursor」→ 再双击 `start-windows.bat`（或单独跑 `start-cursor.ps1`）  
- 「电脑不在线」→ 检查睡眠 / 中继窗口是否还在跑  
