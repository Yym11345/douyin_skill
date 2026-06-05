# Usage Examples

## 浏览器登录模式（推荐）

### 基础用法

```bash
# 最简单的方式 - 自动打开浏览器扫码
node scripts/collect.mjs --account "https://www.douyin.com/user/MS4wLjABAAAAxOXMMgun8wa_2H tuKg7EFlm38CYhLNzQ3xR6iZT5s"
```

**流程演示：**
```
[douyin_skill] Collecting account: https://www.douyin.com/user/MS4wLjABAAAA...
[douyin_skill] Mode: Browser Login
[douyin_skill] limit=200, delay=5000ms
[Browser] Waiting for login... Please scan QR code or login in the browser.
[Browser] Login detected! Cookies saved to profile.
[Browser] Starting collection with authenticated session...

[douyin_skill] Done!
  Account : 创作者昵称 (MS4wLjABAAAA...)
  Followers: 1,234,567
  Videos  : 200 fetched (total: 500)
  Likes   : 50,000,000
  Views   : 200,000,000
  Output  : ./outputs/MS4wLjABAAAA...
```

### 自定义配置文件位置

```bash
# 使用自定义浏览器配置文件目录
node scripts/collect.mjs \
  --account "https://www.douyin.com/user/MS4wLjABAAAA..." \
  --profile ./my_profiles/douyin_account_1
```

**用途：**
- 管理多个抖音账号登录状态
- 每个账号使用独立的配置文件

### 限制采集数量

```bash
# 只采集最新 50 个视频
node scripts/collect.mjs \
  --account "MS4wLjABAAAA..." \
  --limit 50
```

### 增加请求间隔（避免风控）

```bash
# 每个请求间隔 10 秒
node scripts/collect.mjs \
  --account "https://www.douyin.com/user/MS4wLjABAAAA..." \
  --delay 10000 \
  --limit 100
```

### 自定义输出目录

```bash
# 保存到指定目录
node scripts/collect.mjs \
  --account "MS4wLjABAAAA..." \
  --out ./data/douyin_creator_20260605
```

## 手动 Cookie 模式

### 获取 Cookie

1. 浏览器打开 `https://www.douyin.com` 并登录
2. 按 `F12` 打开开发者工具
3. 切换到 **Network** 标签
4. 刷新页面
5. 点击任意请求
6. 在右侧找到 **Request Headers**
7. 复制 `cookie:` 后面的完整内容

### 使用手动 Cookie

```bash
node scripts/collect.mjs \
  --account "https://www.douyin.com/user/MS4wLjABAAAA..." \
  --cookie "msToken=VkDUvz1y24CppXSl80iFPr6ez-3FiizcwD7fI1OqBt6I...; ttwid=1%7C...; sessionid=..." \
  --no-browser
```

### 保存 Cookie 到文件

```bash
# 创建 cookie.txt
echo "msToken=xxx; ttwid=xxx; sessionid=xxx; ..." > cookie.txt

# 使用
node scripts/collect.mjs \
  --account "抖音用户URL" \
  --cookie "$(cat cookie.txt)" \
  --no-browser
```

## 高级用法

### 批量采集多个账号

创建 `accounts.txt`:
```
MS4wLjABAAAA... Creator1
MS4wLjABAAAA... Creator2
MS4wLjABAAAA... Creator3
```

批量脚本 `batch_collect.sh`:
```bash
#!/bin/bash
while IFS=' ' read -r account name; do
  echo "Collecting: $name"
  node scripts/collect.mjs \
    --account "$account" \
    --out "./outputs/$name" \
    --limit 100
  sleep 60  # 每个账号间隔 1 分钟
done < accounts.txt
```

运行：
```bash
chmod +x batch_collect.sh
./batch_collect.sh
```

### 定时采集（Cron）

每天凌晨 3 点采集：
```bash
crontab -e
```

添加：
```
0 3 * * * cd /path/to/douyin_skill && node scripts/collect.mjs --account "MS4wLjABAAAA..." --out ./outputs/daily_$(date +\%Y\%m\%d)
```

### 作为 Node.js 模块使用

```javascript
import { collect } from "./scripts/adapters/douyin.mjs";

const result = await collect({
  account: "MS4wLjABAAAA...",
  cookieHeader: "msToken=xxx; ttwid=xxx; sessionid=xxx",
  limit: 100,
  delay: 5000,
});

console.log(`Collected ${result.videos.length} videos`);
console.log(`Total likes: ${result.account.totalLikes}`);
```

