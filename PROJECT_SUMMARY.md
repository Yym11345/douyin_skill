# Douyin Skill — Project Summary (v3.2)

## 当前状态

`douyin_skill` 已演进到 **v3.2 — Playwright API Interceptor**。不再依赖本地 a_bogus 签名，改为通过浏览器网络响应拦截直接捕获抖音前端原生发起的 API JSON。

## 项目结构

```
douyin_skill/
├── SKILL.md                      # 中文 skill 文档（Claude 实际加载）
├── README.md                     # 英文项目说明
├── EXAMPLES.md                   # 使用示例与故障排除
├── CHANGELOG.md                  # 版本历史
├── PROJECT_SUMMARY.md            # 本文件
├── package.json                  # 3 个依赖
├── .gitignore
├── .claude/
│   ├── commands/
│   │   └── douyin_skill.md       # /douyin_skill 斜杠命令
│   └── settings.local.json       # 本地许可的 Bash 命令白名单
├── private/profiles/douyin/      # 浏览器登录态（自动生成，git 忽略）
├── outputs/                      # 采集结果（自动生成，git 忽略）
└── scripts/
    ├── collect.mjs               # v3.2 主入口（834 行 — 拦截器 + 滚动循环 + HTML 报告生成器）
    └── adapters/
        ├── stealth.min.js        # 反检测注入脚本（180 KB）
        ├── douyin.mjs            # 旧版 HTTP 适配器（v2.x；当前未被引用，保留作参考）
        └── douyin-sign.js        # 旧版 a_bogus 签名（v1.x；未被引用）
```

代码量：约 834 行（活跃路径）+ 671 行（保留的 v1/v2 模块）

## 核心架构（v3.2）

```
┌────────────────────────┐
│ Playwright Chrome      │
│  ├ Stealth plugin      │  ← playwright-extra + puppeteer-extra-plugin-stealth
│  ├ stealth.min.js 注入 │
│  └ Persistent profile  │  ← ./private/profiles/douyin
└──────────┬─────────────┘
           │
           ▼
┌────────────────────────────────────────────────────┐
│ 1. 导航 https://www.douyin.com/                    │
│ 2. waitForLogin(): cookies + localStorage 检测     │
│    未登录 → 自动点 "登录" 按钮 → 等扫码（最长 10min）│
│ 3. 导航 /user/<sec_user_id>                        │
└──────────┬─────────────────────────────────────────┘
           │
           ▼
┌────────────────────────────────────────────────────┐
│ page.on('response', …) 拦截：                       │
│   /aweme/v1/web/user/profile/other/ → capturedProfile │
│   /aweme/v1/web/aweme/post/          → rawVideos[]    │
└──────────┬─────────────────────────────────────────┘
           │
           ▼
┌────────────────────────────────────────────────────┐
│ 滚动循环：                                          │
│   mouse.wheel(0, 600) × 6 次 → 等 --delay ms 看新响应│
│   失败回合 → jitter (上滚 + 下滚) 触发懒加载         │
│   终止：has_more=false / 达 --limit / 8 轮无新数据 │
└──────────┬─────────────────────────────────────────┘
           │
           ▼
┌────────────────────────────────────────────────────┐
│ 去重（aweme_id） → 映射 schema → 写四个文件：       │
│   summary.json  videos.json  videos.csv  report.html│
└────────────────────────────────────────────────────┘
```

## 核心数据流

1. **用户信息**：从 `/aweme/v1/web/user/profile/other/` 的 `user` / `user_module.user`
   - 字段：粉丝数、视频总数、获赞总数
2. **视频列表**：从 `/aweme/v1/web/aweme/post/` 的 `aweme_list[]`
   - 每页 18 条，分页由抖音前端自身的 IntersectionObserver 触发
3. **输出 schema**：跨平台一致（与 video-account-monitor 兼容）
   - `id` / `title` / `url` / `publishedAt` / `duration` / `likes` / `views` / `comments` / `shares` / `favorites` / `coins`

## 关键技术决策

### 为什么放弃 a_bogus 本地签名（v1 → v3.2 演进）

