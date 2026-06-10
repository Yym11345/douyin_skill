#!/usr/bin/env bash
# douyin_skill 全局安装脚本（macOS / Linux）
# 运行后，在任意 Claude Code Workspace 中都可使用 /douyin_skill 命令
#
# 使用方法：
#   bash <(curl -fsSL https://raw.githubusercontent.com/Yym11345/douyin_skill/master/install.sh)
#   # 或克隆后运行：
#   chmod +x install.sh && ./install.sh
#
# 可选参数：
#   --workspace  指定 Claude Code Workspace 目录（默认：当前目录）
#   --dir        指定安装目录（默认：$HOME/douyin_skill）

set -e

REPO_URL="https://github.com/Yym11345/douyin_skill.git"
INSTALL_DIR="$HOME/douyin_skill"
WORKSPACE_DIR="$(pwd)"

# Parse args
while [[ $# -gt 0 ]]; do
    case $1 in
        --workspace) WORKSPACE_DIR="$2"; shift 2 ;;
        --dir)       INSTALL_DIR="$2";   shift 2 ;;
        *) shift ;;
    esac
done

echo ""
echo " ╔══════════════════════════════════════════════════════╗"
echo " ║       douyin_skill  全局安装                        ║"
echo " ╚══════════════════════════════════════════════════════╝"
echo ""
echo "  安装目录   : $INSTALL_DIR"
echo "  Workspace  : $WORKSPACE_DIR"
echo ""

# ── Step 1: Clone or update ────────────────────────────────────────────
echo "[1/4] 同步 douyin_skill 代码..."
if [ -d "$INSTALL_DIR/.git" ]; then
    git -C "$INSTALL_DIR" pull --ff-only
else
    git clone "$REPO_URL" "$INSTALL_DIR"
fi
echo "[✓] 代码同步完成"

# ── Step 2: npm install ────────────────────────────────────────────────
echo ""
echo "[2/4] 安装 npm 依赖..."
cd "$INSTALL_DIR"
npm install
echo "[✓] npm 依赖安装完成"

# ── Step 3: Playwright Chromium ────────────────────────────────────────
echo ""
echo "[3/4] 安装 Playwright Chromium..."
npx playwright install chromium
echo "[✓] Chromium 安装完成"

# ── Step 3.5: Google Chrome ────────────────────────────────────────────
echo ""
echo "[3.5] 检测 / 安装 Google Chrome..."
CHROME_FOUND=false
OS_TYPE=$(uname -s)

