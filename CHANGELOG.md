# Changelog

## [3.2.0] - 2026-06-05

### ✨ 新增

- **HTML 报告** — `report.html` 自动生成；暗色风格、统计卡片、可排序 + 可搜索的视频表格，开箱即可分享
- **登录态智能检测** — 同时检查 cookies（`sessionid` / `sid_guard` / `LOGIN_STATUS`）和 `localStorage.HasUserLogin`，三者任一命中即认为已登录
- **自动触发登录弹窗** — 未登录时自动点击页面"登录"按钮弹出二维码，不再需要用户手动操作
- **滚动 jitter 策略** — 失败回合自动上滚回弹再下滚，重新触发懒加载 `IntersectionObserver`
- **`/douyin_skill` 斜杠命令** — 新增 `.claude/commands/douyin_skill.md`，支持 Claude Code 内一键调用

### 🔧 改动

- 默认 `--delay` 从 5000ms → **2000ms**（拦截器模式下不再需要长间隔）
- 视口从 1920×1080 → **1280×800**（更接近常见显示器，反指纹）
- 终止条件：连续 **8** 轮无新响应自动停止滚动

### 🗑️ 移除

- **`--cookie` / `--browser` / `--no-browser` 旗标全部删除**。采集必须通过浏览器拦截器；任何"无浏览器"模式都会失败，因为没有真实浏览器签名就过不了风控
- collect.mjs 不再 `import` `adapters/douyin.mjs` 与 `adapters/douyin-sign.js`（两文件保留作参考，下个大版本可能移除）

### 📦 输出

| 文件 | 状态 |
|------|------|
| `summary.json` | ✅ 保留 |
| `videos.json` | ✅ 保留 |
| `videos.csv` | ✅ 保留 |
| `report.html` | 🆕 新增 |

---

## [3.1.0] - 2026-06-05

### ✨ 新增

- **`adapters/stealth.min.js` 注入** — 通过 `context.addInitScript()` 在每个页面加载前注入 ~180KB 反检测脚本
- **`launchPersistentContext`** — 浏览器配置文件持久化，支持多账号隔离（`--profile`）

### 🔧 改动

- 适配器 `collect()` 签名增加 `customUA` 与 `fetchFn` 参数（为未来浏览器/HTTP 混合模式预留）

---

## [3.0.0] - 2026-06-05

### 💥 架构变更：浏览器内 a_bogus 签名

放弃在 Node.js 中本地生成 a_bogus，改为：
1. 在 Playwright 浏览器中通过 `page.evaluate()` 内联执行签名脚本
2. 用浏览器真实环境（`navigator.userAgent` / `screen.width` 等）生成参数
3. 调用 `fetch()` 走浏览器原生网络栈

参考 MediaCrawler 架构。**该路径仍依赖 a_bogus 签名，v3.2 已被完全替代。**

---

## [2.0.0] - 2026-06-05

### ✨ 新增

- **浏览器自动登录** — 自动打开 Chrome 浏览器，支持扫码登录
- **Cookie 持久化** — 登录状态保存到本地配置文件，下次自动复用
- **隐身模式** — 集成 playwright-extra + stealth 插件
- **双模式支持** — 浏览器登录 + 手动 Cookie 双栈共存（手动模式 v3.2 已移除）

### 📦 依赖

- 新增 `playwright` (^1.60.0)
- 新增 `playwright-extra` (^4.3.6)
- 新增 `puppeteer-extra-plugin-stealth` (^2.11.2)

---

## [1.0.0] - 2026-06-05

### 🎉 初始版本

从 `video-account-monitor` skill 中提取抖音数据采集功能。

- 抖音账号信息采集（粉丝数、视频数、总点赞等）
- 视频列表分页采集（点赞/播放/评论/分享/收藏）
- `a_bogus` 签名算法（RC4 + SM3）
- 指数退避重试 + UA 轮换
- 多格式导出（summary.json、videos.json、videos.csv）

### 局限性

- 需要手动获取 Cookie（含 msToken）
- Cookie 容易过期
- 风控拦截率高

---

## 版本对比

| 功能 | 1.0 | 2.0 | 3.0 | 3.1 | 3.2 |
|------|:---:|:---:|:---:|:---:|:---:|
| 纯 HTTP + a_bogus | ✅ | ✅ | ❌ | ❌ | ❌ |
| 浏览器登录 | ❌ | ✅ | ✅ | ✅ | ✅ |
| 浏览器内签名 | ❌ | ❌ | ✅ | ✅ | ❌ |
| 网络拦截器 | ❌ | ❌ | ❌ | ❌ | ✅ |
| Cookie 持久化 | ❌ | ✅ | ✅ | ✅ | ✅ |
| Stealth 注入 | ❌ | 插件 | 插件 | 插件 + 脚本 | 插件 + 脚本 |
| HTML 报告 | ❌ | ❌ | ❌ | ❌ | ✅ |
| 手动 Cookie 模式 | ✅ | ✅ | ✅ | ✅ | ❌ |
| 斜杠命令 | ❌ | ❌ | ❌ | ❌ | ✅ |

## 升级指南

### 从 2.x / 3.0 / 3.1 升级到 3.2

1. 拉取最新代码
2. 命令行变化：
   ```bash
   # 旧（不再支持）
   node scripts/collect.mjs --account "..." --cookie "..." --no-browser

   # 新
   node scripts/collect.mjs --account "..."
   ```
3. 默认 `--delay` 改为 2000ms，如遇风控可手动加大到 5000~10000
4. 输出多了 `report.html`，可直接双击在浏览器查看
5. 旧的 `adapters/douyin.mjs` 与 `adapters/douyin-sign.js` 现已被 collect.mjs 弃用，但暂时保留

---

**License**: Educational use only
**Legacy signing code**: [ShilongLee/Crawler](https://github.com/ShilongLee/Crawler)（v3.2 起不再使用）
