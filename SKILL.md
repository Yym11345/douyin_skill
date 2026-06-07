---
name: douyin_skill
description: Use when collecting Douyin (抖音) creator account metrics — profile info, follower counts, posts (video / image_text / live_replay / live) with likes/views/comments/shares/cover/tags/music. Exports summary.json, videos.json, videos.csv, and an HTML report. Pure browser-network interception, no a_bogus signing. Use --relogin to force a fresh QR scan.
---

# Douyin Skill (v3.2)

从抖音采集创作者账号数据——粉丝数、视频列表、点赞/播放/评论/分享指标，导出 `summary.json`、`videos.json`、`videos.csv` 与一个可分享的 `report.html`。

## 安装依赖

### 方式一：全局安装（推荐，任意 Workspace 都能用 `/douyin_skill`）

Windows：
```powershell
powershell -ExecutionPolicy Bypass -Command "& { iwr https://raw.githubusercontent.com/Yym11345/douyin_skill/master/install.ps1 -OutFile $env:TEMP\install_dy.ps1; & $env:TEMP\install_dy.ps1 }"
```

macOS / Linux：
```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Yym11345/douyin_skill/master/install.sh)
```

### 方式二：作为独立项目

```bash
cd douyin_skill
npm install
npx playwright install chromium   # 首次必须，约 200MB
# Windows 还可以跑 setup.bat；macOS/Linux 跑 ./setup.sh
```

> 安装脚本会自动检测并安装 Google Chrome（Windows 用 winget 或直链，macOS 用 brew，Linux 用 apt/dnf）。脚本强制使用系统 Chrome，缺 Chrome 时会给出明确错误。

## 使用方法

```bash
node scripts/collect.mjs --account "https://www.douyin.com/user/MS4wLjABAAAA..."
```

**流程：**
1. 自动打开 Chrome 浏览器
2. 跳转到抖音首页，检测登录态（Cookie + localStorage）
3. 未登录时自动点击"登录"按钮弹出扫码框，请使用抖音 APP 扫码
4. 登录成功后跳转到目标创作者主页
5. 脚本通过网络响应拦截器实时捕获 `/aweme/v1/web/user/profile/other/` 与 `/aweme/v1/web/aweme/post/`
6. 模拟真人滚动触发分页（mouse.wheel + jitter scroll），自动去重
7. 写入 `./outputs/<创作者昵称>/`：`summary.json` / `videos.json` / `videos.csv` / `report.html`（默认用昵称做目录名；指定 `--out` 则按指定路径）
8. Cookie 保存到 `./private/profiles/douyin/`，下次直接复用免扫码

## 生成监控面板 (人员分组版)

在完成所有账号的数据采集后，可以运行监控面板生成脚本。该脚本会读取 `账号监控_人员分组.xlsx` 获取人员分组信息，并汇总 `outputs/` 目录下的所有 `summary.json` 文件，最终在 `outputs/index.html` 生成一个统一的暗色交互式监控看板：

```bash
npm run dashboard
# 或者直接运行:
node scripts/dashboard.mjs
```

**看板功能：**
1. **全局汇总指标**：实时展示总账号数、已采集率、总粉丝数、总点赞量及总视频数量。
2. **👤 负责人看板**：列表展示 12 位负责人管理的账号数、总粉丝数与总赞数，支持按赞/粉/账号数排序。**点击任一负责人卡片可实时筛选右侧账号列表**。
3. **🎬 账号监控明细**：列表展示 105 个账号的实时粉丝数、赞数、作品数与最近采集时间。支持关键词搜索、状态筛选及按指标排序，点击“查看报告”可直达对应账号的单页数据报告 (`report.html`)。
4. **URL 状态同步**：排序和人员筛选状态会自动同步至 URL 参数，刷新页面或分享链接可直接保留当前视角。

## 参数说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--account` | 抖音主页 URL 或 `sec_user_id`（必填） | — |
| `--profile` | 浏览器配置文件目录（持久化登录态） | `./private/profiles/douyin` |
| `--limit` | 最多采集视频数量 | `200` |
| `--delay` | 滚动间隔等待新响应的最大毫秒数 | `2000` |
| `--out` | 输出目录 | `./outputs/<创作者昵称>` |
| `--relogin` | 清除已保存的登录态强制重新扫码 | `false` |

