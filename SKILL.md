---
name: douyin_skill
description: Use when collecting Douyin (抖音) creator account metrics — profile info, follower counts, video list with likes/views/comments/shares, JSON/CSV export. Supports browser login (scan QR code) or manual cookie input.
---

# Douyin Skill

从抖音采集创作者账号数据——粉丝数、视频列表、点赞/播放/评论/分享指标，导出 `summary.json`、`videos.json`、`videos.csv`。

## 安装依赖

```bash
cd douyin_skill
npm install
```

首次运行后，Playwright 会自动下载 Chromium 浏览器（约 200MB）。

## 使用方法

### 方法 1: 浏览器扫码登录（推荐）

```bash
node scripts/collect.mjs --account "https://www.douyin.com/user/MS4wLjABAAAA..."
```

**流程：**
1. 自动打开 Chrome 浏览器
2. 跳转到抖音登录页
3. 使用抖音 APP 扫码登录（或手机号登录）
4. 登录成功后，脚本自动检测 Cookie 并开始采集
5. Cookie 保存到 `./private/profiles/douyin/`，下次运行自动复用

**优点：**
- 无需手动复制 Cookie
- 登录状态持久化，下次直接采集
- 通过率高，不易被风控

### 方法 2: 手动 Cookie（不推荐）

```bash
node scripts/collect.mjs \
  --account "https://www.douyin.com/user/MS4wLjABAAAA..." \
  --cookie "msToken=xxx; ttwid=xxx; sessionid=xxx; ..." \
  --no-browser
```

## 参数说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--account` | 抖音主页 URL 或 sec_user_id（必填） | — |
| `--browser` | 启用浏览器登录模式 | `true` |
| `--no-browser` | 禁用浏览器，使用手动 Cookie | `false` |
| `--cookie` | 浏览器 Cookie 字符串（手动模式） | 空 |
| `--profile` | 浏览器配置文件目录 | `./private/profiles/douyin` |
| `--limit` | 最多采集视频数量 | 200 |
| `--delay` | 请求间隔（毫秒） | 5000 |
| `--out` | 输出目录 | `./outputs/<sec_user_id>` |

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

2. **浏览器自动打开**
   - 跳转到抖音页面
   - 如果未登录，显示扫码页面

3. **扫码登录**
   - 打开抖音 APP
   - 扫描浏览器中的二维码
   - 或使用手机号验证码登录

4. **自动检测登录**
   - 脚本检测到 Cookie（sessionid, msToken）
   - 提示 "Login detected! Cookies saved to profile."

5. **开始采集**
   - 自动使用登录状态采集数据
   - Cookie 保存到本地配置文件

6. **下次运行**
   - 直接复用保存的登录状态
   - 无需重复扫码

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

### videos.json / videos.csv

每条视频包含：

| 字段 | 说明 |
|------|------|
| `id` | 视频 aweme_id |
| `title` | 视频描述/标题 |
| `url` | 视频页面 URL |
| `publishedAt` | 发布时间（+08:00） |
| `duration` | 时长（MM:SS） |
| `likes` | 点赞数 |
| `views` | 播放数 |
| `comments` | 评论数 |
| `shares` | 分享数 |
| `favorites` | 收藏数 |
| `coins` | 0（抖音无此字段） |

## 技术实现

- **浏览器自动化**: Playwright + playwright-extra（隐身模式）
- **签名算法**: `a_bogus` 参数通过 `douyin-sign.js` 生成（RC4 + SM3 国密哈希）
- **接口**:
  - 用户信息: `/aweme/v1/web/user/profile/other/`
  - 视频列表: `/aweme/v1/web/aweme/post/`（分页，每页 18 条）
- **失败重试**: 指数退避，最多 5 次
- **UA 轮换**: 10 个 Chrome/Firefox/Safari UA 随机选取
- **Cookie 持久化**: 浏览器配置文件自动保存，下次复用

## 常见问题

### 1. 首次运行提示缺少依赖

```
Error: Stealth mode requires playwright-extra and puppeteer-extra-plugin-stealth
```

**解决**: 运行 `npm install` 安装依赖

### 2. 浏览器无法打开

```
Error: Browser auth requires Playwright
```

**解决**: 
```bash
npm install
npx playwright install chromium
```

### 3. 扫码后没有反应

- 等待最多 10 分钟自动检测登录
- 检查浏览器是否真的登录成功（刷新页面看是否需要重新登录）
- 如果一直卡住，关闭浏览器重试

### 4. HTTP 412 / 403（风控拦截）

即使浏览器登录，抖音也可能风控。解决方案：
- 增加 `--delay 10000`（10秒间隔）
- 减少 `--limit 50`（少采集一些）
- 等待几分钟后重试

### 5. 登录状态失效

Cookie 过期后，脚本会提示重新登录：
```bash
# 清除旧登录，重新扫码
rm -rf ./private/profiles/douyin
node scripts/collect.mjs --account "..."
```

### 6. 不想用浏览器，只想用 Cookie

```bash
node scripts/collect.mjs \
  --account "..." \
  --cookie "你的Cookie" \
  --no-browser
```

获取 Cookie 方法见 `EXAMPLES.md`。

## 优势对比

| 方式 | 优点 | 缺点 |
|------|------|------|
| 浏览器登录 | Cookie 自动管理<br>通过率高<br>无需手动复制 | 需要安装依赖<br>首次扫码 |
| 手动 Cookie | 不需要依赖<br>快速测试 | Cookie 容易过期<br>风控拦截率高<br>需要手动更新 |

## 文件说明

```
douyin_skill/
├── SKILL.md                          # 本文档
├── EXAMPLES.md                       # 使用示例
├── package.json                      # 依赖配置
├── private/
│   └── profiles/
│       └── douyin/                   # 浏览器登录状态（自动生成）
├── outputs/                          # 采集结果（自动生成）
└── scripts/
    ├── collect.mjs                   # CLI 入口（含浏览器登录）
    └── adapters/
        ├── douyin.mjs                # 主采集逻辑
        └── douyin-sign.js            # a_bogus 签名库
```

## 依赖

- `playwright` (^1.60.0) - 浏览器自动化
- `playwright-extra` (^4.3.6) - 隐身插件支持
- `puppeteer-extra-plugin-stealth` (^2.11.2) - 反检测