## 常见场景

### 场景 1: 首次使用

```bash
# 1. 安装依赖
npm install

# 2. 运行采集（自动打开浏览器）
node scripts/collect.mjs --account "https://www.douyin.com/user/MS4wLjABAAAA..."

# 3. 浏览器中扫码登录

# 4. 等待采集完成
```

### 场景 2: 每日更新

```bash
# 登录状态已保存，直接运行即可
node scripts/collect.mjs \
  --account "MS4wLjABAAAA..." \
  --limit 50 \
  --out ./outputs/update_$(date +%Y%m%d)
```

### 场景 3: 快速测试（不想用浏览器）

```bash
# 手动复制 Cookie，快速测试
node scripts/collect.mjs \
  --account "MS4wLjABAAAA..." \
  --cookie "你的Cookie" \
  --no-browser \
  --limit 10
```

### 场景 4: 大量采集（避免风控）

```bash
# 增加间隔，减少频率
node scripts/collect.mjs \
  --account "MS4wLjABAAAA..." \
  --delay 15000 \
  --limit 500
```

### 场景 5: 多账号管理

```bash
# 账号 1
node scripts/collect.mjs \
  --account "账号1URL" \
  --profile ./profiles/account1

# 账号 2
node scripts/collect.mjs \
  --account "账号2URL" \
  --profile ./profiles/account2
```

## 故障排除示例

### 问题 1: 依赖未安装

```
Error: Cannot find package 'playwright-extra'
```

**解决：**
```bash
npm install
```

### 问题 2: 浏览器未安装

```
Error: Executable doesn't exist at ...
```

**解决：**
```bash
npx playwright install chromium
```

### 问题 3: 扫码后无反应

```
[Browser] Waiting for login... Please scan QR code or login in the browser.
(一直卡住)
```

**排查：**
```bash
# 1. 检查浏览器是否真的登录成功
# 2. 刷新页面，看是否需要重新登录
# 3. 关闭浏览器，删除旧配置重试
rm -rf ./private/profiles/douyin
node scripts/collect.mjs --account "..."
```

### 问题 4: HTTP 412 风控

```
Error: HTTP 412: Douyin risk-control ban (retryable)
```

**解决：**
```bash
# 1. 增加请求间隔
node scripts/collect.mjs --account "..." --delay 10000

# 2. 减少采集数量
node scripts/collect.mjs --account "..." --limit 50

# 3. 等待几分钟后重试
sleep 300 && node scripts/collect.mjs --account "..."
```

### 问题 5: Cookie 过期

```
Error: Douyin API error code=2053: 用户未登录
```

**解决：**
```bash
# 清除旧登录状态，重新扫码
rm -rf ./private/profiles/douyin
node scripts/collect.mjs --account "..."
```

## 输出示例

### summary.json
```json
{
  "platform": "douyin",
  "id": "MS4wLjABAAAAxOXMMgun8wa_2H",
  "url": "https://www.douyin.com/user/MS4wLjABAAAAxOXMMgun8wa_2H",
  "name": "某抖音创作者",
  "followers": 1234567,
  "videoCount": 500,
  "totalLikes": 50000000,
  "totalViews": 200000000,
  "totalComments": 1000000,
  "fetchedAt": "2026-06-05T20:30:00.000Z"
}
```

### videos.json（部分）
```json
[
  {
    "id": "7123456789012345678",
    "title": "视频标题",
    "url": "https://www.douyin.com/video/7123456789012345678",
    "publishedAt": "2026-06-01T10:00:00+08:00",
    "duration": "03:21",
    "likes": 12000,
    "views": 230000,
    "comments": 321,
    "shares": 45,
    "favorites": 67,
    "coins": 0
  }
]
```

### videos.csv（Excel 打开效果）
```
id,title,url,publishedAt,duration,likes,views,comments,shares,favorites,coins
7123456789012345678,"视频标题",https://www.douyin.com/video/7123456789012345678,2026-06-01T10:00:00+08:00,03:21,12000,230000,321,45,67,0
...
```

## 性能参考

| 视频数量 | 预计时间 | 建议配置 |
|---------|---------|---------|
| 10 | ~1 分钟 | `--delay 5000` |
| 50 | ~5 分钟 | `--delay 5000` |
| 100 | ~10 分钟 | `--delay 5000` |
| 200 | ~20 分钟 | `--delay 5000` |
| 500+ | ~1 小时 | `--delay 10000` |

**注意：** 实际时间受网络、风控、服务器响应影响。
