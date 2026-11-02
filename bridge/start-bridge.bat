@echo off
cd /d "%~dp0"
echo Starting frpc bridge to 192.168.120.110:30700 ...
echo Make sure Cursor Remote LAN is running: npm start (port 3939)
frpc.exe -c frpc.toml
pause
