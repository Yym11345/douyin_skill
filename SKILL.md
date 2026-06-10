---
name: douyin_skill
description: Use when collecting Douyin (抖音) creator account metrics — profile info, follower counts, posts (video / image_text / live_replay / live) with likes/comments/shares/cover/tags/music. Writes all data to a centralized Excel (outputs/Douyin_All_Data.xlsx) with two sheets (Summary / Videos), then auto-refreshes a three-tier dashboard (global / person / leader) under outputs/. Pure browser-network interception, no a_bogus signing. Use --relogin to force a fresh QR scan. Use --person to tag the responsible team member for Excel-side attribution.
---

# Douyin Skill (v3.4)

从抖音采集创作者账号数据——粉丝数、视频列表、点赞/评论/分享指标，**集中写入** `outputs/Douyin_All_Data.xlsx`，并**自动刷新三级监控看板**。

## 安装依赖

### 方式一：全局安装（推荐，任意 Workspace 都能用 `/douyin_skill`）

Windows：
```powershell
powershell -ExecutionPolicy Bypass -Command "& { iwr https://raw.githubusercontent.com/Yym11345/douyin_skill/master/install.ps1 -OutFile $env:TEMP\install_dy.ps1; & $env:TEMP\install_dy.ps1 }"
```

macOS / Linux：
```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Yym11345/douyin_skill/master/install.sh)
```

> 安装脚本会自动尝试将本技能注册到您的 AI 助手环境中。

### 2. Claude Code

全局安装脚本会自动在您当前的 Workspace 目录下生成 `.claude/commands/douyin_skill.md`。安装后，直接在终端中输入 `/douyin_skill <url>` 即可调用。

### 3. Antigravity (Gemini)

安装脚本会自动在您的 `~/.gemini/config/plugins/` 目录下创建 `douyin_skill` 插件链接。安装完成后，Antigravity 将能在任何对话中发现并调用此技能。
如果你是以独立项目形式克隆的代码，也可以手动将本项目目录注册到 Antigravity：
```bash
# Windows
New-Item -ItemType Directory -Force -Path $HOME\.gemini\config\plugins\douyin_skill
Copy-Item .\SKILL.md $HOME\.gemini\config\plugins\douyin_skill\

# macOS / Linux
mkdir -p ~/.gemini/config/plugins/douyin_skill
ln -sf $(pwd)/SKILL.md ~/.gemini/config/plugins/douyin_skill/SKILL.md
```

### 4. Codex (及其他遵循通用技能协议的 Agent)

对于 Codex 等支持指定本地技能目录的助手，您只需将代码库克隆后，在助手设置中将本项目的根目录指定为**自定义技能路径 (Custom Skill Path)**。Codex 会自动读取根目录下的 `SKILL.md` 并掌握如何调用该工具。

---

### 方式二：作为独立项目（本地开发/运行）

```bash
cd douyin_skill
npm install
npx playwright install chromium   # 首次必须，约 200MB
# Windows 还可以跑 setup.bat；macOS/Linux 跑 ./setup.sh
```

> 安装脚本会自动检测并安装 Google Chrome（Windows 用 winget 或直链，macOS 用 brew，Linux 用 apt/dnf）。脚本强制使用系统 Chrome，缺 Chrome 时会给出明确错误。

## 使用方法

### 单账号采集

```bash
node scripts/collect.mjs --account "https://www.douyin.com/user/MS4wLjABAAAA..."
```

**流程：**
1. 自动打开 Chrome 浏览器
2. 跳转到抖音首页，检测登录态（Cookie + localStorage）
3. 未登录时自动点击"登录"按钮弹出扫码框，请使用抖音 APP 扫码
4. 登录成功后跳转到目标创作者主页
5. 脚本通过网络响应拦截器实时捕获 `/aweme/v1/web/user/profile/other/` 与 `/aweme/v1/web/aweme/post/`
6. 模拟真人滚动触发分页（mouse.wheel + jitter scroll），自动去重
7. **upsert 写入 `outputs/Douyin_All_Data.xlsx`**（Summary + Videos 两个 sheet）
8. **自动刷新看板** —— 采集完成后脚本末尾自动 `node scripts/dashboard.mjs`
9. Cookie 保存到 `./private/profiles/douyin/`，下次直接复用免扫码

