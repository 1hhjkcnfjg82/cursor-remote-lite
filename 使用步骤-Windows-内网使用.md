# 一、手机安装vpn

![31531a9650d06288a3ef15e172d8daeb](E:\app\apphome\xwechat_files\wxid_369po9kbs1nv22_33f9\temp\RWTemp\2026-11\31531a9650d06288a3ef15e172d8daeb.jpg)

名字：常州

下面填 153.101.29.18:12443

# 二、拉源码

拉源码

~~~~~~
~~~~~~

进去电脑源码位置

```powershell
cd d:\company\phoneCursor\cursor-remote-lite
```

以下命令启动cursor

~~~
powershell -ExecutionPolicy Bypass -File .\start-cursor.ps1
~~~

再开一个窗口（常驻，别关）：

```powershell
npm start
```

配对(每台手机一次)

```powershell
npm run pair
```

项目 haosmart-btp-dev → 配置字典 → cursor-remote-gw(每台电脑一次)

~~~~~~
{
  "lujichuan": "10.9.16.54:3939",
  "xxxxxx": "ip:3939"
}
~~~~~~

