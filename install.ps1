# douyin_skill Global Install Script (Windows PowerShell)
# After running, /douyin_skill is available in the current Claude Code Workspace
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File install.ps1
#
# Optional parameters:
#   -WorkspaceDir   Claude Code Workspace directory (default: current directory)
#   -InstallDir     douyin_skill install directory (default: $HOME\douyin_skill)

param(
    [string]$WorkspaceDir = (Get-Location).Path,
    [string]$InstallDir   = "$HOME\douyin_skill",
    [switch]$InstallAntigravity = $true
)

$ErrorActionPreference = "Stop"
$RepoUrl = "https://github.com/Yym11345/douyin_skill.git"

Write-Host ""
Write-Host " =============================================" -ForegroundColor Cyan
Write-Host "       douyin_skill  Install               " -ForegroundColor Cyan
Write-Host " =============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Install Dir : $InstallDir"
Write-Host "  Workspace   : $WorkspaceDir"
Write-Host ""

# Step 1: Clone or update repo
if (Test-Path "$InstallDir\.git") {
    Write-Host "[1/4] Updating douyin_skill..." -ForegroundColor Yellow
    git -C $InstallDir pull --ff-only
} else {
    Write-Host "[1/4] Cloning douyin_skill to $InstallDir ..." -ForegroundColor Yellow
    git clone $RepoUrl $InstallDir
}
Write-Host "[OK] Code synced" -ForegroundColor Green

# Step 2: npm install
Write-Host ""
Write-Host "[2/4] Installing npm dependencies..." -ForegroundColor Yellow
Push-Location $InstallDir
npm install
Write-Host "[OK] npm dependencies installed" -ForegroundColor Green

# Step 3: Playwright Chromium
Write-Host ""
Write-Host "[3/4] Installing Playwright Chromium..." -ForegroundColor Yellow
npx playwright install chromium
Write-Host "[OK] Chromium installed" -ForegroundColor Green

# Step 3.5: Google Chrome check/install
Write-Host ""
Write-Host "[3.5] Checking Google Chrome..." -ForegroundColor Yellow
$ChromeFound = $false
$ChromePaths = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
)
foreach ($p in $ChromePaths) {
    if (Test-Path $p) { $ChromeFound = $true; break }
}

if ($ChromeFound) {
    Write-Host "[OK] Google Chrome already installed" -ForegroundColor Green
} else {
    $installed = $false
    try {
        Write-Host "  Google Chrome not found, trying winget..." -ForegroundColor Yellow
        winget install Google.Chrome --silent --accept-package-agreements --accept-source-agreements
        $installed = $true
        Write-Host "[OK] Google Chrome installed via winget" -ForegroundColor Green
    } catch {}

    if (-not $installed) {
        Write-Host ""
        Write-Host "  [REQUIRED] Please install Google Chrome manually:" -ForegroundColor Red
        Write-Host "  https://www.google.com/chrome/" -ForegroundColor Red
        Write-Host ""
    }
}

Pop-Location

# Step 4: Register AI Agent Integrations (Claude Code, Antigravity, Codex)
Write-Host ""
Write-Host "[4/4] Registering AI Agent Integrations..." -ForegroundColor Yellow

# 4.1 Claude Code Registration
$CommandsDir = Join-Path $WorkspaceDir ".claude\commands"
New-Item -ItemType Directory -Force -Path $CommandsDir | Out-Null

$InstallDirFwd = $InstallDir.Replace("\", "/")

$CommandContent = @"
---
description: 采集抖音创作者账号数据 — 粉丝数、视频/图文/直播列表（点赞/评论/分享），集中写入 outputs/Douyin_All_Data.xlsx 并自动刷新三级监控看板
argument-hint: <抖音主页URL或sec_user_id> [--limit N] [--delay ms] [--relogin] [--person 负责人]
---

# /douyin_skill

采集抖音创作者账号数据，写入集中式 Excel ``outputs/Douyin_All_Data.xlsx``，并自动刷新三级监控看板（全局 / 个人 / 组长）。

## 参数

- 第一个参数：抖音主页 URL 或 sec_user_id（必填）
- ``--person 负责人``：负责人姓名，写入 Excel 归人字段
- ``--limit N``：最多采集多少条视频（默认 200）
- ``--delay MS``：每轮滚动等待毫秒数（默认 2000）
- ``--relogin``：清除登录状态，强制重新扫码
- ``--profile DIR``：浏览器 Profile 目录（多账号时为每个账号指定独立目录）

## 执行

Skill 安装路径: $InstallDir

``````bash
node "$InstallDirFwd/scripts/collect.mjs" --account `$ARGUMENTS
``````

## 常见错误

- ``--account is required`` → 提示用户传入账号 URL
- 浏览器弹出但无数据 → 登录过期，建议加 ``--relogin`` 重跑
- ``HTTP 412/403`` → 风控，建议 ``--delay 5000``
- Excel 卡住 → 关闭正在打开 Douyin_All_Data.xlsx 的 Office 进程
- 缺少组长看板 → 引导用户创建 ``config/组织关系.txt``
"@

$CommandFile = Join-Path $CommandsDir "douyin_skill.md"
[System.IO.File]::WriteAllText($CommandFile, $CommandContent, [System.Text.Encoding]::UTF8)

Write-Host "  [OK] Claude Code command registered: $CommandFile" -ForegroundColor Green

# 4.2 Antigravity Registration
if ($InstallAntigravity) {
    $AntigravityPluginsDir = "$HOME\.gemini\config\plugins"
    if (Test-Path "$HOME\.gemini") {
        New-Item -ItemType Directory -Force -Path $AntigravityPluginsDir | Out-Null
        $AntigravitySkillDir = Join-Path $AntigravityPluginsDir "douyin_skill"
        
        # Copy the full SKILL.md so Antigravity can read complete skill instructions
        $AntigravitySkillFile = Join-Path $AntigravitySkillDir "SKILL.md"
        Copy-Item "$InstallDir\SKILL.md" $AntigravitySkillFile -Force
        Write-Host "  [OK] Antigravity skill registered at: $AntigravitySkillDir" -ForegroundColor Green
    }
}

# 4.3 Codex Notification
Write-Host "  [OK] For Codex, point it to the SKILL.md inside $InstallDir" -ForegroundColor Green

# Done
Write-Host ""
Write-Host " =============================================" -ForegroundColor Cyan
Write-Host " Installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host " For Claude Code, type:" -ForegroundColor White
Write-Host "   /douyin_skill https://www.douyin.com/user/MS4wLjABAAAA..." -ForegroundColor Yellow
Write-Host ""
Write-Host " For Antigravity, the skill 'douyin_skill' is now available globally." -ForegroundColor White
Write-Host ""
Write-Host " First run opens Chrome for QR login." -ForegroundColor White
Write-Host " =============================================" -ForegroundColor Cyan
Write-Host ""
