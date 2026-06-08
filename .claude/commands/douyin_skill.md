---
description: 采集抖音创作者账号数据 — 粉丝数、视频/图文/直播列表（点赞/播放/评论/分享/封面/标签/音乐），导出 JSON/CSV/HTML 报告
argument-hint: <抖音主页URL或sec_user_id> [--limit N] [--delay ms] [--out 路径] [--relogin]
---

# /douyin_skill

采集抖音创作者账号的完整数据，输出 summary.json / videos.json / videos.csv / report.html 四个文件。

## 参数说明

- 第一个参数：抖音主页 URL（`https://www.douyin.com/user/MS4wLjABAAAA...`）或 sec_user_id（`MS4wLjABAAAA...`）
- `--limit N`：最多采集多少条视频（默认 200）
- `--delay MS`：每轮滚动等待响应的最长毫秒数（默认 2000）
- `--out 路径`：自定义输出目录（默认 `./outputs/<创作者昵称>`，经过 sanitizeName 处理：去除 `\/:*?"<>|`、空格转下划线、最长 60 字符）
- `--relogin`：清除已保存的登录态，强制重新扫码（同一 Profile 切换账号时使用）
- `--profile DIR`：浏览器 Profile 目录（默认 `./private/profiles/douyin`，多账号时为每个账号指定独立目录）

## 执行步骤

1. **解析参数** — 从 `$ARGUMENTS` 中提取账号和可选参数；如果第一个参数像是抖音主页 URL 而非 sec_user_id，原样传给 `--account`

2. **在项目根目录运行采集器**：

   - **如果用户提供单个链接或 sec_user_id**：直接运行 `node scripts/collect.mjs $ARGUMENTS`，采集完成后会自动更新输出目录并生成监控面板 (`scripts/dashboard.mjs`)。
   - **如果用户提供 Excel 表格（如 `账号监控_人员分组.xlsx`）要求批量采集**：
     - **必须**解析 Excel 表格，获取所有账号的链接/sec_user_id 和负责人信息。
     - **必须**使用 `node scripts/collect.mjs --account <url>` 顺序依次（一个接一个）进行采集，**绝对不能**同时并发或后台并行采集多个账号（防止触发抖音风控和浏览器多开卡死）。
     - 第二次采集（或多次采集）时，脚本会自动根据 `sec_user_id` 匹配并**覆盖**第一次采集的历史数据目录，不会产生冗余目录。
     - 如果 Excel 中有新增的账号和新增的负责人，采集完成后运行 `node scripts/dashboard.mjs` 会自动将新数据添加到全局监控面板。
     - 如果不想自己写解析和循环，也可以直接调用现成的批量脚本 `node scripts/batch_collect.mjs`（该脚本已内置 Excel 读取、逐个顺序采集和完成后自动调用 `dashboard.mjs` 的功能）。

   > 注意：如果用户传了 `https://...` 形式的 URL 而 Claude 自动包装为 `--account "URL"`，请保留原样传递。

3. **采集成功后**，输出以下摘要：
   - 账号昵称 + sec_user_id
   - 粉丝数、总赞数
   - 已采集帖数（/总帖数），并按内容类型拆分：`video:180  image_text:18  live_replay:2`
   - 输出目录路径（提示用户打开 `report.html` 查看可视化报告）
   - 封面图、标签、音乐等附加字段可在 `videos.json` / `videos.csv` 中查看

4. **常见错误处理**：
   - `--account is required` → 提示用户传入账号 URL 或 sec_user_id
   - `Failed to capture user profile` → 登录状态已过期，提示用户加 `--relogin` 重跑（脚本会在错误信息中自动给出该建议）
   - 浏览器弹出但无数据 → 删除 `./private/profiles/douyin/` 后重新扫码（或直接加 `--relogin`）
   - `HTTP 412 / 403` → 风控触发，建议 `--delay 5000` 并减小 `--limit`
   - `channel "chrome"` 相关错误 → 本机没有 Google Chrome，引导用户跑 `install.ps1` / `install.sh`（已支持自动安装 Chrome）
   - 其他错误 → 粘贴完整错误信息并排查

## 备注

- 首次运行会打开浏览器弹出二维码，用抖音 App 扫码登录
- 登录状态保存在 `./private/profiles/douyin/`，之后运行无需重复扫码
- 没有安装 Google Chrome 时自动回退到 Playwright 自带的 Chromium（setup 脚本会尝试自动安装 Chrome）
- 采集进度实时打印，每 18 条视频为一批
- 输出目录默认以**创作者昵称**命名（v3.2.1+ 改进），用 `sec_user_id` 仍能稳定工作但可读性差
- 视频类型细分：`video` / `image_text` / `live_replay` / `live`（v3.2.1+ 新增 `type` 字段）
- `duration` 字段单位已修正为秒（v3.2.1 之前的版本曾误存为毫秒）
