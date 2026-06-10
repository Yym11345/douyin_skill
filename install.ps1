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
description: Collect Douyin creator account data - followers, video list (likes/views/comments/shares), exports JSON/CSV/HTML report
argument-hint: <douyin-url-or-sec-user-id> [--limit N] [--delay ms] [--relogin] [--profile path]
---

# /douyin_skill

Collect complete Douyin creator account data, outputs summary.json / videos.json / videos.csv / report.html.

## Arguments

- First argument: Douyin profile URL or sec_user_id (required)
- ``--limit N``: max videos to collect (default 200)
- ``--delay MS``: max ms to wait per scroll round (default 2000)
- ``--relogin``: clear saved login, force QR scan again
- ``--profile path``: use separate browser profile (for multiple accounts)

## Run

Skill installed at: $InstallDir

``````bash
node "$InstallDirFwd/scripts/collect.mjs" `$ARGUMENTS
``````

## On success, report

- Account nickname + sec_user_id
- Followers, total likes
- Videos fetched / total video count
- Output directory (prompt user to open report.html)

## Common errors

- ``--account is required`` -> ask user to provide account URL
- Browser opens but no data captured -> session expired, suggest ``--relogin``
- ``HTTP 412/403`` -> risk control, suggest ``--delay 5000``
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
        
        # Windows doesn't easily support symlinks without admin rights, so we create a proxy SKILL.md
        if (!(Test-Path $AntigravitySkillDir)) {
            New-Item -ItemType Directory -Force -Path $AntigravitySkillDir | Out-Null
        }
        
        $AntigravitySkillContent = @"
---
name: douyin_skill
description: Use when collecting Douyin (抖音) creator account metrics. Delegates execution to the actual tool located at $InstallDir.
---
# Douyin Skill (Proxy)
This skill is installed at `$InstallDir`. Please run the scripts from there.
"@
        $AntigravitySkillFile = Join-Path $AntigravitySkillDir "SKILL.md"
        [System.IO.File]::WriteAllText($AntigravitySkillFile, $AntigravitySkillContent, [System.Text.Encoding]::UTF8)
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
