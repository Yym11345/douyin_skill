---
description: 采集抖音创作者账号数据 — 粉丝数、视频/图文/直播列表（点赞/评论/分享/封面/标签/音乐），集中写入 outputs/Douyin_All_Data.xlsx 并自动刷新三级监控看板
argument-hint: <抖音主页URL或sec_user_id> [--limit N] [--delay ms] [--relogin] [--person 负责人]
---

# /douyin_skill

采集抖音创作者账号数据，写入**项目内集中式 Excel** `outputs/Douyin_All_Data.xlsx`，并自动刷新三级监控看板（全局 / 个人 / 组长）。

## 核心行为（v3.4）

- **不**再输出 `summary.json` / `videos.json` / `videos.csv` / `report.html` —— 所有数据集中 upsert 到 `outputs/Douyin_All_Data.xlsx` 的两个 sheet：`Summary`（账号级）和 `Videos`（视频级）
- **写策略**：临时文件 + 原子重命名，**EBUSY 无限重试**（每 5 秒提示一次"请关闭 Excel"，直到文件可用）
- **视频合并**：以 `aweme_id` 为键做 upsert，**不会**覆盖历史未抓到的视频行
- **全局排序**：Summary 按 person → followers desc；Videos 按 person → account_name → publishedAt desc
- **新增 `--person`**：负责人名，写入 Excel 行内做归人字段
- **自动看板**：collect 完成后自动 `node scripts/dashboard.mjs`，生成：
  - `outputs/dashboard.html`（全局）
  - `outputs/person_dashboards/<name>.html`（每个负责人）
  - `outputs/leader_dashboards/<name>.html`（按 `config/team.json` 配置的组长层级）

## 参数说明

- 第一个参数：抖音主页 URL（`https://www.douyin.com/user/MS4wLjABAAAA...`）或 sec_user_id（`MS4wLjABAAAA...`）
- `--limit N`：最多采集多少条视频（默认 200）
- `--delay MS`：每轮滚动等待响应的最长毫秒数（默认 2000）
- `--relogin`：清除已保存的登录态，强制重新扫码（同一 Profile 切换账号时使用）
- `--profile DIR`：浏览器 Profile 目录（默认 `./private/profiles/douyin`，多账号时为每个账号指定独立目录）
- `--person 负责人`：负责人姓名，写入 Excel 行内做归人字段（`batch_collect.mjs` 会自动传入）

> ⚠️ **旧参数已彻底移除**：不要建议 `--out` / `--cookie` / `--no-browser` / `--browser`，会被 collect.mjs 忽略或报错。

## 执行步骤

1. **解析参数** — 从 `$ARGUMENTS` 中提取账号和可选参数：
   - 第一个参数（URL 或 sec_user_id）传给 `--account`
   - 其余可选参数（`--limit`、`--delay`、`--relogin`、`--person`）原样追加

2. **定位项目根目录** — 本项目脚本使用 `__dirname` 解析所有路径，所以**无需 cd**，直接用以下绝对路径运行：

   - **单账号（最常见）**：
     ```bash
     node scripts/collect.mjs --account <url或sec_user_id> [--limit N] [--delay MS] [--relogin] [--person 负责人]
     ```
     > 如果项目**不是当前 Workspace**（全局安装模式），用安装路径替换：
     > ```bash
     > node "/path/to/douyin_skill/scripts/collect.mjs" --account <url> [其他参数]
     > ```
     完成后会**自动**追加到 `outputs/Douyin_All_Data.xlsx` 并刷新全部看板。

   - **批量（用户给了 Excel 路径）**：
     - 确认项目根目录有 `账号监控_人员分组.xlsx`，工作表名为 `按人分组`，列顺序 `[序号, 负责人, URL, sec_user_id, 昵称, 粉丝, 赞, 评, outputPath]`
     - 直接运行批采脚本，**不要**自己写循环：
       ```bash
       node scripts/batch_collect.mjs
       ```
     - 脚本会按 `序号 > 0 && sec_user_id 非空` 过滤，**顺序**（不并发）逐个调用 collect.mjs 并自动传入 `--person`
     - 全部完成后自动 `node scripts/dashboard.mjs`

   - **仅刷新看板（数据没动）**：
     ```bash
     node scripts/dashboard.mjs
     ```
     适用：外部修改了 `Douyin_All_Data.xlsx` 或 `config/组织关系.txt` 后想重新生成页面

