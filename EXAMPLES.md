# Usage Examples (v3.2)

> v3.2 是纯浏览器拦截器架构。所有示例都不再涉及 `--cookie` / `--no-browser`，那些参数已被移除。

## 基础用法

### 最简单的方式

```bash
node scripts/collect.mjs --account "https://www.douyin.com/user/MS4wLjABAAAA..."
```

**流程演示：**
```
[douyin_skill v3.2] Collecting account: MS4wLjABAAAA...
[douyin_skill v3.2] Mode: Playwright API Interceptor
[douyin_skill v3.2] limit=200, delay=2000ms
[Stealth] Anti-detection script injected.
[Browser] Checking login status...
[Browser] Login detected!
[Browser] Navigating to user page: https://www.douyin.com/user/MS4wLjABAAAA...
[Capture] Profile details captured for: 创作者昵称
[Capture] Captured 18 videos (Total: 18, hasMore: true)
[Browser] Waiting 12 seconds for natural loads to stabilize page layout...
[Browser] Layout stabilized. Initial videos captured: 36
[Browser] Starting scroll loop to fetch videos...
[Browser] Scroll triggered new data. Total videos: 54
[Browser] Scroll triggered new data. Total videos: 72
...
[Browser] Server reported hasMore=false. All videos fetched.
[Browser] Finished fetching. Deduplicating data...

[douyin_skill v3.2] Done!
  Account : 创作者昵称 (MS4wLjABAAAA...)
  Followers: 1,234,567
  Posts   : 200 fetched (total: 500)
  Types   : video:198  image_text:2
  Likes   : 50,000,000
  Views   : 200,000,000
  Output  : ./outputs/创作者昵称
```

### 限制采集数量

```bash
node scripts/collect.mjs --account "MS4wLjABAAAA..." --limit 50
```

### 调整滚动等待时间

`--delay` 是**单轮滚动等待新 API 响应的最大毫秒数**。默认 2000 已适合大多数账号，遇风控可加大：

```bash
node scripts/collect.mjs --account "..." --delay 5000 --limit 100
```

### 自定义输出目录

```bash
node scripts/collect.mjs \
  --account "MS4wLjABAAAA..." \
  --out ./data/douyin_creator_20260605
```

### 多账号隔离（独立 Cookie）

```bash
node scripts/collect.mjs --account "账号1URL" --profile ./private/profiles/account1
node scripts/collect.mjs --account "账号2URL" --profile ./private/profiles/account2
```

## 用 Claude Code 斜杠命令

```
/douyin_skill MS4wLjABAAAA...
/douyin_skill MS4wLjABAAAA... --limit 50
/douyin_skill https://www.douyin.com/user/MS4wLjABAAAA... --delay 5000 --out ./data/today
/douyin_skill MS4wLjABAAAA... --relogin              # 强制重新扫码
/douyin_skill MS4wLjABAAAA... --profile ./private/profiles/B  # 多账号隔离
```

Claude 会自动 `cd` 到本项目运行 `node scripts/collect.mjs` 并总结结果。

## 高级用法

### 批量采集多个账号

创建 `accounts.txt`：
```
MS4wLjABAAAAxxx Creator1
MS4wLjABAAAAyyy Creator2
MS4wLjABAAAAzzz Creator3
```

`batch_collect.sh`：
```bash
#!/bin/bash
while IFS=' ' read -r account name; do
  echo "=== Collecting: $name ==="
  node scripts/collect.mjs \
    --account "$account" \
    --out "./outputs/$name" \
    --limit 100
  # 每个账号间隔 60 秒，给浏览器和服务端缓冲
  sleep 60
done < accounts.txt
```

```bash
chmod +x batch_collect.sh
./batch_collect.sh
```

### 定时采集（Linux/macOS cron）

每天凌晨 3 点：
```cron
0 3 * * * cd /path/to/douyin_skill && node scripts/collect.mjs --account "MS4wLjABAAAA..." --out ./outputs/daily_$(date +\%Y\%m\%d) >> ./logs/cron.log 2>&1
```

注意：cron 环境通常无图形界面，**首次必须人工运行一次完成扫码**，把登录态写入 `private/profiles/douyin/` 后 cron 才能复用。

### 定时采集（Windows 任务计划程序）

新建任务，操作设为：
```
程序: C:\Program Files\nodejs\node.exe
参数: scripts\collect.mjs --account "MS4wLjABAAAA..."
起始位置: D:\edgedownload\ai_projects\douyin_skill
```

## 常见场景

### 场景 1：首次使用

```bash
npm install
npx playwright install chromium
node scripts/collect.mjs --account "https://www.douyin.com/user/MS4wLjABAAAA..."
# 浏览器打开 → 扫码登录 → 自动开始采集
```

### 场景 2：每日更新

```bash
# 登录已持久化，直接跑
node scripts/collect.mjs \
  --account "MS4wLjABAAAA..." \
  --limit 50 \
  --out ./outputs/update_$(date +%Y%m%d)
```

### 场景 3：大量采集（避免风控）

```bash
node scripts/collect.mjs \
  --account "MS4wLjABAAAA..." \
  --delay 5000 \
  --limit 500
```

### 场景 4：把 HTML 报告分享给非技术同事

采集完成后（目录名是创作者昵称，已 sanitize）：
```bash
# Windows
start outputs/创作者昵称/report.html

# macOS
open outputs/创作者昵称/report.html

# Linux
xdg-open outputs/创作者昵称/report.html
```

