# douyin_skill 全局安装脚本（Windows PowerShell）
# 运行后，在任意 Claude Code Workspace 中都可使用 /douyin_skill 命令
#
# 使用方法：
#   在 Claude Code 中运行：
#   powershell -ExecutionPolicy Bypass -File install.ps1
#
# 可选参数：
#   -WorkspaceDir  指定 Claude Code Workspace 目录（默认：当前目录）
#   -InstallDir    指定 douyin_skill 安装目录（默认：$HOME\douyin_skill）
#
# 示例：
#   .\install.ps1
#   .\install.ps1 -WorkspaceDir "C:\Users\me\my_project"

param(
    [string]$WorkspaceDir = (Get-Location).Path,
    [string]$InstallDir   = "$HOME\douyin_skill"
)

$ErrorActionPreference = "Stop"
$RepoUrl = "https://github.com/Yym11345/douyin_skill.git"

Write-Host ""
Write-Host " ╔══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host " ║       douyin_skill  全局安装                        ║" -ForegroundColor Cyan
Write-Host " ╚══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "  安装目录   : $InstallDir"
Write-Host "  Workspace  : $WorkspaceDir"
Write-Host ""

# ── Step 1: Clone or update repo ──────────────────────────────────────
if (Test-Path "$InstallDir\.git") {
    Write-Host "[1/4] 更新 douyin_skill..." -ForegroundColor Yellow
    git -C $InstallDir pull --ff-only
} else {
    Write-Host "[1/4] 克隆 douyin_skill 到 $InstallDir ..." -ForegroundColor Yellow
    git clone $RepoUrl $InstallDir
}
Write-Host "[✓] 代码同步完成" -ForegroundColor Green

# ── Step 2: Install npm dependencies ──────────────────────────────────
Write-Host ""
Write-Host "[2/4] 安装 npm 依赖..." -ForegroundColor Yellow
Push-Location $InstallDir
npm install
Write-Host "[✓] npm 依赖安装完成" -ForegroundColor Green

# ── Step 3: Install Playwright Chromium ───────────────────────────────
Write-Host ""
Write-Host "[3/4] 安装 Playwright Chromium..." -ForegroundColor Yellow
npx playwright install chromium
Write-Host "[✓] Chromium 安装完成" -ForegroundColor Green

# ── Step 4: Check Google Chrome ───────────────────────────────────────
Write-Host ""
Write-Host "[3.5] 检测 Google Chrome..." -ForegroundColor Yellow
$ChromeFound = $false
$ChromePaths = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
)
foreach ($p in $ChromePaths) {
    if (Test-Path $p) { $ChromeFound = $true; break }
}

if (-not $ChromeFound) {
    $installed = $false
    try {
        Write-Host "  [!] 未检测到 Chrome，尝试通过 winget 安装..." -ForegroundColor Yellow
        winget install Google.Chrome --silent --accept-package-agreements --accept-source-agreements
        $installed = $true
    } catch {}

    if (-not $installed) {
        Write-Host ""
        Write-Host "  ┌─────────────────────────────────────────────────┐" -ForegroundColor Red
        Write-Host "  │  [必须] 请手动安装 Google Chrome 后重新运行     │" -ForegroundColor Red
        Write-Host "  │  https://www.google.com/chrome/                 │" -ForegroundColor Red
        Write-Host "  └─────────────────────────────────────────────────┘" -ForegroundColor Red
    }
} else {
    Write-Host "[✓] Google Chrome 已安装" -ForegroundColor Green
}

Pop-Location

# ── Step 5: Copy slash command to Workspace ────────────────────────────
Write-Host ""
Write-Host "[4/4] 注册 /douyin_skill 命令到 Workspace..." -ForegroundColor Yellow

$CommandsDir = Join-Path $WorkspaceDir ".claude\commands"
New-Item -ItemType Directory -Force -Path $CommandsDir | Out-Null

# Generate command file with absolute install path baked in
$InstallDirEscaped = $InstallDir.Replace("\", "\\")
$CommandContent = @"
---
description: 采集抖音创作者账号数据 — 粉丝数、视频列表（点赞/播放/评论/分享）、导出 JSON/CSV/HTML 报告
argument-hint: <抖音主页URL或sec_user_id> [--limit N] [--delay ms] [--relogin] [--profile 路径]
---

# /douyin_skill

采集抖音创作者账号的完整数据，输出 summary.json / videos.json / videos.csv / report.html。

## 参数

- 第一个参数：抖音主页 URL 或 sec_user_id（必填）
- ``--limit N``：最多采集多少条视频（默认 200）
- ``--delay MS``：每轮滚动等待毫秒数（默认 2000）
- ``--relogin``：清除登录状态，重新扫码
- ``--profile 路径``：使用独立 profile（多账号切换）

## 执行

在以下目录运行采集脚本：

**安装路径**: $InstallDir

```bash
node "$InstallDir\scripts\collect.mjs" `$ARGUMENTS
```

## 采集成功后输出

- 账号昵称 + sec_user_id
- 粉丝数、获赞数
- 已采集视频数 / 总视频数
- 输出目录路径（提示用户打开 report.html）

## 常见错误

- ``--account is required`` → 提示用户传入账号 URL
- 浏览器弹出但无数据 → 登录过期，建议加 ``--relogin``
- ``HTTP 412/403`` → 风控，建议 ``--delay 5000``
"@

$CommandFile = Join-Path $CommandsDir "douyin_skill.md"
Set-Content -Path $CommandFile -Value $CommandContent -Encoding UTF8

Write-Host "[✓] 命令已注册：$CommandFile" -ForegroundColor Green

# ── Done ──────────────────────────────────────────────────────────────
Write-Host ""
Write-Host " ══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host " 安装完成！" -ForegroundColor Green
Write-Host ""
Write-Host " 在当前 Claude Code Workspace 中直接输入：" -ForegroundColor White
Write-Host ""
Write-Host "   /douyin_skill https://www.douyin.com/user/MS4wLjABAAAA..." -ForegroundColor Yellow
Write-Host ""
Write-Host " 首次运行会打开浏览器，用抖音 App 扫码登录即可。" -ForegroundColor White
Write-Host " ══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
