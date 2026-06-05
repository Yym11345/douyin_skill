# ✅ Douyin Skill 安装完成！

## 安装状态

```
✅ npm 依赖已安装 (44 packages)
✅ Playwright 已安装
✅ Playwright-extra 已安装
✅ Stealth 插件已安装
✅ CLI 入口正常
```

## 快速开始

### 立即使用（浏览器登录）

```bash
cd D:\edgedownload\ai_projects\douyin_skill

node scripts/collect.mjs --account "https://www.douyin.com/user/MS4wLjABAAAA..."
```

**会发生什么：**
1. 自动打开 Chrome 浏览器
2. 显示抖音登录页面
3. 使用抖音 APP 扫码登录
4. 登录成功后自动开始采集
5. 数据保存到 `./outputs/<账号ID>/`

### 测试账号示例

```bash
# 使用一个公开的抖音账号测试
node scripts/collect.mjs \
  --account "https://www.douyin.com/user/MS4wLjABAAAAxOXMMgun8wa_2HtuKg7EFlm38CYhLNzQ3xR6iZT5s" \
  --limit 10
```

## 常用命令

### 1. 基础采集（200个视频）
```bash
node scripts/collect.mjs --account "抖音用户URL"
```

### 2. 限制数量（只采集50个）
```bash
node scripts/collect.mjs --account "抖音用户URL" --limit 50
```

### 3. 增加间隔（避免风控）
```bash
node scripts/collect.mjs --account "抖音用户URL" --delay 10000
```

### 4. 自定义输出目录
```bash
node scripts/collect.mjs --account "抖音用户URL" --out ./my_data
```

### 5. 手动 Cookie 模式（不用浏览器）
```bash
node scripts/collect.mjs \
  --account "抖音用户URL" \
  --cookie "msToken=xxx; sessionid=xxx; ..." \
  --no-browser
```

## 输出文件

采集完成后会生成：

```
outputs/<账号ID>/
├── summary.json      # 账号概览（粉丝数、总点赞等）
├── videos.json       # 完整视频列表（JSON格式）
└── videos.csv        # 视频列表（CSV格式，可用Excel打开）
```

## 浏览器登录流程

```
[douyin_skill] Collecting account: https://www.douyin.com/user/...
[douyin_skill] Mode: Browser Login
[douyin_skill] limit=200, delay=5000ms

🌐 Chrome 浏览器自动打开
📱 在浏览器中扫码登录
✅ 登录成功，Cookie 已保存
📊 开始采集数据...

[douyin_skill] Done!
  Account : 创作者昵称 (MS4wLjABAAAA...)
  Followers: 1,234,567
  Videos  : 200 fetched (total: 500)
  Output  : ./outputs/MS4wLjABAAAA...
```

## 登录状态管理

**首次登录：**
- Cookie 保存到 `./private/profiles/douyin/`
- 下次运行自动复用

**清除登录（重新扫码）：**
```bash
rm -rf ./private/profiles/douyin
node scripts/collect.mjs --account "..."
```

## 注意事项

### ⚠️ 首次运行可能需要下载 Chromium

如果提示浏览器未安装：
```bash
npx playwright install chromium
```

### ⚠️ 风控问题

即使登录也可能被风控，建议：
- 增加 `--delay 10000`（10秒间隔）
- 减少 `--limit 50`（少采集一些）
- 等待几分钟后重试

### ⚠️ Windows 路径问题

如果遇到路径错误，使用双引号：
```bash
node scripts/collect.mjs --account "https://www.douyin.com/user/..."
```

## 完整文档

- **[SKILL.md](./SKILL.md)** - 完整使用文档
- **[EXAMPLES.md](./EXAMPLES.md)** - 详细示例和故障排除
- **[CHANGELOG.md](./CHANGELOG.md)** - 版本更新记录

## 需要帮助？

遇到问题查看：
1. [常见问题](./SKILL.md#常见问题)
2. [故障排除](./EXAMPLES.md#故障排除示例)
3. 或直接询问 Claude

---

**现在可以开始使用了！** 🚀

运行：
```bash
node scripts/collect.mjs --account "你的抖音用户URL"
```