`report.html` 是单文件（仅外链 Google Fonts CSS），可直接邮件 / IM 发送。

## 故障排除示例

### 问题 1：依赖未安装

```
Error: Cannot find package 'playwright-extra'
```

```bash
npm install
```

### 问题 2：Chromium 未下载

```
Error: Executable doesn't exist at ...
```

```bash
npx playwright install chromium
```

### 问题 3：扫码后无反应

`waitForLogin()` 最长等 10 分钟。如果一直卡住：
1. 检查浏览器是否真的登录（手动刷新 douyin.com 看是否需要重登）
2. 关闭浏览器
3. 清除并重试（两种方式二选一）：
   ```bash
   # 推荐：使用 --relogin 自动清登录态
   node scripts/collect.mjs --account "..." --relogin

   # 或手动删除登录态目录
   rm -rf ./private/profiles/douyin
   node scripts/collect.mjs --account "..."
   ```

### 问题 4：Failed to capture user profile

```
Error: Failed to capture user profile. Run with --relogin to clear session and re-authenticate.
```

通常是登录态失效或目标账号被风控。v3.2 推荐用 `--relogin` 标志：

```bash
node scripts/collect.mjs --account "..." --relogin
```

或手动：

```bash
rm -rf ./private/profiles/douyin
node scripts/collect.mjs --account "..."
```
重新扫码。

### 问题 5：滑动验证码 / 拼图

页面上手动完成验证，**不要关浏览器**，脚本会继续。

### 问题 6：滚动无新数据 8 轮自动停止

正常行为。看终端最后输出的 `Total videos: N`：
- N == `summary.videoCount` → 已采全
- N < `summary.videoCount` → 风控干预，加大 `--delay` 或换网络重试

### 问题 7：找不到 Chrome

```
Error: ... channel "chrome" ...
```

脚本默认走系统 Chrome。要么装 Chrome，要么编辑 `scripts/collect.mjs` 删掉 `channel: "chrome"` 那一行使用内置 Chromium。

## 输出示例

### summary.json

```json
{
  "platform": "douyin",
  "id": "MS4wLjABAAAA...",
  "url": "https://www.douyin.com/user/MS4wLjABAAAA...",
  "name": "某抖音创作者",
  "followers": 1234567,
  "videoCount": 500,
  "totalLikes": 50000000,
  "totalComments": 1000000,
  "fetchedAt": "2026-06-05T20:30:00.000Z"
}
```

### videos.json（截选一条）

```json
[
  {
    "id": "7123456789012345678",
    "type": "video",
    "title": "视频标题",
    "url": "https://www.douyin.com/video/7123456789012345678",
    "publishedAt": "2026-06-01T10:00:00+08:00",
    "duration": "03:21",
    "isTop": false,
    "likes": 12000,
    "comments": 321,
    "shares": 45,
    "favorites": 67,
    "coins": 0,
    "coverUrl": "https://p3-sign.douyinpic.com/cover.jpeg?...",
    "imageUrls": [],
    "tags": ["搞笑", "日常"],
    "musicTitle": "BGM 名字",
    "musicAuthor": "音乐人"
  }
]
```

图文帖示例（`type: "image_text"`）：

```json
{
  "id": "7123456789012345679",
  "type": "image_text",
  "title": "今日穿搭分享",
  "url": "https://www.douyin.com/note/7123456789012345679",
  "publishedAt": "2026-06-02T15:30:00+08:00",
  "duration": "",
  "isTop": true,
  "likes": 8000,
  "comments": 120,
  "shares": 30,
  "favorites": 410,
  "coins": 0,
  "coverUrl": "https://p3-sign.douyinpic.com/cover.jpeg?...",
  "imageUrls": [
    "https://p3-sign.douyinpic.com/img1.jpeg?...",
    "https://p3-sign.douyinpic.com/img2.jpeg?..."
  ],
  "tags": ["穿搭", "OOTD"],
  "musicTitle": "",
  "musicAuthor": ""
}
```

### videos.csv（Excel 打开）

```
id,type,title,url,publishedAt,duration,isTop,likes,comments,shares,favorites,tags,musicTitle
7123456789012345678,video,"视频标题",https://www.douyin.com/video/7123456789012345678,2026-06-01T10:00:00+08:00,03:21,0,12000,321,45,67,"搞笑 日常","BGM 名字"
...
```

含 UTF-8 BOM，Excel 直接打开中文不乱码。v3.2.1+ 起 CSV 新增 `type / isTop / tags / musicTitle` 列。

### report.html

打开后包含：
- 顶部：头像、昵称、签名、平台徽标、采集时间、视频进度
- 四张统计卡：粉丝数 / 视频总数 / 获赞总数 / 评论总数
- 视频表格：可点列头排序，可在搜索框过滤标题，行可点击跳转到视频页

## 性能参考

| 视频数量 | 预计时间 | 建议参数 |
|---------|---------|---------|
| 10 | ~30 秒 | 默认 |
| 50 | ~2 分钟 | 默认 |
| 100 | ~4 分钟 | 默认 |
| 200 | ~8 分钟 | 默认 |
| 500+ | ~25 分钟 | `--delay 5000` |

> v3.2 拦截器走的是浏览器自身的请求节奏，比 v2.x 的 HTTP 重放快很多，无需上千毫秒的退避。
> 实际时间受网络、风控、目标账号活跃度影响。