### 批量采集（按 Excel 人员分组）

```bash
node scripts/batch_collect.mjs
```

会读取项目根目录的 `账号监控_人员分组.xlsx`（`按人分组` 工作表），**顺序**逐个 `execSync` 调用 `collect.mjs` 并自动传入 `--person` 负责人。**绝对不要并发**——会触发抖音风控和浏览器多开卡死。

### 仅刷新看板

```bash
node scripts/dashboard.mjs
```

适用：手工编辑过 `config/team.json`、或外部修改了 `Douyin_All_Data.xlsx` 后想重新生成页面。

## 看板（3 类产出）

`dashboard.mjs` 读取 `outputs/Douyin_All_Data.xlsx` 并生成：

| 文件 | 内容 |
|------|------|
| `outputs/dashboard.html` | **全局总看板**：总账号数 / 已采集率 / 总粉丝 / 总赞 / 总评 / 视频类型分布 / 标签云 / 粉丝 / 赞 / 作品数 Top 榜 / 互动率榜 / 粉丝量分档 |
| `outputs/person_dashboards/<name>.html` | **个人看板**：每个负责人的 6 档视频分级（10/50/100/500/1000/1000+ 赞）+ 待维护判定（评论数 vs 目标评论数）+ 近 15 天优先 |
| `outputs/leader_dashboards/<name>.html` | **组长看板**：按 `config/team.json` 配置的层级聚合下级组长 / 组员数据 |

> **关键点**：所有 dashboard HTML 用 `<script>` 客户端从嵌入的 JSON 数据渲染（`d927e1d`），不再 base64 注入，避免 UTF-8 mojibake；体积更小、首屏更快。

### 视频分级与维护判定

| 点赞区间 | 维护目标评论数 |
|----------|----------------|
| < 10 赞 | ≥ 1 |
| < 50 赞 | ≥ 2 |
| < 100 赞 | ≥ 4 |
| < 500 赞 | ≥ 5 |
| < 1000 赞 | ≥ 10 |
| ≥ 1000 赞 | ≥ 15 |

低于目标即视为"待维护"。`isWithin15Days()` 额外标记"近 15 天内发布的待维护视频"为重点。

## 团队配置（`config/组织关系.txt`）

组长看板依赖团队组织架构。**v3.4+ 改了**：直接编辑纯文本 `config/组织关系.txt`，`dashboard.mjs` 会在每次启动时**自动**解析并写回 `config/team.json`。不再需要手动 `cp team.example.json`。

### `config/组织关系.txt` 格式

```
推广一部主管：梁景煜
推广一部一组→组长：王梦圆，组员：陈星羽、陈一诺、张晨旭、罗永乐
推广一部二组→组长：王楚楚，组员：朱怡雯
推广一部三组→组长：洪碧瑶，组员：李珊、潘梦营、季朝娣、朱一凡、安惠靖
```

- **第一行**：顶级主管（写一次 `XXX主管：姓名`）
- **后续每行**：一个小组，格式 `组名→组长：姓名，组员：姓名1、姓名2、姓名3`（分隔符支持 →/中英文逗号/顿号/空格）
- 解析后脚本会自动生成 `"总管大盘"` 顶级组，leader 是主管，members 是**所有组长**的并集（main() 用它递归聚合每个组长的组员数据）

### `config/team.json`（自动生成，**不要手改**）

脚本每次运行都会**重写**该文件（根据 `组织关系.txt` 重新生成）。新结构示例：

```json
{
  "teams": {
    "王梦圆": { "groupName": "推广一部一组", "members": ["陈星羽", "陈一诺", "张晨旭", "罗永乐"] },
    "王楚楚": { "groupName": "推广一部二组", "members": ["朱怡雯"] },
    "洪碧瑶": { "groupName": "推广一部三组", "members": ["李珊", "潘梦营", "季朝娣", "朱一凡", "安惠靖"] },
    "梁景煜": { "groupName": "总管大盘", "isTopLeader": true, "members": ["王梦圆", "王楚楚", "洪碧瑶"] }
  }
}
```

