# Changelog

## [2.0.0] - 2026-06-05

### ✨ 新增功能

- **浏览器自动登录** - 自动打开 Chrome 浏览器，支持扫码登录
- **Cookie 持久化** - 登录状态保存到本地配置文件，下次自动复用
- **隐身模式** - 集成 playwright-extra + stealth 插件，降低被检测风险
- **双模式支持** - 既支持浏览器登录，也支持手动 Cookie

### 🔧 技术改进

- 从 `video-account-monitor` 提取浏览器登录逻辑
- 集成 Playwright 浏览器自动化
- 添加登录检测和 Cookie 过滤
- 增加 10 分钟超时保护

### 📦 依赖更新

- 新增 `playwright` (^1.60.0)
- 新增 `playwright-extra` (^4.3.6)
- 新增 `puppeteer-extra-plugin-stealth` (^2.11.2)

### 📝 文档更新

- 更新 `SKILL.md` - 添加浏览器登录完整文档
- 更新 `README.md` - 添加快速开始指南
- 更新 `EXAMPLES.md` - 添加浏览器登录示例
- 新增安装说明和故障排除

### 🎯 使用变化

**之前（1.0.0）：**
```bash
# 必须手动提供 Cookie
node scripts/collect.mjs --account "..." --cookie "msToken=xxx; ..."
```

**现在（2.0.0）：**
```bash
# 自动打开浏览器扫码登录（推荐）
node scripts/collect.mjs --account "..."

# 手动 Cookie 仍然支持
node scripts/collect.mjs --account "..." --cookie "..." --no-browser
```

---

## [1.0.0] - 2026-06-05

### 🎉 初始版本

从 `video-account-monitor` skill 中提取抖音数据采集功能，创建独立的 `douyin_skill`。

### 核心功能

- 抖音账号信息采集（粉丝数、视频数、总点赞等）
- 视频列表分页采集（点赞/播放/评论/分享/收藏）
- `a_bogus` 签名算法（RC4 + SM3）
- 指数退避重试机制
- UA 轮换池（10 个）
- 多格式导出（summary.json、videos.json、videos.csv）

### 文件结构

```
douyin_skill/
├── scripts/
│   ├── collect.mjs           # CLI 入口（76 行）
│   └── adapters/
│       ├── douyin.mjs        # 主采集逻辑（294 行）
│       └── douyin-sign.js    # 签名库（393 行）
├── SKILL.md                  # 中文文档
├── README.md                 # 英文说明
├── EXAMPLES.md               # 使用示例
├── package.json              # 无依赖
└── .gitignore

总代码量: 763 行
```

### 技术栈

- **运行时**: Node.js (ES modules)
- **依赖**: 无（仅使用内置模块）
- **签名**: douyin-sign.js (RC4 + SM3)
- **接口**:
  - `/aweme/v1/web/user/profile/other/` - 用户信息
  - `/aweme/v1/web/aweme/post/` - 视频列表

### 局限性

- 需要手动获取 Cookie（包含 msToken）
- Cookie 容易过期
- 风控拦截率较高
- 无浏览器自动化

---

## 版本对比

| 功能 | 1.0.0 | 2.0.0 |
|------|:-----:|:-----:|
| 纯 HTTP 采集 | ✅ | ✅ |
| 手动 Cookie | ✅ | ✅ |
| 浏览器登录 | ❌ | ✅ |
| Cookie 持久化 | ❌ | ✅ |
| 隐身模式 | ❌ | ✅ |
| 无依赖 | ✅ | ❌ |
| 代码量 | 763 行 | 903 行 |

## 升级指南

### 从 1.0.0 升级到 2.0.0

1. **安装依赖**
   ```bash
   npm install
   ```

2. **运行方式不变**
   ```bash
   # 手动 Cookie 模式（兼容 1.0.0）
   node scripts/collect.mjs --account "..." --cookie "..." --no-browser
   
   # 新增浏览器登录模式
   node scripts/collect.mjs --account "..."
   ```

3. **配置文件变化**
   - `package.json` - 新增 3 个依赖
   - `scripts/collect.mjs` - 新增浏览器登录逻辑（+70 行）
   - 其他文件无变化

4. **数据格式兼容**
   - 输出格式完全相同（summary.json、videos.json、videos.csv）
   - API 调用逻辑不变

## 未来计划

### 2.1.0（计划中）

- [ ] 支持代理配置
- [ ] 添加进度条显示
- [ ] 支持断点续传
- [ ] 优化内存占用

### 2.2.0（考虑中）

- [ ] 并发采集多个账号
- [ ] 支持定时任务
- [ ] 生成 HTML 报告
- [ ] 数据可视化图表

---

**贡献者**: Claude (Anthropic)  
**License**: Educational use only  
**签名算法来源**: [ShilongLee/Crawler](https://github.com/ShilongLee/Crawler)
