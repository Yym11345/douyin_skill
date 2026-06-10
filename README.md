# douyin-skill

> 抖音创作者数据采集工具 · v3.3 · 浏览器原生网络拦截，无需 API 签名

**无需破解，无需 Cookie 手动导入** — 工具通过 Playwright 控制真实浏览器，监听抖音自身前端发出的 API 请求，然后解析并导出数据。

---

## 方式一：全局安装（推荐）

安装后在**任意 Claude Code Workspace** 中都可以直接使用 `/douyin_skill` 命令。

### Windows（在 Claude Code 终端运行）

```powershell
powershell -ExecutionPolicy Bypass -Command "& { iwr https://raw.githubusercontent.com/Yym11345/douyin_skill/master/install.ps1 -OutFile $env:TEMP\install_dy.ps1; & $env:TEMP\install_dy.ps1 }"
```

### macOS / Linux（在 Claude Code 终端运行）

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Yym11345/douyin_skill/master/install.sh)
```

安装完成后，**无需切换 Workspace**，在当前 Workspace 直接输入：

```
/douyin_skill https://www.douyin.com/user/MS4wLjABAAAA...
```

---

## 方式二：作为独立项目使用

### Windows

```bat
git clone https://github.com/Yym11345/douyin_skill.git
cd douyin_skill
setup.bat
```

### macOS / Linux

```bash
git clone https://github.com/Yym11345/douyin_skill.git
cd douyin_skill
chmod +x setup.sh && ./setup.sh
```

> **注意**：方式二需要将 `douyin_skill` 目录设为 Claude Code 的 Workspace 才能使用 `/douyin_skill` 命令。

> **前提**：
> - [Node.js 18+](https://nodejs.org/)
> - [Google Chrome](https://www.google.com/chrome/)（安装脚本会自动安装）
>
> 安装脚本会自动下载 Playwright 所需的 Chromium（~130 MB），但实际采集强制使用系统 Chrome。

---

## 采集

```bash
# 粘贴抖音主页 URL 即可
node scripts/collect.mjs --account "https://www.douyin.com/user/MS4wLjABAAAA..."
```

**首次运行**会打开浏览器窗口，用抖音 App 扫码登录。登录状态会保存到本地，之后运行无需再次扫码。

---

## 选项

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--account` | 抖音主页 URL 或 sec_user_id（**必填**） | — |
| `--limit` | 最多采集多少条视频 | `200` |
| `--delay` | 每轮滚动等待响应的最长毫秒数 | `2000` |
| `--out` | 输出目录 | `./outputs/<sec_user_id>` |
| `--profile` | 浏览器 Profile 目录（保存登录状态） | `./private/profiles/douyin` |

示例：

```bash
# 采集全部视频（最多 500 条）
node scripts/collect.mjs --account "https://www.douyin.com/user/MS4wLjABAAAA..." --limit 500

# 网络较慢时加大延迟
node scripts/collect.mjs --account "https://www.douyin.com/user/MS4wLjABAAAA..." --delay 5000

# 指定输出目录
node scripts/collect.mjs --account "https://www.douyin.com/user/MS4wLjABAAAA..." --out ./data/creator_A
```

---

## 输出文件（每次采集 4 个）

```
outputs/<sec_user_id>/
├── summary.json    # 账号摘要（粉丝数、视频数、总赞数等）
├── videos.json     # 完整视频列表（JSON）
├── videos.csv      # 视频列表（CSV，UTF-8 BOM，可直接用 Excel 打开）
└── report.html     # 可视化报告（浏览器打开，支持搜索 & 排序）
```

### report.html 预览

- 账号头像、昵称、签名、主页链接
- 四格数据卡片：粉丝数 / 视频总数 / 获赞总数 / 评论总数
- 视频列表：可点击列头排序，可实时搜索标题，点击标题直跳视频页

---

## 工作原理

```
Playwright Chrome/Chromium
   │
   ├─ 打开 douyin.com，检测登录状态
   ├─ 未登录 → 自动弹出登录框 → 扫码
   │
   ├─ 导航到目标创作者主页
   │
   ├─ page.on('response') 监听两个 API：
   │    /aweme/v1/web/user/profile/other/  → 账号信息
   │    /aweme/v1/web/aweme/post/          → 视频列表（18条/页）
   │
   ├─ page.mouse.wheel() 模拟真实鼠标滚动
   │    触发页面 IntersectionObserver → 自动加载下一页
   │
   └─ has_more=false 或达到 --limit → 停止 → 导出
```