if [ "$OS_TYPE" = "Darwin" ]; then
    [ -f "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ] && CHROME_FOUND=true
elif [ "$OS_TYPE" = "Linux" ]; then
    command -v google-chrome &>/dev/null && CHROME_FOUND=true
    command -v google-chrome-stable &>/dev/null && CHROME_FOUND=true
fi

if [ "$CHROME_FOUND" = true ]; then
    echo "[✓] Google Chrome 已安装"
else
    echo "[!] 未检测到 Chrome，正在安装..."
    if [ "$OS_TYPE" = "Darwin" ]; then
        if command -v brew &>/dev/null; then
            brew install --cask google-chrome
        else
            TMP=$(mktemp /tmp/chrome_XXXXXX.dmg)
            curl -L -o "$TMP" "https://dl.google.com/chrome/mac/universal/stable/CHFA/googlechrome.dmg"
            hdiutil attach "$TMP" -nobrowse -quiet
            cp -R "/Volumes/Google Chrome/Google Chrome.app" /Applications/
            hdiutil detach "/Volumes/Google Chrome" -quiet
            rm -f "$TMP"
        fi
    elif [ "$OS_TYPE" = "Linux" ]; then
        if command -v apt-get &>/dev/null; then
            curl -fsSL https://dl.google.com/linux/linux_signing_key.pub \
                | gpg --dearmor \
                | sudo tee /usr/share/keyrings/google-chrome.gpg >/dev/null
            echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
                | sudo tee /etc/apt/sources.list.d/google-chrome.list
            sudo apt-get update -qq && sudo apt-get install -y google-chrome-stable
        elif command -v dnf &>/dev/null; then
            sudo dnf install -y "https://dl.google.com/linux/direct/google-chrome-stable_current_x86_64.rpm"
        fi
    fi
    echo "[✓] Google Chrome 安装完成"
fi

# ── Step 4: Register slash command to Workspace ────────────────────────
echo ""
echo "[4/4] 注册 /douyin_skill 命令到 Workspace..."

COMMANDS_DIR="$WORKSPACE_DIR/.claude/commands"
mkdir -p "$COMMANDS_DIR"

cat > "$COMMANDS_DIR/douyin_skill.md" << CMDEOF
---
description: 采集抖音创作者账号数据 — 粉丝数、视频/图文/直播列表（点赞/评论/分享），集中写入 outputs/Douyin_All_Data.xlsx 并自动刷新三级监控看板
argument-hint: <抖音主页URL或sec_user_id> [--limit N] [--delay ms] [--relogin] [--person 负责人]
---

# /douyin_skill

采集抖音创作者账号数据，写入集中式 Excel \`outputs/Douyin_All_Data.xlsx\`，并自动刷新三级监控看板（全局 / 个人 / 组长）。

## 参数

- 第一个参数：抖音主页 URL 或 sec_user_id（必填）
- \`--person 负责人\`：负责人姓名，写入 Excel 归人字段
- \`--limit N\`：最多采集多少条视频（默认 200）
- \`--delay MS\`：每轮滚动等待毫秒数（默认 2000）
- \`--relogin\`：清除登录状态，重新扫码

## 执行

**安装路径**: $INSTALL_DIR

\`\`\`bash
node "$INSTALL_DIR/scripts/collect.mjs" \$ARGUMENTS
\`\`\`

## 常见错误

- \`--account is required\` → 提示用户传入账号 URL
- 浏览器弹出但无数据 → 登录过期，建议加 \`--relogin\`
- \`HTTP 412/403\` → 风控，建议 \`--delay 5000\`
- Excel 卡住 → 关闭正在打开 Douyin_All_Data.xlsx 的 Office 进程
- 缺少组长看板 → 引导用户创建 \`config/组织关系.txt\`
CMDEOF

echo "[✓] Claude Code 命令已注册：$COMMANDS_DIR/douyin_skill.md"

# ── Step 5: Register to Antigravity (if present) ───────────────────────
echo ""
echo "[5/5] 注册 Antigravity 插件..."
ANTIGRAVITY_PLUGINS_DIR="$HOME/.gemini/config/plugins"
if [ -d "$HOME/.gemini" ]; then
    mkdir -p "$ANTIGRAVITY_PLUGINS_DIR/douyin_skill"
    # Create a symlink to the actual SKILL.md
    ln -sf "$INSTALL_DIR/SKILL.md" "$ANTIGRAVITY_PLUGINS_DIR/douyin_skill/SKILL.md"
    echo "[✓] Antigravity 插件已注册：$ANTIGRAVITY_PLUGINS_DIR/douyin_skill"
else
    echo "[i] 未检测到 Antigravity (.gemini) 环境，跳过"
fi

# ── Done ──────────────────────────────────────────────────────────────
echo ""
echo " ══════════════════════════════════════════════════════"
echo " 安装完成！"
echo ""
echo " 【Claude Code】在当前 Workspace 中直接输入："
echo "   /douyin_skill https://www.douyin.com/user/MS4wLjABAAAA..."
echo ""
echo " 【Antigravity】此技能现在已全局可用。"
echo " 【Codex】只需将 $INSTALL_DIR 目录指定为技能路径即可。"
echo ""
echo " 首次运行会打开浏览器，用抖音 App 扫码登录即可。"
echo " ══════════════════════════════════════════════════════"
echo ""
