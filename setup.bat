@echo off
chcp 65001 >nul
echo.
echo  ╔══════════════════════════════════════╗
echo  ║     douyin-skill  v3.2  Setup       ║
echo  ╚══════════════════════════════════════╝
echo.

:: ── 1. Check Node.js ──────────────────────────────────────────────────
node --version >nul 2>&1
if %errorlevel% neq 0 (
  echo [错误] 未检测到 Node.js，请先安装 Node.js 18+ 后重试：
  echo        https://nodejs.org/
  pause
  exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo [✓] Node.js %NODE_VER%

:: ── 2. npm install ────────────────────────────────────────────────────
echo.
echo [1/3] 安装 npm 依赖...
npm install
if %errorlevel% neq 0 (
  echo [错误] npm install 失败，请检查网络连接。
  pause
  exit /b 1
)
echo [✓] npm 依赖安装完成

:: ── 3. Playwright Chromium ────────────────────────────────────────────
echo.
echo [2/3] 安装 Playwright Chromium（~130 MB）...
npx playwright install chromium
if %errorlevel% neq 0 (
  echo [错误] Playwright 浏览器安装失败。
  pause
  exit /b 1
)
echo [✓] Chromium 安装完成

:: ── 4. Google Chrome ──────────────────────────────────────────────────
echo.
echo [3/3] 检测 Google Chrome...

set CHROME_FOUND=0
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" set CHROME_FOUND=1
if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set CHROME_FOUND=1

if %CHROME_FOUND%==1 (
  echo [✓] Google Chrome 已安装，跳过
  goto :done
)

echo [!] 未检测到 Google Chrome，正在自动安装...
echo.

:: Try winget first (Windows 10/11 built-in)
winget --version >nul 2>&1
if %errorlevel%==0 (
  echo     使用 winget 安装 Google Chrome...
  winget install Google.Chrome --silent --accept-package-agreements --accept-source-agreements
  if %errorlevel%==0 (
    echo [✓] Google Chrome 安装成功
    goto :done
  )
  echo [!] winget 安装失败，尝试直接下载...
)

:: Fallback: download Chrome installer directly
echo     下载 Chrome 安装包（约 90 MB）...
set CHROME_INSTALLER=%TEMP%\chrome_installer.exe
powershell -Command "Invoke-WebRequest -Uri 'https://dl.google.com/chrome/install/latest/chrome_installer.exe' -OutFile '%CHROME_INSTALLER%' -UseBasicParsing"
if %errorlevel% neq 0 (
  echo.
  echo [错误] Chrome 下载失败，请手动安装后重试：
  echo        https://www.google.com/chrome/
  pause
  exit /b 1
)
echo     安装中，请稍候...
"%CHROME_INSTALLER%" /silent /install
if %errorlevel% neq 0 (
  echo [!] 静默安装失败，已启动安装向导，请手动完成安装后按任意键继续...
  start "" "%CHROME_INSTALLER%"
  pause
)
del "%CHROME_INSTALLER%" >nul 2>&1
echo [✓] Google Chrome 安装完成

:done
echo.
echo  ══════════════════════════════════════════════════════
echo  所有依赖安装完成！
echo.
echo  使用方法：
echo    node scripts/collect.mjs --account ^<抖音主页URL^>
echo.
echo  示例：
echo    node scripts/collect.mjs --account "https://www.douyin.com/user/MS4wLjABAAAA..."
echo.
echo  首次运行会打开浏览器，用抖音 App 扫码登录即可。
echo  ══════════════════════════════════════════════════════
echo.
pause