- **key 是组长姓名**（不是组名）—— 看板文件命名就是 `${组长姓名}.html`
- 小组：`{ groupName: 组名, members: [组员] }`
- 总管大盘：`{ groupName: "总管大盘", isTopLeader: true, members: [所有组长] }`
- `组织关系.txt` **存在** → 优先用它，每次覆盖写 `team.json`
- `组织关系.txt` **不存在** → 退回读旧的 `config/team.json`（兜底兼容）
- 都不存在 → 跳过组长看板，全局/个人看板仍正常生成

> ⚠️ 如果你的团队架构是固定写死的（不想每次 dashboard 运行时被覆盖），直接编辑 `config/team.json` 并**删除** `config/组织关系.txt`，脚本会退回读 team.json。

## 参数说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--account` | 抖音主页 URL 或 `sec_user_id`（必填） | — |
| `--profile` | 浏览器配置文件目录（持久化登录态） | `./private/profiles/douyin` |
| `--limit` | 最多采集视频数量 | `200` |
| `--delay` | 滚动间隔等待新响应的最大毫秒数 | `2000` |
| `--person` | 负责人姓名，写入 Excel 行内做归人字段（`batch_collect.mjs` 会自动传入） | （空） |
| `--relogin` | 清除已保存的登录态强制重新扫码 | `false` |

> v3.4 已彻底移除 `--cookie` / `--no-browser` / `--browser` / `--out`。采集必须通过浏览器拦截器进行——这是它能稳定绕过风控的根本原因。**所有数据集中写入 `outputs/Douyin_All_Data.xlsx`**，不再有"按账号独立输出目录"的概念。

## Account 格式

支持以下三种格式：

```
# 完整 URL
https://www.douyin.com/user/MS4wLjABAAAA...

# 原始 sec_user_id（以 MS4wLjABAAAA 开头）
MS4wLjABAAAA...

# 纯数字 ID（长度 > 20 且不含 / 和 .）
7123456789012345678
```

## 浏览器登录详细步骤

1. **运行命令**
   ```bash
   node scripts/collect.mjs --account "抖音用户URL"
   ```

2. **浏览器自动打开**，访问抖音首页

3. **自动检测登录态**
   - 检查 cookies（`sessionid` / `sid_guard` / `LOGIN_STATUS=1`）
   - 检查 `localStorage.HasUserLogin === "1"`
   - 三者任一命中即认为已登录

4. **若未登录**：自动点击页面上的"登录"按钮弹出二维码

5. **扫码登录**（最长等待 10 分钟）：使用抖音 APP 扫描浏览器中的二维码

6. **自动进入采集**：检测到登录态后，导航到目标主页 → 启动滚动循环

7. **下次运行**：复用持久化配置文件，免扫码

## 输出格式（v3.4：集中 Excel）

所有数据写入 `outputs/Douyin_All_Data.xlsx`，包含两个 sheet。

### Summary sheet

每行一个账号：

| 列 | 含义 |
|------|------|
| `person` | 负责人（来自 `--person` / `batch_collect.mjs`） |
| `id` | sec_user_id |
| `name` | 创作者昵称 |
| `platform` | `douyin` |
| `followers` | 粉丝数 |
| `videoCount` | 视频总数（API 返回） |
| `totalLikes` | 获赞总数 |
| `totalComments` | 已采集视频的评论合计 |
| `url` | 主页 URL |
| `fetchedAt` | 采集时间（ISO 8601） |

> 注意：v3.2+ 移除了 `views` / `totalViews` 字段——抖音对部分账号 `play_count=0`（隐藏播放量），统计失真。如需播放量请直接走 `https://www.douyin.com/video/<aweme_id>` 页面。

### Videos sheet

每行一个视频：

