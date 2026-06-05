@echo off
chcp 65001 >nul
echo.
echo  ╔══════════════════════════════════════╗
echo  ║     douyin-skill  v3.2  Setup       ║
echo  ╚══════════════════════════════════════╝
echo.

:: Check Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
  echo [错误] 未检测到 Node.js，请先安装 Node.js 18 或更高版本：
  echo        https://nodejs.org/
  pause
  exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo [✓] Node.js %NODE_VER%

:: Install npm packages
echo.
echo [1/2] 安装 npm 依赖...
npm install
if %errorlevel% neq 0 (
  echo [错误] npm install 失败，请检查网络连接。
  pause
  exit /b 1
)
echo [✓] npm 依赖安装完成

:: Install Chromium
echo.
echo [2/2] 安装 Playwright Chromium 浏览器（约 130 MB）...
npx playwright install chromium
if %errorlevel% neq 0 (
  echo [错误] Playwright 浏览器安装失败。
  pause
  exit /b 1
)
echo [✓] Chromium 安装完成

:: Check Google Chrome
echo.
echo [3/3] 检测 Google Chrome...
set CHROME_PATH=
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
  set CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
)
if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
  set CHROME_PATH=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe
)

if "%CHROME_PATH%"=="" (
  echo.
  echo  ╔══════════════════════════════════════════════════════╗
  echo  ║  [必须] 未检测到 Google Chrome                      ║
  echo  ║                                                      ║
  echo  ║  本工具需要系统 Chrome 以绕过抖音风控检测。          ║
  echo  ║  请访问以下地址下载安装，完成后重新运行即可：        ║
  echo  ║                                                      ║
  echo  ║  https://www.google.com/chrome/                     ║
  echo  ╚══════════════════════════════════════════════════════╝
  echo.
) else (
  echo [✓] Google Chrome 已安装
)

echo.
echo  ══════════════════════════════════════════
echo  安装完成！使用方法：
echo.
echo    node scripts/collect.mjs --account ^<抖音主页URL^>
echo.
echo  示例：
echo    node scripts/collect.mjs --account "https://www.douyin.com/user/MS4wLjABAAAA..."
echo.
echo  首次运行会打开浏览器，用抖音 App 扫码登录即可。
echo  ══════════════════════════════════════════
echo.
pause