| 阶段 | 方案 | 失效原因 |
|------|------|----------|
| v1.0 | Node.js 本地 RC4+SM3 签名 | 签名算法随抖音更新失效 |
| v2.0 | + 浏览器登录 Cookie 注入 | 仍然走本地签名，本地 a_bogus 与浏览器环境指纹不匹配易被风控 |
| v3.0 | 在 `page.evaluate()` 内执行签名脚本 | 浏览器环境一致了，但仍然得自己拼请求 |
| **v3.2** | **完全不签名，直接拦截浏览器自己发的响应** | **抖音前端自己怎么签的与我无关，永远跟得上其更新** |

### 滚动 jitter 策略

`page.mouse.wheel()` 触发的是真实滚轮事件，比 `window.scrollTo()` 更能稳定触发懒加载。当一轮滚动后没有新响应：
1. 上滚 300×3
2. 等待 500ms
3. 下滚 800×4
4. 等待 1000ms

该序列模拟「翻回去看一眼又往下翻」的真人行为，能让被遗漏的 IntersectionObserver 重新触发。

### 登录态三重检测

```js
cookies.sessionid || cookies.sid_guard || cookies.LOGIN_STATUS === "1"
  || localStorage.HasUserLogin === "1"
```

抖音对不同登录路径写入的标识不同（密码登录写 `sessionid`，扫码偶尔只写 `LOGIN_STATUS`，老用户可能只剩 `HasUserLogin`），任一命中即视作已登录。

## CLI 接口

```
node scripts/collect.mjs --account <URL_OR_SEC_USER_ID> [options]

Options:
  --account   抖音主页 URL 或 sec_user_id（必填）
  --profile   浏览器配置文件目录（默认 ./private/profiles/douyin）
  --limit     最多采集视频数（默认 200）
  --delay     单轮滚动等待新响应的最大毫秒数（默认 2000）
  --out       输出目录（默认 ./outputs/<sec_user_id>）
```

## 输出格式

- `summary.json` — 账号概览（profile API 解析结果）
- `videos.json` — 完整视频列表（post API 聚合，去重）
- `videos.csv` — UTF-8 BOM CSV，Excel 友好
- `report.html` — 自带样式的暗色单页报告（统计卡 + 可排序/可搜索表格）

## 依赖

```json
{
  "playwright": "^1.60.0",
  "playwright-extra": "^4.3.6",
  "puppeteer-extra-plugin-stealth": "^2.11.2"
}
```

## 安全 & 合规

- 不要求用户密码或 SMS 验证码
- 登录通过抖音 APP 扫码完成，凭证仅写入本地 `private/profiles/douyin/`
- `.gitignore` 已配置：
  - `outputs/` — 采集数据
  - `private/` — 登录态与敏感文件
  - `node_modules/`

## 已知限制

1. **风控**
   - 滑动验证码出现时需人工解决
   - 高频采集仍可能被限流，建议账号级别 `--delay 5000+`
2. **数据范围**
   - 仅采主页视频流，不含合集 / 直播回放
   - 部分账号 `play_count` 被抖音隐藏（返回 0）
3. **环境**
   - 需要 Node.js 16+（ES modules + 顶级 await）
   - 需要 Chrome 浏览器（脚本 `channel: "chrome"`），或编辑代码改用 Chromium

## 与其他 skill 的对比

| 维度 | video-account-monitor | douyin_skill |
|------|----------------------|--------------|
| 平台支持 | 4 平台（B 站、抖音、快手、小红书） | 仅抖音 |
| 采集机制 | 多种（HTTP + 浏览器混合） | 纯浏览器网络拦截 |
| 依赖 | 多个适配器 + 平台特化代码 | Playwright + stealth 三件套 |
| 输出 | 跨平台统一 schema | 同 schema，额外提供 HTML 报告 |

## 演进路线

- ✅ v1.0 — 纯 HTTP + a_bogus（需要手 Cookie）
- ✅ v2.0 — 浏览器登录 + Cookie 持久化
- ✅ v3.0 — 浏览器内签名（绕过本地签名失效）
- ✅ v3.1 — Stealth 脚本注入 + 持久化 context
- ✅ v3.2 — 网络响应拦截器 + HTML 报告 + 斜杠命令
- 🔜 next — 移除 `adapters/douyin.mjs` / `douyin-sign.js` 死代码；可能新增直播 / 合集采集

## 文档索引

- `SKILL.md` — 完整使用文档（中文，Claude 加载入口）
- `README.md` — 英文 README
- `EXAMPLES.md` — 实战示例与故障排除
- `CHANGELOG.md` — 完整版本演进

---

**License**: Educational use only
