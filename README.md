# douyin-skill

> 抖音创作者数据采集工具 · v3.4 · 浏览器原生网络拦截，无需 API 签名

**无需破解，无需 Cookie 手动导入** — 工具通过 Playwright 控制真实浏览器，监听抖音自身前端发出的 API 请求，解析后统一写入 Excel 并自动刷新三级监控看板。

---

## 方式一：全局安装（推荐）

安装后在**任意 Claude Code Workspace** 中都可以直接使用 `/douyin_skill` 命令。

### Windows（在 Claude Code 终端运行）

```powershell
powershell -ExecutionPolicy Bypass -Command "& { iwr https://raw.githubusercontent.com/Yym11345/douyin_skill/master/install.ps1 -OutFile $env:TEMP\install_dy.ps1; & $env:TEMP\install_dy.ps1 }"
```

### macOS / Linux（在 Claude Code 终端运行）

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Yym11345/douyin_skill/master/install.sh)
```

安装完成后，在当前 Workspace 直接输入：

```
/douyin_skill https://www.douyin.com/user/MS4wLjABAAAA...
```

---

## 方式二：作为独立项目使用

### Windows

```bat
git clone https://github.com/Yym11345/douyin_skill.git
cd douyin_skill
setup.bat
```

### macOS / Linux

```bash
git clone https://github.com/Yym11345/douyin_skill.git
cd douyin_skill
chmod +x setup.sh && ./setup.sh
```

> **前提**：[Node.js 18+](https://nodejs.org/) 已安装；[Google Chrome](https://www.google.com/chrome/)（安装脚本会自动安装）。

---

## 采集

```bash
# 单账号采集（最常见）
node scripts/collect.mjs --account "https://www.douyin.com/user/MS4wLjABAAAA..." --person "负责人姓名"

# 批量采集（读取 账号监控_人员分组.xlsx）
node scripts/batch_collect.mjs

# 仅刷新看板
node scripts/dashboard.mjs
```

**首次运行**会打开浏览器窗口，用抖音 App 扫码登录。登录状态保存到本地，之后运行无需再次扫码。

---

## 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--account` | 抖音主页 URL 或 sec_user_id（**必填**） | — |
| `--person` | 负责人姓名，写入 Excel 归人字段 | （空） |
| `--limit` | 最多采集多少条视频 | `200` |
| `--delay` | 每轮滚动等待响应的最长毫秒数 | `2000` |
| `--profile` | 浏览器 Profile 目录（保存登录状态） | `./private/profiles/douyin` |
| `--relogin` | 清除已保存登录态，强制重新扫码 | `false` |

---

## 输出（集中式 Excel + 三级 HTML 看板）

所有数据统一写入 `outputs/Douyin_All_Data.xlsx`，并自动生成 HTML 看板：

```
outputs/
├── Douyin_All_Data.xlsx          # 主数据源（Summary + Videos 两个 sheet）
├── dashboard.html                 # 全局总看板
├── person_dashboards/<name>.html  # 个人监控看板（每位负责人）
└── leader_dashboards/<name>.html  # 组长看板（需配置 config/组织关系.txt）
```

### Summary sheet（每行一个账号）

| 列 | 含义 |
|------|------|
| `person` | 负责人 |
| `name` | 创作者昵称 |
| `followers` | 粉丝数 |
| `videoCount` | 视频总数 |
| `totalLikes` | 获赞总数 |
| `fetchedAt` | 采集时间 |

### Videos sheet（每行一个视频）

| 列 | 含义 |
|------|------|
| `person` / `account_name` | 归属 |
| `id` | 视频 aweme_id |
| `type` | video / image_text / live_replay / live |
| `title` | 视频标题 |
| `url` | 视频链接 |
| `publishedAt` | 发布时间 |
| `likes` / `comments` / `shares` / `favorites` | 互动数据 |
| `tags` | 话题标签 |

---

## 团队看板配置

创建 `config/组织关系.txt`，格式如下：

```
推广一部主管：梁景煜
推广一部一组→组长：王梦圆，组员：陈星羽、陈一诺、张晨旭
推广一部二组→组长：王楚楚，组员：朱怡雯
```

下次运行 `node scripts/dashboard.mjs` 时，系统自动解析并生成组长专属看板。

---

## 常见问题

### 首次运行提示「请扫码登录」
正常现象。打开的浏览器窗口里扫码，登录状态自动保存。

### 出现滑动验证码
**不要关闭浏览器**，手动完成验证后脚本自动继续。

### 登录失效 / 无数据抓取
```bash
node scripts/collect.mjs --account "..." --relogin
```

### Excel 卡住提示「请关闭 Excel」
关闭正在打开 `outputs/Douyin_All_Data.xlsx` 的 Office 进程，脚本每 5 秒自动重试。

### 缺少组长看板
编辑 `config/组织关系.txt` 并重新运行 `node scripts/dashboard.mjs`。

### 没有安装 Google Chrome
运行 `install.ps1`（Windows）或 `install.sh`（macOS/Linux），脚本会自动安装。

---

## 系统要求

- Node.js ≥ 18
- Google Chrome（必需，提供真实 TLS 指纹）
- Windows 10/11 · macOS 12+ · Ubuntu 20.04+
- 内存 ≥ 2 GB
- 网络能访问 douyin.com

---

## 工作原理

```
Playwright Chrome
   │
   ├─ 打开 douyin.com，检测 Cookie / localStorage 登录状态
   ├─ 未登录 → 自动弹出登录框 → 扫码
   │
   ├─ 导航到目标创作者主页
   ├─ page.on('response') 监听 API：
   │    /aweme/v1/web/user/profile/other/  → 账号信息
   │    /aweme/v1/web/aweme/post/          → 视频列表（18条/页）
   │
   ├─ page.mouse.wheel() 模拟真实鼠标滚动触发懒加载
   └─ has_more=false 或达到 --limit → 停止 → 写入 Excel → 刷新看板
```

---

## 项目结构

```
douyin_skill/
├── SKILL.md                          # AI 助手技能描述（核心）
├── README.md                         # 本文档
├── EXAMPLES.md                       # 使用示例
├── CHANGELOG.md                      # 版本历史
├── package.json                      # v3.4.0
├── install.ps1 / install.sh          # 全局安装脚本
├── setup.bat / setup.sh              # 本地依赖安装
├── config/
│   ├── 组织关系.txt                  # 团队架构（用户编辑）
│   ├── team.json                     # 自动生成，勿手改
│   └── team.example.json             # 格式参考
├── scripts/
│   ├── collect.mjs                   # 主采集脚本
│   ├── batch_collect.mjs             # 批量采集入口
│   ├── dashboard.mjs                 # 三级看板生成器
│   └── adapters/                     # 反检测和兼容层
├── outputs/                          # 采集结果（gitignored）
└── private/                          # 浏览器登录态（gitignored）
```

---

## 免责声明

使用本项目前，请仔细阅读 [DISCLAIMER.md](./DISCLAIMER.md)。
本项目仅供学术研究、个人技术交流及合规运营分析使用，严禁用于商业牟利、非法数据转售或恶意攻击。

## License

Educational use only.