> v3.2 已移除 `--cookie` / `--no-browser` / `--browser` 旗标。采集必须通过浏览器拦截器进行——这是它能稳定绕过风控的根本原因。
>
> v3.2 输出目录默认采用**创作者昵称**（经过 `sanitizeName` 处理：`\ / : * ? " < > |` 替换为空格转下划线、最长 60 字符）。若昵称为空则回退到 `sec_user_id`。

## Account 格式

支持以下三种格式：

```
# 完整 URL
https://www.douyin.com/user/MS4wLjABAAAA...

# 原始 sec_user_id（以 MS4wLjABAAAA 开头）
MS4wLjABAAAA...

# 纯数字 ID（长度 > 20 且不含 / 和 .）
7123456789012345678
```

## 浏览器登录详细步骤

1. **运行命令**
   ```bash
   node scripts/collect.mjs --account "抖音用户URL"
   ```

2. **浏览器自动打开**，访问抖音首页

3. **自动检测登录态**
   - 检查 cookies（`sessionid` / `sid_guard` / `LOGIN_STATUS=1`）
   - 检查 `localStorage.HasUserLogin === "1"`
   - 三者任一命中即认为已登录

4. **若未登录**：自动点击页面上的"登录"按钮弹出二维码

5. **扫码登录**（最长等待 10 分钟）：使用抖音 APP 扫描浏览器中的二维码

6. **自动进入采集**：检测到登录态后，导航到目标主页 → 启动滚动循环

7. **下次运行**：复用持久化配置文件，免扫码

## 输出格式

### summary.json

```json
{
  "platform": "douyin",
  "id": "MS4wLjABAAAA...",
  "url": "https://www.douyin.com/user/...",
  "name": "创作者昵称",
  "followers": 1000000,
  "videoCount": 500,
  "totalLikes": 50000000,
  "totalViews": 200000000,
  "totalComments": 1000000,
  "fetchedAt": "2026-06-05T10:00:00.000Z"
}
```

> 注意：`totalViews` 来自已采集视频的 `play_count` 之和；抖音对部分账号会返回 `play_count=0`（隐藏播放量），此时该字段为 0 属正常现象。

### videos.json / videos.csv

每条视频包含：

| 字段 | 说明 |
|------|------|
| `id` | 视频 `aweme_id` |
| `type` | 内容类型：`video`（视频）/ `image_text`（图文，aweme_type 2 或 68）/ `live_replay`（直播回放，aweme_type 61）/ `live`（直播切片，aweme_type 51） |
| `title` | 视频描述/标题 |
| `url` | 视频页面 URL |
| `publishedAt` | 发布时间（+08:00） |
| `duration` | 时长（MM:SS），仅视频有效；图文/直播为空字符串 |
| `isTop` | 是否为置顶帖（`true` / `false`） |
| `likes` | 点赞数 |
| `views` | 播放数 |
| `comments` | 评论数 |
| `shares` | 分享数 |
| `favorites` | 收藏数 |
| `coins` | 0（抖音无此字段，保留用于跨平台 schema 兼容） |
| `coverUrl` | 封面图 URL（来自 `video.cover.url_list[0]`，兜底 `origin_cover`） |
| `imageUrls` | 图文帖的图片 URL 列表（`video` 类型时为空数组） |
| `tags` | 话题/标签名数组（来自 `text_extra[].hashtag_name`） |
| `musicTitle` | 背景音乐标题 |
| `musicAuthor` | 背景音乐作者 |

> v3.2.1 起 CSV 列同步增加 `type, isTop, tags, musicTitle`，并补 UTF-8 BOM 确保 Excel 打开不乱码。

### report.html

自带样式的暗色单页报告：头像、签名、统计卡片、可排序/可搜索的视频表格。直接双击在浏览器打开即可分享给非技术用户。

## 技术实现

