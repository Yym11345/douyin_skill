---
description: 采集小红书创作者账号数据 — 粉丝数、笔记列表（点赞/收藏/评论/分享/封面/标签/图文图片），导出 JSON/CSV/HTML 报告
argument-hint: <小红书主页URL或user_id> [--limit N] [--delay ms] [--relogin] [--profile 路径]
---

# /xiaohongshu_skill

采集小红书创作者账号的完整数据，输出 summary.json / videos.json / videos.csv / report.html 四个文件。

> 注：此命令文件位于 `douyin_skill` 仓库，但执行的是 `xiaohongshu_skill` 项目下的脚本——用户故意把命令文件放在这里以便在 douyin_skill workspace 也能用 `/xiaohongshu_skill`。原文件 v1 编码被损坏，本版本按 `douyin_skill.md` 命令文件的骨架重写。

## 参数说明

- 第一个参数：小红书主页 URL 或 `user_id`（必填）
- `--limit N`：最多采集多少条笔记（默认 200）
- `--delay MS`：每轮滚动等待响应的最大毫秒数（默认 3000）
- `--relogin`：清除已保存的登录态，强制重新扫码
- `--profile 路径`：浏览器 Profile 目录（多账号时为每个账号指定独立目录）

## 执行步骤

1. **解析参数** — 从 `$ARGUMENTS` 中提取账号和可选参数

2. **运行采集器**（注意：跨项目调用，使用绝对路径）：

   ```bash
   node "D:/edgedownload/ai_projects/xiaohongshu_skill/scripts/collect.mjs" $ARGUMENTS
   ```

3. **采集成功后**，输出以下摘要：
   - 账号昵称 + user_id
   - 粉丝数、获赞与收藏数
   - 已采集笔记数 / 总笔记数
   - 输出目录路径（提示用户打开 `report.html` 查看可视化报告）

4. **常见错误处理**：
   - `--account is required` → 提示用户传入账号 URL 或 user_id
   - 浏览器弹出但无数据 → 登录状态已过期，建议加 `--relogin` 重跑
   - `HTTP 412 / 403` → 风控触发，建议 `--delay 5000` 并减小 `--limit`

## 备注

- 首次运行会打开浏览器弹出二维码，用小红书 App 扫码登录
- 登录状态保存在小红书 skill 项目的浏览器 Profile 目录
- 跨 Windows / macOS / Linux 时把 `D:/edgedownload/ai_projects/xiaohongshu_skill` 改成实际安装路径
- 此命令文件编码问题历史：v1 文件用 GBK 字节被当 UTF-8 解码导致 mojibake，本版本已重写为干净 UTF-8（无 BOM）；corrupted 原文保留在项目根 `xiaohongshu_skill.md.corrupted.bak` 供参考