3. **采集成功后**，输出以下摘要：
   - 账号昵称 + sec_user_id
   - 粉丝数、总赞数、总评论数
   - 已采集帖数（/总帖数），并按内容类型拆分：`video:180  image_text:18  live_replay:2`
   - 提示用户打开 `outputs/dashboard.html` 查看全局看板

4. **常见错误处理**：
   - `--account is required` → 提示用户传入账号 URL 或 sec_user_id
   - `Failed to capture user profile` → 登录状态已过期，提示用户加 `--relogin` 重跑
   - 浏览器弹出但无数据 → 直接加 `--relogin`，或删除 `./private/profiles/douyin/` 后重跑
   - `HTTP 412 / 403` → 风控触发，建议 `--delay 5000` 并减小 `--limit`
   - `channel "chrome"` 相关错误 → 本机没有 Google Chrome，引导用户跑 `install.ps1` / `install.sh`
   - Excel 写入卡住（脚本会循环打"请关闭 Excel"） → 关闭 Office 占用 `outputs/Douyin_All_Data.xlsx` 的进程
   - 看板缺"组长看板" → 引导用户编辑 `config/组织关系.txt`（v3.4+ 不再需要 `cp team.example.json`）

## 团队配置（`config/组织关系.txt`）

`dashboard.mjs` 启动时会**优先**读 `config/组织关系.txt` 自动解析并覆盖 `config/team.json`，生成组长看板。**v3.4+ 不再需要 `cp team.example.json`**。

### `config/组织关系.txt` 格式

```
推广一部主管：梁景煜
推广一部一组→组长：王梦圆，组员：陈星羽、陈一诺、张晨旭、罗永乐
推广一部二组→组长：王楚楚，组员：朱怡雯
推广一部三组→组长：洪碧瑶，组员：李珊、潘梦营、季朝娣、朱一凡、安惠靖
```

- **第一行**顶级主管（`XXX主管：姓名`，写一次）
- **后续每行**一个小组，格式 `组名→组长：姓名，组员：姓名1、姓名2、姓名3`
- 分隔符支持 `→`、中英文逗号、顿号、空格
- 脚本会自动生成 `"总管大盘"` 顶级组（leader 是主管，members 是**所有组长**的并集——main() 用它递归聚合每个组长的组员数据）
- 找不到 `组织关系.txt` 时退回读旧 `config/team.json`（兜底兼容）

### 修改方式

- 改团队架构 → **直接编辑 `config/组织关系.txt`** → 下次跑 `dashboard.mjs` 自动应用
- `config/team.json` 是**自动生成的**，**不要手改**（每次 dashboard 启动会被覆盖写）
- 极端情况：想写死 JSON 而不每次被覆盖 → 编辑 `config/team.json` **并**删除 `config/组织关系.txt`

## 备注

- 首次运行会打开浏览器弹出二维码，用抖音 App 扫码登录
- 登录状态保存在 `./private/profiles/douyin/`，之后运行无需重复扫码
- 没有安装 Google Chrome 时 `install.ps1` / `install.sh` 会尝试自动安装（winget / brew / apt / dnf）
- 采集进度实时打印，每 18 条视频为一批
- 视频类型细分：`video` / `image_text` / `live_replay` / `live`（由 `aweme_type` 映射：0/4=video，2/68=image_text，61=live_replay，51=live）
- `duration` 字段单位为秒
- `账号监控_人员分组.xlsx` 已在 `.gitignore` 屏蔽，是纯本地配置，不会被 commit
