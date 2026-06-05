# Douyin Skill - Project Summary

## ✅ 完成状态

从 `video-account-monitor` skill 成功提取抖音数据采集功能，创建独立的 `douyin_skill`。

## 📦 项目结构

```
douyin_skill/
├── README.md                      # 英文项目说明
├── SKILL.md                       # 中文完整文档（skill 描述）
├── EXAMPLES.md                    # 使用示例和常见问题
├── package.json                   # 包元数据
├── .gitignore                     # Git 忽略规则
└── scripts/
    ├── collect.mjs                # CLI 入口（76 行）
    └── adapters/
        ├── douyin.mjs             # 主采集逻辑（294 行）
        └── douyin-sign.js         # a_bogus 签名库（393 行）

总代码量: 763 行
```

## 🎯 核心功能

1. **用户信息采集**
   - 粉丝数、视频数、总点赞、总播放、总评论
   - 接口: `/aweme/v1/web/user/profile/other/`

2. **视频列表采集**
   - 分页抓取（每页 18 条）
   - 字段: id, title, url, publishedAt, duration, likes, views, comments, shares, favorites
   - 接口: `/aweme/v1/web/aweme/post/`

3. **签名算法**
   - `a_bogus` 参数生成（RC4 + SM3 国密哈希）
   - UA 轮换池（10 个）
   - 指数退避重试（最多 5 次）

4. **导出格式**
   - `summary.json` - 账号概览
   - `videos.json` - 完整视频列表
   - `videos.csv` - Excel 兼容（UTF-8 BOM）

## 🚀 快速开始

```bash
# 基础用法
node scripts/collect.mjs --account "https://www.douyin.com/user/MS4wLjABAAAA..."

# 带 Cookie（推荐）
node scripts/collect.mjs \
  --account "MS4wLjABAAAA..." \
  --cookie "msToken=xxx; ttwid=xxx; ..." \
  --limit 200
```

## ✅ 验证通过

- ✓ 模块导入链路正常（`collect` 函数正确导出）
- ✓ CLI 入口可执行（正确显示 usage 错误）
- ✓ 文件结构完整
- ✓ 签名库加载正常

## 📝 与原 skill 的区别

| 维度 | video-account-monitor | douyin_skill |
|------|----------------------|--------------|
| 平台支持 | 4 平台（Bilibili, Douyin, Kuaishou, Xiaohongshu） | 仅 Douyin |
| 依赖 | `playwright`, `playwright-extra`, `puppeteer-extra-plugin-stealth` | 无依赖（仅 Node.js 内置模块） |
| CLI | 通用 `monitor.mjs` + 平台选择 | 专用 `collect.mjs` |
| 浏览器 | 需要 Playwright 浏览器 | 纯 HTTP 请求（无浏览器） |
| 代码量 | ~2000+ 行（多平台） | 763 行（纯抖音） |

## 🔑 关键技术点

1. **a_bogus 签名**
   - 原理: RC4 加密 + SM3 哈希 + Base64 变体编码
   - 输入: query string + user agent + 环境指纹
   - 输出: 44 字符签名串

2. **风控对抗**
   - msToken 必需（从 Cookie 提取）
   - UA 轮换（10 个现代浏览器 UA）
   - 请求间隔抖动（±30%）
   - 指数退避重试（3s → 6s → 12s → 24s → 48s）

3. **数据去重**
   - 按 `aweme_id` 去重
   - 分页可能返回重复数据

## 📚 文档

- `README.md` - 项目概览（英文）
- `SKILL.md` - 完整使用文档（中文，包含参数说明、输出格式、常见问题）
- `EXAMPLES.md` - 实际使用示例和故障排除

## 🛡️ 安全性

- 不要求用户密码或 SMS 验证码
- 仅使用 Cookie（用户自行从浏览器导出）
- `.gitignore` 已配置防止泄漏：
  - `outputs/` - 采集数据
  - `private/` - 敏感文件
  - `*.cookie` - Cookie 文件
  - `.env` - 环境变量

## ⚠️ 已知限制

1. **风控拦截**
   - HTTP 412 / 403: 需要有效 Cookie（含 msToken）
   - 建议增加 `--delay` 到 10000ms 或更高

2. **数据完整性**
   - 仅能获取主页视频列表（不含合集内视频）
   - 账号总视频数以 API 分页为准

3. **依赖版本**
   - 需要 Node.js 支持 ES modules（Node 14+）
   - 签名算法可能随抖音风控更新而失效

## 🎓 学习用途

仅供学习和技术研究，严禁商业用途和非法使用。签名代码来源于 [ShilongLee/Crawler](https://github.com/ShilongLee/Crawler)。