- **浏览器自动化**：Playwright + playwright-extra（Stealth 隐身模式防爬检测）
- **采集机制**：API Interceptor —— 通过 `page.on('response')` 监听并解析浏览器原生发出的 API 响应，**完全绕过本地 a_bogus / msToken 签名**，避免签名失效与风控拦截
- **数据滚动**：`page.mouse.wheel()` 模拟真人滚轮 + 失败回合的 jitter scroll（上滚回弹再下滚）触发懒加载
- **登录持久化**：浏览器配置文件 + LocalStorage 特征自动保存，下次免扫码登录
- **终止条件**：服务器 `has_more=false` / 达到 `--limit` / 连续 8 轮滚动无新响应

## 斜杠命令（Claude Code）

项目已注册 `/douyin_skill` 自定义命令（见 `.claude/commands/douyin_skill.md`）：

```
/douyin_skill MS4wLjABAAAA...                       # 默认 200 条
/douyin_skill MS4wLjABAAAA... --limit 50            # 限量 50 条
/douyin_skill MS4wLjABAAAA... --delay 5000 --limit 100
```

Claude 会自动 `cd` 到本项目运行 `node scripts/collect.mjs`，并在完成后总结结果。

## 常见问题

### 1. 首次运行提示缺少依赖

```
Cannot find package 'playwright-extra'
```

**解决**：
```bash
npm install
npx playwright install chromium
```

### 2. 报"Failed to capture user profile from network responses"

通常是**登录态失效**或目标账号已被限制。解决（两种方式二选一）：

```bash
# 方式一：使用 --relogin 标志（v3.2 推荐，会自动清理登录态并强制重扫码）
node scripts/collect.mjs --account "..." --relogin

# 方式二：手动删除登录态目录
rm -rf ./private/profiles/douyin
node scripts/collect.mjs --account "..."
```
重新扫码登录。

### 3. 滚动很久但视频数量不增长

抖音对低频账号或新号偶发返回 `has_more=false`。脚本会在**连续 8 轮无新数据**后自动停止，是预期行为。检查 `summary.videoCount` 与 `videos.length` 是否一致：
- 一致 → 该账号视频已采全
- 不一致 → 风控介入，建议增加 `--delay 5000` 或更换网络环境重试

### 4. 滑动验证码 / 拼图

页面出现验证码时，**人工在浏览器里完成验证**，脚本会继续。不要关闭窗口。

### 5. 多账号管理 / 切换账号

**独立 Profile 目录**（推荐）：
```bash
node scripts/collect.mjs --account "账号1URL" --profile ./private/profiles/account1
node scripts/collect.mjs --account "账号2URL" --profile ./private/profiles/account2
```

**在同一 Profile 中切换账号**（强制当前账号退出并重新扫码）：
```bash
node scripts/collect.mjs --account "新账号URL" --relogin
```

### 6. 浏览器一闪而过 / 立刻报错

确认本机已安装 Chrome（脚本配置 `channel: "chrome"`）。如果只有 Chromium：删除 `buildBrowserOptions()` 中 `channel: "chrome"` 一行，或安装 Chrome 浏览器。

## 文件说明

```
douyin_skill/
├── SKILL.md                          # 本文档
├── README.md                         # 英文项目说明
├── EXAMPLES.md                       # 使用示例
├── CHANGELOG.md                      # 版本历史
├── package.json
├── install.ps1 / install.sh          # 全局安装脚本（方式一）
├── setup.bat / setup.sh              # 本地依赖安装脚本（方式二）
├── .claude/
│   └── commands/
│       └── douyin_skill.md           # /douyin_skill 斜杠命令定义
├── private/profiles/douyin/          # 浏览器登录态（自动生成，git 忽略）
├── outputs/<昵称>/                   # 采集结果（自动生成，git 忽略）
└── scripts/
    ├── collect.mjs                   # v3.2 主入口（拦截器 + HTML 报告）
    └── adapters/
        ├── stealth.min.js            # 反检测注入脚本
        ├── douyin.mjs                # 旧版 HTTP 适配器（v2.x，已不被 collect.mjs 引用，保留供参考）
        └── douyin-sign.js            # a_bogus 签名库（v1.x，已不被使用）
```

## 依赖

- `playwright` (^1.60.0)
- `playwright-extra` (^4.3.6)
- `puppeteer-extra-plugin-stealth` (^2.11.2)
