#!/usr/bin/env bash
set -e

echo ""
echo " ╔══════════════════════════════════════╗"
echo " ║     douyin-skill  v3.2  Setup       ║"
echo " ╚══════════════════════════════════════╝"
echo ""

# Check Node.js
if ! command -v node &>/dev/null; then
  echo "[错误] 未检测到 Node.js，请先安装 Node.js 18 或更高版本："
  echo "       https://nodejs.org/"
  exit 1
fi

NODE_VER=$(node --version)
echo "[✓] Node.js $NODE_VER"

# Check version >= 18
NODE_MAJOR=$(echo "$NODE_VER" | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "[错误] 需要 Node.js 18+，当前版本：$NODE_VER"
  exit 1
fi

# Install npm packages
echo ""
echo "[1/2] 安装 npm 依赖..."
npm install
echo "[✓] npm 依赖安装完成"

# Install Chromium
echo ""
echo "[2/2] 安装 Playwright Chromium 浏览器（约 130 MB）..."
npx playwright install chromium
echo "[✓] Chromium 安装完成"

# Check Google Chrome
echo ""
echo "[3/3] 检测 Google Chrome..."

CHROME_FOUND=false
for chrome_bin in \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/usr/bin/google-chrome" \
  "/usr/bin/google-chrome-stable" \
  "/usr/local/bin/google-chrome"; do
  if [ -f "$chrome_bin" ]; then
    CHROME_FOUND=true
    break
  fi
done

if [ "$CHROME_FOUND" = false ]; then
  echo ""
  echo " ╔══════════════════════════════════════════════════════╗"
  echo " ║  [必须] 未检测到 Google Chrome                      ║"
  echo " ║                                                      ║"
  echo " ║  本工具需要系统 Chrome 以绕过抖音风控检测。          ║"
  echo " ║  请访问以下地址下载安装，完成后重新运行即可：        ║"
  echo " ║                                                      ║"
  echo " ║  https://www.google.com/chrome/                     ║"
  echo " ╚══════════════════════════════════════════════════════╝"
  echo ""
else
  echo "[✓] Google Chrome 已安装"
fi

echo ""
echo " ══════════════════════════════════════════"
echo " 安装完成！使用方法："
echo ""
echo "   node scripts/collect.mjs --account <抖音主页URL>"
echo ""
echo " 示例："
echo "   node scripts/collect.mjs --account \"https://www.douyin.com/user/MS4wLjABAAAA...\""
echo ""
echo " 首次运行会打开浏览器，用抖音 App 扫码登录即可。"
echo " ══════════════════════════════════════════"
echo ""