| 列 | 含义 |
|------|------|
| `person` | 负责人 |
| `account_name` | 创作者昵称 |
| `account_id` | sec_user_id |
| `id` | 视频 `aweme_id` |
| `type` | 内容类型：`video`（视频）/ `image_text`（图文，aweme_type 2 或 68）/ `live_replay`（直播回放，aweme_type 61）/ `live`（直播切片，aweme_type 51） |
| `title` | 视频描述/标题 |
| `url` | 视频页面 URL |
| `publishedAt` | 发布时间（+08:00） |
| `duration` | 时长（MM:SS），仅视频有效；图文/直播为空字符串 |
| `isTop` | 是否为置顶帖（1 / 0） |
| `likes` | 点赞数 |
| `comments` | 评论数 |
| `shares` | 分享数 |
| `favorites` | 收藏数 |
| `tags` | 话题/标签名（空格分隔） |
| `musicTitle` | 背景音乐标题 |

### Excel 写入策略

- **upsert**：以 `id`（Summary） / `account_id+id`（Videos）为键更新已有行；新行追加到末尾
- **全局排序**：Summary 按 person → followers desc；Videos 按 person → account_name → publishedAt desc
- **原子重命名**：先写 `Douyin_All_Data.xlsx.tmp.xlsx` → 备份当前文件为 `.bak` → 原子 `rename`
- **EBUSY 无限重试**：Excel 进程占用时每 5 秒提示一次"请关闭 Excel"，不放弃、不报错
- **视频合并**（`2820f8f`）：再次采集时**不会**覆盖历史未抓到的视频行，只更新已有 `aweme_id` 的指标

## 技术实现

- **浏览器自动化**：Playwright + playwright-extra（Stealth 隐身模式防爬检测）
- **采集机制**：API Interceptor —— 通过 `page.on('response')` 监听并解析浏览器原生发出的 API 响应，**完全绕过本地 a_bogus / msToken 签名**，避免签名失效与风控拦截
- **数据滚动**：`page.mouse.wheel()` 模拟真人滚轮 + 失败回合的 jitter scroll（上滚回弹再下滚）触发懒加载
- **登录持久化**：浏览器配置文件 + LocalStorage 特征自动保存，下次免扫码登录
- **终止条件**：服务器 `has_more=false` / 达到 `--limit` / 连续 8 轮滚动无新响应
- **看板渲染**：客户端从嵌入的 JSON 渲染（`d927e1d`），解决 base64 注入 mojibake 问题（`c1c6b77`）
- **看板模板修复**：修正 HTML 生成中转义模板字面量导致的空看板问题（`092b7cf`）

## 斜杠命令（Claude Code）

项目已注册 `/douyin_skill` 自定义命令（见 `.claude/commands/douyin_skill.md`）：

```
/douyin_skill MS4wLjABAAAA...                       # 默认 200 条
/douyin_skill MS4wLjABAAAA... --limit 50            # 限量 50 条
/douyin_skill MS4wLjABAAAA... --delay 5000 --limit 100
```

Claude 会自动 `cd` 到本项目运行 `node scripts/collect.mjs`，并在完成后总结结果。

## 常见问题

### 1. 首次运行提示缺少依赖

```
Cannot find package 'playwright-extra'
```

**解决**：
```bash
npm install
npx playwright install chromium
```

### 2. 报"Failed to capture user profile from network responses"

通常是**登录态失效**或目标账号已被限制。解决（两种方式二选一）：

```bash
# 方式一：使用 --relogin 标志（v3.4 推荐，会自动清理登录态并强制重扫码）
node scripts/collect.mjs --account "..." --relogin

# 方式二：手动删除登录态目录
rm -rf ./private/profiles/douyin
node scripts/collect.mjs --account "..."
```
重新扫码登录。

### 3. 滚动很久但视频数量不增长

抖音对低频账号或新号偶发返回 `has_more=false`。脚本会在**连续 8 轮无新数据**后自动停止，是预期行为。检查 Excel 的 `Summary` sheet `videoCount` 与 `Videos` sheet 该账号行数是否一致：
- 一致 → 该账号视频已采全
- 不一致 → 风控介入，建议增加 `--delay 5000` 或更换网络环境重试

### 4. 滑动验证码 / 拼图

