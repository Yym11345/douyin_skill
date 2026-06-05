---
description: 采集抖音创作者账号数据 — 粉丝数、视频列表（点赞/播放/评论/分享）、导出 JSON/CSV/HTML 报告
argument-hint: <抖音主页URL或sec_user_id> [--limit N] [--delay ms] [--out 路径]
---

# /douyin_skill

采集抖音创作者账号的完整数据，输出 summary.json / videos.json / videos.csv / report.html 四个文件。

## 参数说明

- 第一个参数：抖音主页 URL（`https://www.douyin.com/user/MS4wLjABAAAA...`）或 sec_user_id（`MS4wLjABAAAA...`）
- `--limit N`：最多采集多少条视频（默认 200）
- `--delay MS`：每轮滚动等待响应的最长毫秒数（默认 2000）
- `--out 路径`：自定义输出目录（默认 `./outputs/<sec_user_id>`）

## 执行步骤

1. **解析参数** — 从 `$ARGUMENTS` 中提取账号和可选参数

2. **在项目根目录运行采集器**：

   ```bash
   node scripts/collect.mjs $ARGUMENTS
   ```

   > 注意：直接使用相对路径 `node scripts/collect.mjs`，Claude Code 会在当前 workspace 根目录执行。

3. **采集成功后**，输出以下摘要：
   - 账号昵称 + sec_user_id
   - 粉丝数、总赞数
   - 已采集视频数（/总视频数）
   - 输出目录路径（提示用户打开 `report.html` 查看可视化报告）

4. **常见错误处理**：
   - `--account is required` → 提示用户传入账号 URL
   - 浏览器弹出但无数据 → 登录状态失效，删除 `./private/profiles/douyin/` 后重新扫码
   - `HTTP 412 / 403` → 风控触发，建议 `--delay 5000` 并减小 `--limit`
   - 其他错误 → 粘贴完整错误信息并排查

## 备注

- 首次运行会打开浏览器弹出二维码，用抖音 App 扫码登录
- 登录状态保存在 `./private/profiles/douyin/`，之后运行无需重复扫码
- 没有安装 Google Chrome 时自动回退到 Playwright 自带的 Chromium
- 采集进度实时打印，每 18 条视频为一批
