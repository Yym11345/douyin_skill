@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo.
echo  ╔══════════════════════════════════════╗
echo  ║     douyin-skill  v3.5  Setup       ║
echo  ╚══════════════════════════════════════╝
echo.

:: ── 1. Check Node.js ──────────────────────────────────────────────────────
node --version >nul 2>&1
if %errorlevel% neq 0 (
  echo [错误] 未检测到 Node.js，请先安装 Node.js 18+ 后重试：
  echo        https://nodejs.org/
  echo.
  echo  正在尝试用 winget 自动安装 Node.js...
  winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
  if !errorlevel! neq 0 (
    echo [错误] 自动安装 Node.js 失败，请手动安装后重试。
    pause
    exit /b 1
  )
  echo [✓] Node.js 安装成功，请重新打开命令行后再次运行 setup.bat
  pause
  exit /b 0
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
:: Check version >= 18
for /f "tokens=1 delims=." %%a in ("%NODE_VER:~1%") do set NODE_MAJOR=%%a
if %NODE_MAJOR% lss 18 (
  echo [错误] 需要 Node.js 18+，当前版本：%NODE_VER%
  echo        请升级 Node.js：https://nodejs.org/
  pause
  exit /b 1
)
echo [✓] Node.js %NODE_VER%

:: ── 2. npm install ────────────────────────────────────────────────────────
echo.
echo [1/4] 安装 npm 依赖（含 better-sqlite3 预编译包）...
npm install
if %errorlevel% neq 0 (
  echo.
  echo [!] npm install 失败，正在尝试修复...
  goto :fix_sqlite
)

:: ── 3. Verify better-sqlite3 loads correctly ──────────────────────────────
echo.
echo [2/4] 验证 SQLite 驱动（better-sqlite3）...
node -e "require('better-sqlite3'); process.exit(0);" >nul 2>&1
if %errorlevel% equ 0 (
  echo [✓] better-sqlite3 加载正常
  goto :install_playwright
)

echo [!] better-sqlite3 加载失败，进入自动修复流程...
goto :fix_sqlite

:: ── FIX: Install Visual C++ Build Tools and rebuild ──────────────────────
:fix_sqlite
echo.
echo  ┌─────────────────────────────────────────────────────────────┐
echo  │  better-sqlite3 是原生模块，需要 C++ 编译工具。              │
echo  │  正在自动安装 Visual C++ Build Tools（约 2-4 GB）...         │
echo  └─────────────────────────────────────────────────────────────┘
echo.

:: Check if msbuild/cl.exe already exists (VS already installed)
where cl.exe >nul 2>&1
if %errorlevel% equ 0 (
  echo [✓] 检测到已有 C++ 编译器，直接重新编译...
  goto :rebuild_sqlite
)

:: Try winget first
winget --version >nul 2>&1
if %errorlevel% equ 0 (
  echo  使用 winget 安装 Microsoft C++ Build Tools...
  winget install Microsoft.VisualStudio.2022.BuildTools ^
    --silent ^
    --accept-package-agreements ^
    --accept-source-agreements ^
    --override "--quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
  if !errorlevel! equ 0 (
    echo [✓] C++ Build Tools 安装成功
    goto :rebuild_sqlite
  )
  echo [!] winget 安装失败，尝试 npm windows-build-tools...
)

:: Fallback: npm windows-build-tools (lighter, Python + MSVC)
echo  安装 windows-build-tools（较小，约 200 MB）...
npm install --global windows-build-tools --vs2019
if %errorlevel% equ 0 (
  echo [✓] windows-build-tools 安装成功
  goto :rebuild_sqlite
)

:: Last resort: tell user to install manually
echo.
echo  ╔══════════════════════════════════════════════════════════════╗
echo  ║  [手动修复] 请访问以下地址安装 Visual C++ Build Tools：      ║
echo  ║  https://visualstudio.microsoft.com/visual-cpp-build-tools/  ║
echo  ║                                                              ║
echo  ║  安装时勾选：C++ 桌面开发（Desktop development with C++）    ║
echo  ║  安装完成后重新运行 setup.bat                                 ║
echo  ╚══════════════════════════════════════════════════════════════╝
pause
exit /b 1

:rebuild_sqlite
echo.
echo [2/4] 从源码重新编译 better-sqlite3...
:: Set env for node-gyp to find VS
call npm rebuild better-sqlite3
if %errorlevel% neq 0 (
  echo [错误] 编译失败。请查看上方错误信息，或提交 Issue：
  echo        https://github.com/Yym11345/douyin_skill/issues
  pause
  exit /b 1
)
node -e "require('better-sqlite3'); process.exit(0);" >nul 2>&1
if %errorlevel% neq 0 (
  echo [错误] 编译后仍无法加载 better-sqlite3，请提交 Issue。
  pause
  exit /b 1
)
echo [✓] better-sqlite3 编译并加载成功

:: ── 4. Playwright Chromium ────────────────────────────────────────────────
:install_playwright
echo.
echo [3/4] 安装 Playwright Chromium（约 130 MB）...
npx playwright install chromium
if %errorlevel% neq 0 (
  echo [错误] Playwright 浏览器安装失败。
  pause
  exit /b 1
)
echo [✓] Chromium 安装完成

:: ── 5. Google Chrome ──────────────────────────────────────────────────────
echo.
echo [4/4] 检测 Google Chrome...

set CHROME_FOUND=0
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" set CHROME_FOUND=1
if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set CHROME_FOUND=1
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set CHROME_FOUND=1

if %CHROME_FOUND%==1 (
  echo [✓] Google Chrome 已安装
  goto :done
)

echo [!] 未检测到 Google Chrome，正在自动安装...
winget --version >nul 2>&1
if %errorlevel% equ 0 (
  winget install Google.Chrome --silent --accept-package-agreements --accept-source-agreements
  if !errorlevel! equ 0 (
    echo [✓] Google Chrome 安装成功
    goto :done
  )
  echo [!] winget 安装 Chrome 失败，尝试直接下载...
)

:: Fallback: direct download
set CHROME_INSTALLER=%TEMP%\chrome_installer.exe
powershell -Command "Invoke-WebRequest -Uri 'https://dl.google.com/chrome/install/latest/chrome_installer.exe' -OutFile '%CHROME_INSTALLER%' -UseBasicParsing" >nul 2>&1
if %errorlevel% neq 0 (
  echo.
  echo [错误] Chrome 下载失败，请手动安装后重试：
  echo        https://www.google.com/chrome/
  pause
  exit /b 1
)
"%CHROME_INSTALLER%" /silent /install
if %errorlevel% neq 0 (
  echo [!] 静默安装失败，已启动安装向导，请手动完成后按任意键继续...
  start "" "%CHROME_INSTALLER%"
  pause
)
del "%CHROME_INSTALLER%" >nul 2>&1
echo [✓] Google Chrome 安装完成

:done
echo.
echo  ══════════════════════════════════════════════════════════════
echo  ✅ 所有依赖安装完成！
echo.
echo  采集单个账号：
echo    node scripts\collect.mjs --account "https://www.douyin.com/user/..." --person 负责人
echo.
echo  批量采集（读取 账号监控_人员分组.xlsx）：
echo    node scripts\batch_collect.mjs
echo.
echo  刷新看板：
echo    node scripts\dashboard.mjs
echo.
echo  导出 Excel：
echo    node scripts\export.mjs
echo.
echo  首次运行会打开浏览器，用抖音 App 扫码登录即可（登录状态自动保存）。
echo  ══════════════════════════════════════════════════════════════
echo.
pause