页面出现验证码时，**人工在浏览器里完成验证**，脚本会继续。不要关闭窗口。

### 5. 多账号管理 / 切换账号

**独立 Profile 目录**（推荐）：
```bash
node scripts/collect.mjs --account "账号1URL" --profile ./private/profiles/account1
node scripts/collect.mjs --account "账号2URL" --profile ./private/profiles/account2
```

**在同一 Profile 中切换账号**（强制当前账号退出并重新扫码）：
```bash
node scripts/collect.mjs --account "新账号URL" --relogin
```

### 6. 浏览器一闪而过 / 立刻报错

确认本机已安装 Chrome（脚本配置 `channel: "chrome"`）。如果只有 Chromium：删除 `buildBrowserOptions()` 中 `channel: "chrome"` 一行，或安装 Chrome 浏览器。

### 7. Excel 写入卡住"请关闭 Excel"

`Douyin_All_Data.xlsx` 正在被 Office 占用。脚本会**无限**重试（每 5 秒一次），关闭 Excel 后自动恢复。不想等可以 `Ctrl+C` 中断。

### 8. 看板缺"组长看板"

未配置团队架构。**v3.4+ 改用纯文本配置**：
```bash
# 编辑 config/组织关系.txt（参考上方"团队配置"章节的格式）
# 下一跑 dashboard.mjs 时会自动解析并生成 config/team.json
```

### 9. 历史版本遗留工具 `organize_outputs.mjs`

`scripts/organize_outputs.mjs` 在 v3.4 已**失效**——它依赖 `outputs/<昵称>/summary.json` 这种独立目录结构，但 v3.4 数据全部进 Excel。**不要再跑这个脚本**。

## 文件说明

```
douyin_skill/
├── SKILL.md                          # 本文档
├── README.md                         # 项目说明
├── EXAMPLES.md                       # 使用示例
├── CHANGELOG.md                      # 版本历史
├── package.json
├── install.ps1 / install.sh          # 全局安装脚本（方式一）
├── setup.bat / setup.sh              # 本地依赖安装脚本（方式二）
├── config/
│   ├── 组织关系.txt                  # 团队组织架构（用户编辑源，dashboard.mjs 启动时自动解析）
│   ├── team.example.json             # 旧版 JSON 模板（仅作参考，新版用 组织关系.txt）
│   └── team.json                     # 自动生成的 JSON（不要手改；删除 组织关系.txt 才用得到）
├── .claude/
│   └── commands/
│       └── douyin_skill.md           # /douyin_skill 斜杠命令定义
├── private/profiles/douyin/          # 浏览器登录态（自动生成，git 忽略）
├── outputs/                          # 采集结果（自动生成，git 忽略）
│   ├── Douyin_All_Data.xlsx          # 【主数据源】集中式 Excel
│   ├── dashboard.html                # 全局看板
│   ├── person_dashboards/            # 个人看板（按负责人）
│   └── leader_dashboards/            # 组长看板（按 team.json 层级）
├── 账号监控_人员分组.xlsx             # 批采 / 看板用配置（gitignored）
└── scripts/
    ├── collect.mjs                   # v3.4 主入口（拦截器 + Excel 写入 + 自动 dashboard）
    ├── batch_collect.mjs             # Excel 批采入口
    ├── dashboard.mjs                 # 三级看板生成器
    ├── organize_outputs.mjs          # 【v3.4 失效】历史归位脚本，勿跑
    ├── migrate_to_excel.mjs          # 历史数据一次性迁移到 Excel（可选）
    ├── dashboard_backup.mjs          # dashboard.mjs 的历史备份
    └── adapters/
        ├── stealth.min.js            # 反检测注入脚本
        ├── douyin.mjs                # 旧版 HTTP 适配器（v2.x，已不被 collect.mjs 引用，保留供参考）
        └── douyin-sign.js            # a_bogus 签名库（v1.x，已不被使用）
```

## 依赖

- `playwright` (^1.60.0)
- `playwright-extra` (^4.3.6)
- `puppeteer-extra-plugin-stealth` (^2.11.2)
- `xlsx` (^0.18.5)