**为什么不会被风控？**
- 用的是真实浏览器（Chrome/Chromium）的 TLS 指纹和 HTTP/2 握手
- 抖音的 `msToken` / `a_bogus` 签名由浏览器自己生成，工具只是旁听
- `puppeteer-extra-plugin-stealth` 隐藏自动化特征

---

## 常见问题

### 首次运行提示「请扫码登录」

正常现象。打开的浏览器窗口里扫码，之后登录状态自动保存。

### 采集数量比主页显示的少 1~2 条

抖音部分视频（私密、删除中、审核中）不会出现在他人可见的 API 里，属于正常情况。服务端返回 `hasMore=false` 即为全部采集完毕。

### 出现滑动验证码

**不要关闭浏览器**，手动完成验证后脚本会自动继续。

### 没有安装 Google Chrome

没关系。脚本会自动回退到 Playwright 自带的 Chromium。

### 重置登录状态

```bash
# Windows
rmdir /s /q private\profiles\douyin

# macOS / Linux
rm -rf private/profiles/douyin
```

---

## 系统要求

- Node.js ≥ 18
- Windows 10/11 · macOS 12+ · Ubuntu 20.04+
- 内存 ≥ 2 GB（浏览器需要）
- 网络能访问 douyin.com

---

## 项目结构

```
douyin_skill/
├── setup.bat               # Windows 一键安装
├── setup.sh                # macOS/Linux 一键安装
├── package.json
├── scripts/
│   ├── collect.mjs         # 主程序（v3.3）
│   └── adapters/
│       └── stealth.min.js  # 反检测脚本
├── private/                # 浏览器 Profile（gitignored）
└── outputs/                # 采集结果（gitignored）
```

---

## AI 助手集成指南 (Claude Code / Codex / Antigravity)

使用全局安装脚本（方式一）时，脚本会自动尝试将本技能注册到您的 AI 助手环境中。如果您使用独立项目（方式二），也可以手动配置：

### 1. Claude Code
全局安装脚本会自动在您当前的 Workspace 目录下生成 `.claude/commands/douyin_skill.md`。安装后，直接在终端中输入 `/douyin_skill <url>` 即可调用。
> 如果没有使用全局安装脚本，请手动将克隆的 `douyin_skill` 目录设置为 Claude Code 的 Workspace 才能使用斜杠命令。

### 2. Antigravity (Gemini)
全局安装脚本会自动在您的 `~/.gemini/config/plugins/` 目录下创建 `douyin_skill` 插件链接。安装完成后，Antigravity 将能在任何对话中发现并直接调用此技能。

如果手动安装，可以执行以下命令链接：
```bash
# Windows
New-Item -ItemType Directory -Force -Path $HOME\.gemini\config\plugins\douyin_skill
Copy-Item .\SKILL.md $HOME\.gemini\config\plugins\douyin_skill\

# macOS / Linux
mkdir -p ~/.gemini/config/plugins/douyin_skill
ln -sf $(pwd)/SKILL.md ~/.gemini/config/plugins/douyin_skill/SKILL.md
```

### 3. Codex (及其他遵循通用技能协议的 Agent)
对于 Codex 等支持指定本地技能目录的助手，您只需在助手设置中将本项目的根目录指定为**自定义技能路径 (Custom Skill Path)**。Codex 会自动读取根目录下的 `SKILL.md` 并掌握如何调用该工具。

---

## 免责声明 (Disclaimer)

使用本项目前，请务必仔细阅读 [免责声明 (DISCLAIMER.md)](file:///D:/edgedownload/ai_projects/douyin_skill/DISCLAIMER.md)。  
本项目仅供学术研究、个人技术交流及合规运营分析使用，严禁用于任何商业牟利、非法数据转售、或突破平台风控安全机制的恶意攻击。用户因违规使用本工具而导致的任何法律责任、纠纷或经济损失，均由用户自行承担。

## License

Educational use only.
