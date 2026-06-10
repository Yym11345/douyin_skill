#!/usr/bin/env bash
set -e

echo ""
echo " ╔══════════════════════════════════════╗"
echo " ║     douyin-skill  v3.5  Setup       ║"
echo " ╚══════════════════════════════════════╝"
echo ""

# ── 1. Check Node.js ──────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "[错误] 未检测到 Node.js，请先安装 Node.js 18+ 后重试："
  echo "       https://nodejs.org/"
  exit 1
fi

NODE_VER=$(node --version)
NODE_MAJOR=$(echo "$NODE_VER" | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "[错误] 需要 Node.js 18+，当前版本：$NODE_VER"
  exit 1
fi
echo "[✓] Node.js $NODE_VER"

# ── 2. npm install ────────────────────────────────────────────────────
echo ""
echo "[1/3] 安装 npm 依赖..."
npm install
echo "[✓] npm 依赖安装完成"

# ── 3. Playwright Chromium ────────────────────────────────────────────
echo ""
echo "[2/3] 安装 Playwright Chromium（~130 MB）..."
npx playwright install chromium
echo "[✓] Chromium 安装完成"

# ── 4. Google Chrome ──────────────────────────────────────────────────
echo ""
echo "[3/3] 检测 Google Chrome..."

install_chrome_mac() {
  echo "    [macOS] 正在安装 Google Chrome..."
  if command -v brew &>/dev/null; then
    echo "    使用 Homebrew 安装..."
    brew install --cask google-chrome
  else
    echo "    下载 Chrome DMG（约 90 MB）..."
    TMP_DMG=$(mktemp /tmp/chrome_XXXXXX.dmg)
    curl -L -o "$TMP_DMG" "https://dl.google.com/chrome/mac/universal/stable/CHFA/googlechrome.dmg"
    echo "    挂载并安装..."
    hdiutil attach "$TMP_DMG" -nobrowse -quiet
    cp -R "/Volumes/Google Chrome/Google Chrome.app" /Applications/
    hdiutil detach "/Volumes/Google Chrome" -quiet
    rm -f "$TMP_DMG"
  fi
}

install_chrome_linux() {
  echo "    [Linux] 正在安装 Google Chrome..."
  if command -v apt-get &>/dev/null; then
    # Debian / Ubuntu
    curl -fsSL https://dl.google.com/linux/linux_signing_key.pub \
      | gpg --dearmor \
      | sudo tee /usr/share/keyrings/google-chrome.gpg >/dev/null
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] \
http://dl.google.com/linux/chrome/deb/ stable main" \
      | sudo tee /etc/apt/sources.list.d/google-chrome.list
    sudo apt-get update -qq
    sudo apt-get install -y google-chrome-stable
  elif command -v dnf &>/dev/null; then
    # Fedora / RHEL
    sudo dnf install -y \
      "https://dl.google.com/linux/direct/google-chrome-stable_current_x86_64.rpm"
  elif command -v yum &>/dev/null; then
    sudo yum install -y \
      "https://dl.google.com/linux/direct/google-chrome-stable_current_x86_64.rpm"
  else
    echo "[!] 无法自动安装 Chrome，请手动下载："
    echo "    https://www.google.com/chrome/"
    return 1
  fi
}

CHROME_FOUND=false
OS_TYPE=$(uname -s)

if [ "$OS_TYPE" = "Darwin" ]; then
  [ -f "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ] && CHROME_FOUND=true
elif [ "$OS_TYPE" = "Linux" ]; then
  command -v google-chrome &>/dev/null && CHROME_FOUND=true
  command -v google-chrome-stable &>/dev/null && CHROME_FOUND=true
fi

if [ "$CHROME_FOUND" = true ]; then
  echo "[✓] Google Chrome 已安装，跳过"
else
  echo "[!] 未检测到 Google Chrome，正在自动安装..."
  if [ "$OS_TYPE" = "Darwin" ]; then
    install_chrome_mac && echo "[✓] Google Chrome 安装成功"
  elif [ "$OS_TYPE" = "Linux" ]; then
    install_chrome_linux && echo "[✓] Google Chrome 安装成功"
  else
    echo "[!] 未知操作系统，请手动安装 Chrome："
    echo "    https://www.google.com/chrome/"
  fi
fi

# ── Done ──────────────────────────────────────────────────────────────
echo ""
echo " ══════════════════════════════════════════════════════"
echo " 所有依赖安装完成！"
echo ""
echo " 使用方法："
echo "   node scripts/collect.mjs --account <抖音主页URL>"
echo ""
echo " 示例："
echo "   node scripts/collect.mjs --account \"https://www.douyin.com/user/MS4wLjABAAAA...\""
echo ""
echo " 首次运行会打开浏览器，用抖音 App 扫码登录即可。"
echo " ══════════════════════════════════════════════════════"
echo ""
