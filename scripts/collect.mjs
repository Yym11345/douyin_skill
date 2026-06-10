#!/usr/bin/env node
/**
 * douyin_skill v3.4 — Playwright API Interceptor
 *
 * 这是一个完全基于浏览器网络拦截的数据采集方案：
 * 1. 启动 Playwright 浏览器（复用本地 Cookie）
 * 2. 导航到目标创作者的主页
 * 3. 监听网络响应，实时捕获并解析 `/aweme/v1/web/user/profile/other/` 和 `/aweme/v1/web/aweme/post/`
 * 4. 模拟人工滚动页面，自动触发抖音官方前端的分页请求
 * 5. 将抓取到的数据 upsert 写入 outputs/Douyin_All_Data.xlsx（Summary + Videos 两个 sheet）
 *    并自动刷新三级监控看板（全局/个人/组长）
 *
 * 优势：
 * - 100% 绕过 a_bogus / msToken 签名校验
 * - 使用真实浏览器的 HTTP/2 握手与 TLS 特征，极难被风控拦截
 * - 支持扫码登录与验证码登录，并且断线可重连，出现滑动验证码时可人工交互解决
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { openDb, upsertAccount, upsertVideos } from "./db.mjs";

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Helper: find existing output directory for a given sec_user_id ──────────
// Recursively scans all summary.json files in the given base directory.
function findExistingAccountDir(baseDir, targetSecUserId) {
  if (!existsSync(baseDir)) return null;
  try {
    const entries = readdirSync(baseDir);
    for (const entry of entries) {
      const fullPath = join(baseDir, entry);
      let stat;
      try { stat = statSync(fullPath); } catch { continue; }
      if (!stat.isDirectory()) continue;
      const summaryPath = join(fullPath, "summary.json");
      if (existsSync(summaryPath)) {
        try {
          const data = JSON.parse(readFileSync(summaryPath, "utf8"));
          if (data.id === targetSecUserId) return fullPath;
        } catch { /* ignore parse errors */ }
      }
      // Recurse one level deeper
      const nested = findExistingAccountDir(fullPath, targetSecUserId);
      if (nested) return nested;
    }
  } catch { /* ignore read errors */ }
  return null;
}

// ── Browser Setup ─────────────────────────────────────────────────────

async function loadPlaywright() {
  try {
    const { chromium } = await import("playwright-extra");
    const StealthModule = await import("puppeteer-extra-plugin-stealth");
    const StealthPlugin = StealthModule.default || StealthModule;
    chromium.use(StealthPlugin());
    return { chromium };
  } catch (error) {
    const { chromium } = await import("playwright");
    return { chromium };
  }
}

function buildBrowserOptions() {
  return {
    acceptDownloads: true,
    // Force system Google Chrome for authentic TLS fingerprint and lower risk-control detection.
    // Playwright Chromium is NOT used — its fingerprint is more easily identified by Douyin.
    channel: "chrome",
    headless: false,
    viewport: { width: 1280, height: 800 },
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
      "--no-sandbox",
      "--lang=zh-CN",
    ],
  };
}

// ── Helper Functions ──────────────────────────────────────────────────

function extractSecUserId(account) {
  const text = String(account);
  if (text.startsWith("MS4wLjABAAAA")) return text;
  const match = text.match(/douyin\.com\/user\/([^/?]+)/);
  if (match) return match[1];
  if (!text.includes("/") && !text.includes(".") && text.length > 20) return text;
  throw new Error("Could not extract sec_user_id from account.");
}

async function hasDouyinLogin(page, context) {
  try {
    const cookies = await context.cookies();
    const cookieDict = {};
    for (const c of cookies) {
      cookieDict[c.name] = c.value;
    }
    
    // Check key cookies
    if (cookieDict.sessionid || cookieDict.sid_guard || cookieDict.LOGIN_STATUS === "1") {
      return true;
    }
    
    // Check localStorage
    const hasLogin = await page.evaluate(() => window.localStorage.getItem("HasUserLogin"));
    if (hasLogin === "1") {
      return true;
    }
  } catch (e) {
    // Ignore context or page detachment errors during load
  }
  return false;
}

async function waitForLogin(page, context, timeout = 600000) {
  console.log("[Browser] Checking login status...");
  if (await hasDouyinLogin(page, context)) {
    console.log("[Browser] Login detected!");
    return true;
  }
  
  // If not logged in, wait 3 seconds for page JS to settle, then try to pop up the login dialog
  await page.waitForTimeout(3000);
  if (!(await hasDouyinLogin(page, context))) {
    try {
      const dialog = page.locator("xpath=//div[@id='login-panel-new']");
      if (!(await dialog.isVisible())) {
        console.log("[Browser] Triggering login dialog...");
        const loginSelectors = [
          "p:has-text('登录')",
          "button:has-text('登录')",
          "div:has-text('登录')",
          "text=登录",
          "xpath=//p[text()='登录']"
        ];
        for (const selector of loginSelectors) {
          try {
            const btn = page.locator(selector).first();
            if (await btn.isVisible()) {
              await btn.click();
              console.log(`[Browser] Clicked login button with selector: ${selector}`);
              break;
            }
          } catch (e) {
            // Ignore individual selector errors
          }
        }
      }
    } catch (err) {
      console.warn(`[Browser] Failed to auto-trigger login popup: ${err.message}`);
    }
  }

  console.log("[Browser] Please scan QR code in the browser window to login.");
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await hasDouyinLogin(page, context)) {
      console.log("[Browser] Login detected!");
      return true;
    }
    await page.waitForTimeout(1000);
  }
  throw new Error("Login timeout. Please scan QR code in the browser.");
}

function toIso(ts) {
  if (!ts) return "";
  const ms = Number(ts) * 1000;
  return new Date(ms + 8 * 3600 * 1000).toISOString().replace(".000Z", "+08:00");
}

function formatDuration(ms) {
  if (!ms) return "";
  // Douyin API returns duration in milliseconds
  const s = Math.round(Number(ms) / 1000);
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

// ── HTML Report Generator ─────────────────────────────────────────────

function fmt(n) {
  const num = Number(n) || 0;
  if (num >= 100000000) return (num / 100000000).toFixed(1) + "亿";
  if (num >= 10000) return (num / 10000).toFixed(1) + "万";
  return num.toLocaleString("zh-CN");
}

function generateHtmlReport(summary, videos, userInfo) {
  const avatar = userInfo.avatar_larger?.url_list?.[0] || userInfo.avatar_medium?.url_list?.[0] || "";
  const signature = userInfo.signature || "";
  const fetchedAt = new Date(summary.fetchedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });

  const videoRows = videos.map((v, i) => {
    const date = v.publishedAt ? v.publishedAt.slice(0, 10) : "—";
    const title = String(v.title || "").replace(/</g, "&lt;").replace(/>/g, "&gt;") || `(无标题)`;
    return `
    <tr>
      <td class="rank">${i + 1}</td>
      <td class="title-cell"><a href="${v.url}" target="_blank" title="${title}">${title}</a></td>
      <td>${date}</td>
      <td>${v.duration || "—"}</td>
      <td class="num">${fmt(v.likes)}</td>
      <td class="num">${fmt(v.comments)}</td>
      <td class="num">${fmt(v.shares)}</td>
      <td class="num">${fmt(v.favorites)}</td>
    </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${summary.name} — 抖音数据报告</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #0d0f14;
      --surface: #161b25;
      --surface2: #1e2535;
      --border: #2a3246;
      --accent: #fe2c55;
      --accent2: #25f4ee;
      --text: #e8eaf0;
      --muted: #7a85a0;
      --card-shadow: 0 4px 24px rgba(0,0,0,.45);
    }

    body {
      font-family: 'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
    }

    /* ── Header ── */
    .header {
      background: linear-gradient(135deg, #0d0f14 0%, #161b25 100%);
      border-bottom: 1px solid var(--border);
      padding: 32px 48px;
    }
    .header-inner {
      max-width: 1200px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      gap: 28px;
    }
    .avatar {
      width: 88px;
      height: 88px;
      border-radius: 50%;
      border: 3px solid var(--accent);
      object-fit: cover;
      flex-shrink: 0;
      background: var(--surface2);
    }
    .avatar-placeholder {
      width: 88px; height: 88px;
      border-radius: 50%;
      border: 3px solid var(--accent);
      background: linear-gradient(135deg, var(--accent), #ff6b35);
      display: flex; align-items: center; justify-content: center;
      font-size: 36px; flex-shrink: 0;
    }
    .profile-info { flex: 1; }
    .profile-name {
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -.5px;
      margin-bottom: 6px;
    }
    .profile-sig {
      color: var(--muted);
      font-size: 14px;
      margin-bottom: 8px;
      line-height: 1.5;
      max-width: 600px;
    }
    .profile-url a {
      color: var(--accent2);
      font-size: 13px;
      text-decoration: none;
    }
    .profile-url a:hover { text-decoration: underline; }
    .header-meta {
      text-align: right;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.8;
    }
    .platform-badge {
      display: inline-block;
      background: linear-gradient(135deg, var(--accent), #ff6b35);
      color: #fff;
      font-size: 11px;
      font-weight: 600;
      padding: 3px 10px;
      border-radius: 20px;
      letter-spacing: 1px;
      margin-bottom: 6px;
    }

    /* ── Stats Cards ── */
    .stats-grid {
      max-width: 1200px;
      margin: 32px auto;
      padding: 0 48px;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
    }
    .stat-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px 20px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      position: relative;
      overflow: hidden;
      transition: transform .2s, border-color .2s;
    }
    .stat-card:hover { transform: translateY(-2px); border-color: var(--accent); }
    .stat-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 3px;
      background: linear-gradient(90deg, var(--accent), var(--accent2));
    }
    .stat-icon { font-size: 24px; margin-bottom: 4px; }
    .stat-label { color: var(--muted); font-size: 13px; font-weight: 500; }
    .stat-value { font-size: 32px; font-weight: 700; letter-spacing: -1px; }
    .stat-sub { color: var(--muted); font-size: 12px; }

    /* ── Table Section ── */
    .table-section {
      max-width: 1200px;
      margin: 0 auto 48px;
      padding: 0 48px;
    }
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    .section-title {
      font-size: 18px;
      font-weight: 600;
    }
    .search-box {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px 14px;
      color: var(--text);
      font-size: 13px;
      outline: none;
      width: 220px;
      transition: border-color .2s;
    }
    .search-box:focus { border-color: var(--accent); }
    .search-box::placeholder { color: var(--muted); }

    .table-wrap {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      overflow: hidden;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    thead { background: var(--surface2); }
    th {
      padding: 14px 12px;
      text-align: left;
      color: var(--muted);
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: .5px;
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
    }
    th:hover { color: var(--text); }
    th.sorted { color: var(--accent); }
    th .sort-icon { margin-left: 4px; opacity: .5; }
    th.sorted .sort-icon { opacity: 1; }
    td {
      padding: 12px 12px;
      border-top: 1px solid var(--border);
      vertical-align: middle;
    }
    tr:hover td { background: var(--surface2); }
    .rank { color: var(--muted); font-size: 12px; width: 36px; text-align: center; }
    .title-cell { max-width: 360px; }
    .title-cell a {
      color: var(--text);
      text-decoration: none;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      line-height: 1.4;
    }
    .title-cell a:hover { color: var(--accent); }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .hidden { display: none; }

    /* ── Footer ── */
    .footer {
      text-align: center;
      color: var(--muted);
      font-size: 12px;
      padding: 24px;
      border-top: 1px solid var(--border);
    }

    /* ── Responsive ── */
    @media (max-width: 900px) {
      .header, .stats-grid, .table-section { padding: 0 20px; }
      .header { padding: 24px 20px; }
      .stats-grid { grid-template-columns: repeat(2, 1fr); }
      .stat-value { font-size: 24px; }
    }
    @media (max-width: 600px) {
      .header-inner { flex-wrap: wrap; }
      .stats-grid { grid-template-columns: 1fr 1fr; }
    }
  </style>
</head>
<body>

<!-- Header -->
<div class="header">
  <div class="header-inner">
    ${avatar
      ? `<img class="avatar" src="${avatar}" alt="${summary.name}" onerror="this.style.display='none'" />`
      : `<div class="avatar-placeholder">🎬</div>`
    }
    <div class="profile-info">
      <div class="platform-badge">📱 DOUYIN</div>
      <div class="profile-name">${summary.name}</div>
      ${signature ? `<div class="profile-sig">${signature.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>` : ""}
      <div class="profile-url"><a href="${summary.url}" target="_blank">${summary.url}</a></div>
    </div>
    <div class="header-meta">
      <div>采集时间</div>
      <div>${fetchedAt}</div>
      <div style="margin-top:8px">采集视频</div>
      <div style="color:var(--accent);font-weight:700;font-size:18px">${videos.length} / ${summary.videoCount}</div>
    </div>
  </div>
</div>

<!-- Stats -->
<div class="stats-grid">
  <div class="stat-card">
    <div class="stat-icon">👥</div>
    <div class="stat-label">粉丝数</div>
    <div class="stat-value">${fmt(summary.followers)}</div>
    <div class="stat-sub">${Number(summary.followers).toLocaleString("zh-CN")} 人</div>
  </div>
  <div class="stat-card">
    <div class="stat-icon">🎬</div>
    <div class="stat-label">视频总数</div>
    <div class="stat-value">${summary.videoCount}</div>
    <div class="stat-sub">已采集 ${videos.length} 个</div>
  </div>
  <div class="stat-card">
    <div class="stat-icon">❤️</div>
    <div class="stat-label">获赞总数</div>
    <div class="stat-value">${fmt(summary.totalLikes)}</div>
    <div class="stat-sub">${Number(summary.totalLikes).toLocaleString("zh-CN")} 次</div>
  </div>
  <div class="stat-card">
    <div class="stat-icon">💬</div>
    <div class="stat-label">评论总数</div>
    <div class="stat-value">${fmt(summary.totalComments)}</div>
    <div class="stat-sub">已采集视频合计</div>
  </div>
</div>

<!-- Video Table -->
<div class="table-section">
  <div class="section-header">
    <div class="section-title">📋 视频列表（共 ${videos.length} 条）</div>
    <input class="search-box" id="searchInput" type="text" placeholder="🔍 搜索标题…" oninput="filterTable()" />
  </div>
  <div class="table-wrap">
    <table id="videoTable">
      <thead>
        <tr>
          <th>#</th>
          <th onclick="sortTable(1)">标题 <span class="sort-icon">⇅</span></th>
          <th onclick="sortTable(2)">发布日期 <span class="sort-icon">⇅</span></th>
          <th onclick="sortTable(3)">时长 <span class="sort-icon">⇅</span></th>
          <th onclick="sortTable(4)" class="num">点赞 <span class="sort-icon">⇅</span></th>
          <th onclick="sortTable(5)" class="num">评论 <span class="sort-icon">⇅</span></th>
          <th onclick="sortTable(6)" class="num">分享 <span class="sort-icon">⇅</span></th>
          <th onclick="sortTable(7)" class="num">收藏 <span class="sort-icon">⇅</span></th>
        </tr>
      </thead>
      <tbody id="tableBody">
        ${videoRows}
      </tbody>
    </table>
  </div>
</div>

<div class="footer">douyin_skill v3.2 &nbsp;·&nbsp; 采集时间：${fetchedAt}</div>

<script>
  // Search
  function filterTable() {
    const q = document.getElementById('searchInput').value.toLowerCase();
    document.querySelectorAll('#tableBody tr').forEach(row => {
      row.classList.toggle('hidden', !row.cells[1].textContent.toLowerCase().includes(q));
    });
  }

  // Sort
  let sortCol = -1, sortAsc = true;
  const rawData = ${JSON.stringify(videos)};

  function fmt(n) {
    return Number(n) || 0;
  }

  function sortTable(col) {
    const headers = document.querySelectorAll('thead th');
    headers.forEach((th, i) => {
      th.classList.toggle('sorted', i === col);
    });
    if (sortCol === col) sortAsc = !sortAsc;
    else { sortCol = col; sortAsc = false; }

    const colKeys = [null, 'title', 'publishedAt', 'duration', 'likes', 'comments', 'shares', 'favorites'];
    const key = colKeys[col];
    const sorted = [...rawData].sort((a, b) => {
      let av = a[key], bv = b[key];
      if (typeof av === 'number') return sortAsc ? av - bv : bv - av;
      av = String(av || ''); bv = String(bv || '');
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    });

    const fmtNum = (n) => {
      const num = Number(n) || 0;
      if (num >= 100000000) return (num/100000000).toFixed(1)+'亿';
      if (num >= 10000) return (num/10000).toFixed(1)+'万';
      return num.toLocaleString('zh-CN');
    };

    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = sorted.map((v, i) => {
      const date = v.publishedAt ? v.publishedAt.slice(0,10) : '—';
      const title = String(v.title||'').replace(/</g,'&lt;').replace(/>/g,'&gt;') || '(无标题)';
      return \`<tr>
        <td class="rank">\${i+1}</td>
        <td class="title-cell"><a href="\${v.url}" target="_blank" title="\${title}">\${title}</a></td>
        <td>\${date}</td>
        <td>\${v.duration||'—'}</td>
        <td class="num">\${fmtNum(v.likes)}</td>
        <td class="num">\${fmtNum(v.comments)}</td>
        <td class="num">\${fmtNum(v.shares)}</td>
        <td class="num">\${fmtNum(v.favorites)}</td>
      </tr>\`;
    }).join('');
  }
</script>
</body>
</html>`;
}

// ── Main ──────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      args[key] = val;
    }
  }
  return args;
}

const args = parseArgs(process.argv);

if (!args.account) {
  console.error("Error: --account is required");
  console.error("\nUsage:");
  console.error("  node scripts/collect.mjs --account https://www.douyin.com/user/MS4wLjABAAAA...");
  console.error("\nOptions:");
  console.error("  --account   Douyin profile URL or sec_user_id (required)");
  console.error("  --profile   Browser profile directory (default: ./private/profiles/douyin)");
  console.error("  --limit     Max videos to fetch (default: 200)");
  console.error("  --delay     Request interval/scroll delay in ms (default: 2000)");
  console.error("  --out       Output directory (default: ./outputs/<account_id>)");
  console.error("  --relogin   Clear saved login and force QR scan again");
  console.error("");
  console.error("切换抖音账号：");
  console.error("  --relogin                          重新扫码（当前账号退出并重新登录）");
  console.error("  --profile ./private/profiles/B    使用独立 profile，互不干扰");
  process.exit(1);
}

// Sanitize a string for use as a directory name (Windows + Unix safe)
function sanitizeName(name) {
  return String(name)
    .replace(/[\\/:*?"<>|]/g, "")   // strip Windows-forbidden chars
    .replace(/\s+/g, "_")           // spaces → underscore
    .replace(/\.+$/g, "")           // no trailing dots
    .slice(0, 60)                    // max length
    .trim() || "unknown";
}

(async () => {
  const secUserId = extractSecUserId(args.account);
  const defaultProfile = join(homedir(), ".douyin_skill", "profiles", "douyin");
  const profileDir = args.profile || defaultProfile;
  const limit = args.limit ? parseInt(args.limit, 10) : 200;
  const delay = args.delay ? parseInt(args.delay, 10) : 2000;
  // outDir is let so we can update it to the creator's nickname after capture
  let outDir = args.out || null;  // null = auto-detect from nickname

  console.log(`[douyin_skill v3.2] Collecting account: ${secUserId}`);
  console.log(`[douyin_skill v3.2] Mode: Playwright API Interceptor`);
  console.log(`[douyin_skill v3.2] limit=${limit}, delay=${delay}ms`);

  // --relogin: wipe the saved browser profile to force a fresh QR scan
  if (args.relogin) {
    console.log(`[Browser] --relogin: clearing saved login state at ${profileDir}...`);
    await rm(profileDir, { recursive: true, force: true });
    console.log("[Browser] Login state cleared. You will need to scan the QR code again.");
  }

  await mkdir(profileDir, { recursive: true });

  const { chromium } = await loadPlaywright();

  // Launch with system Google Chrome (required).
  // Chrome's authentic TLS/HTTP fingerprint is essential for bypassing Douyin risk control.
  let context;
  try {
    context = await chromium.launchPersistentContext(profileDir, buildBrowserOptions());
    console.log("[Browser] Using system Google Chrome.");
  } catch (chromeErr) {
    if (
      chromeErr.message.includes("Executable not found") ||
      chromeErr.message.includes("channel") ||
      chromeErr.message.includes("not supported")
    ) {
      console.error("\n[错误] 未检测到系统 Google Chrome，请先安装后重试。");
      console.error("\n  下载地址：https://www.google.com/chrome/");
      console.error("  安装完成后无需额外配置，直接重新运行即可。\n");
      process.exit(1);
    } else {
      console.error("\n[错误] 浏览器启动失败（Target page, context or browser has been closed）。");
      console.error("  原因通常为：");
      console.error("  1. 浏览器配置文件目录正在被其他运行中的 Chrome 进程独占锁定。");
      console.error("  2. 系统后台存在残留的 Chrome 僵尸进程。");
      console.error("  ");
      console.error("  【如何解决】");
      console.error("  - 请关闭所有已打开的 Chrome 浏览器窗口。");
      console.error("  - 如果问题依旧，请打开任务管理器，强制结束所有 chrome.exe 进程（或重启电脑）后重新运行。\n");
      process.exit(1);
    }
  }

  try {
    // Inject stealth script
    const stealthPath = join(__dirname, "adapters", "stealth.min.js");
    try {
      const stealthScript = readFileSync(stealthPath, "utf8");
      await context.addInitScript(stealthScript);
      console.log("[Stealth] Anti-detection script injected.");
    } catch (err) {
      console.warn(`[Stealth] Warning: ${err.message}`);
    }

    const page = context.pages()[0] || (await context.newPage());

    // ── Setup Interceptors ──────────────────────────────────────────────
    let capturedProfile = null;
    const rawVideos = [];
    let hasMore = true;
    let newResponseReceived = false;

    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('/aweme/v1/web/user/profile/other/')) {
        try {
          const json = await response.json();
          capturedProfile = json;
          console.log(`[Capture] Profile details captured for: ${capturedProfile.user?.nickname || capturedProfile.user_module?.user?.nickname || 'Creator'}`);
        } catch (err) {
          console.warn(`[Capture] Failed to parse profile JSON: ${err.message}`);
        }
      }
      if (url.includes('/aweme/v1/web/aweme/post/')) {
        console.log(`[Response] Post API Status: ${response.status()}`);
        try {
          const text = await response.text();
          if (!text) {
            console.warn("[Capture] Post API returned empty response body.");
            return;
          }
          const json = JSON.parse(text);
          const list = json.aweme_list || [];
          rawVideos.push(...list);
          hasMore = json.has_more === 1 || json.has_more === true;
          newResponseReceived = true;
          console.log(`[Capture] Captured ${list.length} videos (Total: ${rawVideos.length}, hasMore: ${hasMore})`);
        } catch (err) {
          console.warn(`[Capture] Failed to parse post JSON: ${err.message}`);
        }
      }
    });

    // Navigate to homepage first to check/wait for login
    await page.goto("https://www.douyin.com/", { waitUntil: "domcontentloaded" });
    await waitForLogin(page, context);

    // Navigate to target user profile page
    console.log(`[Browser] Navigating to user page: https://www.douyin.com/user/${secUserId}`);
    await page.goto(`https://www.douyin.com/user/${secUserId}`, { waitUntil: "domcontentloaded" });

    // Wait for the first page data to load naturally
    let waitCount = 0;
    while ((!capturedProfile || rawVideos.length === 0) && waitCount < 15) {
      await page.waitForTimeout(1000);
      waitCount++;
    }

    if (!capturedProfile || rawVideos.length === 0) {
      console.warn("[Adapter] First page of data was not captured naturally. Trying to reload...");
      await page.reload({ waitUntil: "domcontentloaded" });
      waitCount = 0;
      while ((!capturedProfile || rawVideos.length === 0) && waitCount < 15) {
        await page.waitForTimeout(1000);
        waitCount++;
      }
    }

    if (!capturedProfile) {
      console.error("\n[错误] 无法从网络响应中捕获用户数据。");
      console.error("  可能原因：");
      console.error("    1. 登录状态已过期（Cookie 服务端失效）");
      console.error("    2. 抖音账号被封禁或该页面需要登录才能查看");
      console.error("\n  解决方法：重新登录");
      console.error(`    node scripts/collect.mjs --account ${secUserId} --relogin`);
      throw new Error("Failed to capture user profile. Run with --relogin to clear session and re-authenticate.");
    }

    // Wait an additional 12 seconds for secondary pages (like Page 2 & 3) to naturally load and fully render cards
    console.log("[Browser] Waiting 12 seconds for natural loads to stabilize page layout...");
    await page.waitForTimeout(12000);
    console.log(`[Browser] Layout stabilized. Initial videos captured: ${rawVideos.length}`);

    // ── Scroll Loop to Trigger Pagination ────────────────────────────────
    console.log("[Browser] Starting scroll loop to fetch videos...");
    
    // Move mouse to center of page (video list area) to activate IntersectionObserver triggers
    const viewportSize = page.viewportSize();
    const centerX = viewportSize ? viewportSize.width / 2 : 640;
    const centerY = viewportSize ? viewportSize.height / 2 : 400;
    await page.mouse.move(centerX, centerY);

    let noNewDataRounds = 0;
    const MAX_NO_DATA_ROUNDS = 8; // Give up after 8 consecutive rounds with no new data

    while (hasMore && rawVideos.length < limit && noNewDataRounds < MAX_NO_DATA_ROUNDS) {
      newResponseReceived = false;

      // Use mouse.wheel() to simulate real user scroll — this triggers IntersectionObserver
      // in scroll containers that window.scrollTo cannot reach
      const scrollSteps = 6;
      for (let i = 0; i < scrollSteps; i++) {
        await page.mouse.wheel(0, 600);
        await page.waitForTimeout(120);
      }

      // Wait up to (delay) ms for a new API response
      const waitStart = Date.now();
      while (!newResponseReceived && (Date.now() - waitStart) < delay) {
        await page.waitForTimeout(300);
      }

      if (newResponseReceived) {
        noNewDataRounds = 0;
        console.log(`[Browser] Scroll triggered new data. Total videos: ${rawVideos.length}`);
        // Give extra time for the new batch to finish rendering before next scroll
        await page.waitForTimeout(800);
      } else {
        noNewDataRounds++;
        console.log(`[Browser] No new data after scroll (round ${noNewDataRounds}/${MAX_NO_DATA_ROUNDS}). Trying jitter...`);
        // Jitter: scroll up a bit then back down to re-trigger lazy load
        for (let i = 0; i < 3; i++) {
          await page.mouse.wheel(0, -300);
          await page.waitForTimeout(150);
        }
        await page.waitForTimeout(500);
        for (let i = 0; i < 4; i++) {
          await page.mouse.wheel(0, 800);
          await page.waitForTimeout(150);
        }
        await page.waitForTimeout(1000);
      }
    }

    if (!hasMore) {
      console.log("[Browser] Server reported hasMore=false. All videos fetched.");
    } else if (rawVideos.length >= limit) {
      console.log(`[Browser] Reached limit of ${limit} videos.`);
    } else {
      console.log(`[Browser] No new data after ${MAX_NO_DATA_ROUNDS} rounds. Stopping scroll.`);
    }

    console.log(`[Browser] Finished fetching. Deduplicating data...`);

    // ── Deduplicate and limit ───────────────────────────────────────────
    const seen = new Set();
    const uniqueVideos = rawVideos
      .filter((video) => {
        const key = String(video.aweme_id);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, limit);

    // Map to final schema
    const videos = uniqueVideos.map((video) => {
      const stats = video.statistics || {};

      // ── Content type ────────────────────────────────────────────────
      // aweme_type: 0=video, 4=landscape_video, 61=live_replay,
      //             68=image_text (图文), 2=image_only
      const awemeType = video.aweme_type ?? 0;
      let type = "video";
      if (awemeType === 68 || awemeType === 2) type = "image_text";
      else if (awemeType === 61) type = "live_replay";
      else if (awemeType === 51) type = "live";

      // ── Cover image ─────────────────────────────────────────────────
      const coverUrl =
        video.video?.cover?.url_list?.[0] ||
        video.video?.origin_cover?.url_list?.[0] ||
        "";

      // ── Image list (图文 posts) ──────────────────────────────────────
      const imageUrls = Array.isArray(video.images)
        ? video.images.map(img => img?.url_list?.[0] || "").filter(Boolean)
        : [];

      // ── Hashtags / topics ────────────────────────────────────────────
      const tags = (video.text_extra || [])
        .filter(t => t.hashtag_name)
        .map(t => t.hashtag_name);

      // ── Background music ─────────────────────────────────────────────
      const musicTitle = video.music?.title || "";
      const musicAuthor = video.music?.author || "";

      // ── Pinned post ──────────────────────────────────────────────────
      const isTop = video.is_top === 1;

      return {
        id: String(video.aweme_id),
        type,                              // video | image_text | live_replay | live
        title: video.desc || "",
        url: `https://www.douyin.com/video/${video.aweme_id}`,
        publishedAt: toIso(video.create_time),
        duration: type === "video" ? formatDuration(video.duration) : "",
        isTop,
        likes: stats.digg_count ?? 0,
        comments: stats.comment_count ?? 0,
        shares: stats.share_count ?? 0,
        favorites: stats.collect_count ?? 0,
        coins: 0,
        coverUrl,
        imageUrls,                         // non-empty for image_text posts
        tags,
        musicTitle,
        musicAuthor,
      };
    });

    const user = capturedProfile.user || {};
    const userModule = capturedProfile.user_module || {};
    const userInfo = userModule.user || user;

    const summary = {
      platform: "douyin",
      id: secUserId,
      url: `https://www.douyin.com/user/${secUserId}`,
      name: userInfo.nickname || "",
      followers: userInfo.follower_count ?? userInfo.mplatform_followers_count ?? 0,
      videoCount: userInfo.aweme_count ?? videos.length,
      totalLikes: userInfo.total_favorited ?? videos.reduce((sum, v) => sum + v.likes, 0),
      totalComments: videos.reduce((sum, v) => sum + v.comments, 0),
      fetchedAt: new Date().toISOString(),
    };

    // ── Write to SQLite (replaces Excel write, no file-locking issues) ────────
    const db = openDb();

    // Upsert account summary
    upsertAccount(db, {
      id:             summary.id,
      person:         args.person || '',
      name:           summary.name,
      platform:       summary.platform,
      followers:      summary.followers,
      video_count:    summary.videoCount,
      total_likes:    summary.totalLikes,
      total_comments: summary.totalComments,
      url:            summary.url,
      fetched_at:     summary.fetchedAt,
    });

    // Upsert videos
    const videoDbRows = videos.map(v => ({
      id:           String(v.id),
      account_id:   summary.id,
      person:       args.person || '',
      account_name: summary.name,
      type:         v.type,
      title:        String(v.title || '').slice(0, 32767),
      url:          v.url,
      published_at: v.publishedAt,
      duration:     v.duration,
      is_top:       v.isTop ? 1 : 0,
      likes:        v.likes,
      comments:     v.comments,
      shares:       v.shares,
      favorites:    v.favorites,
      tags:         (v.tags || []).join(' '),
      music_title:  v.musicTitle || '',
    }));
    upsertVideos(db, videoDbRows);
    db.close();

    console.log(`[DB] ✅ 数据已写入 SQLite：outputs/douyin.db`);
    console.log(`[DB]    账号：${summary.name}  视频：${videoDbRows.length} 条`);
    console.log(`[DB]  提示：如需导出 Excel 请运行 node scripts/export.mjs`);

    // Summary
    const typeCount = {};
    for (const v of videos) typeCount[v.type] = (typeCount[v.type] || 0) + 1;
    const typeStr = Object.entries(typeCount).map(([t, n]) => `${t}:${n}`).join('  ');

    console.log('\n[douyin_skill v3.5] Done!');
    console.log(`  Account : ${summary.name} (${summary.id})`);
    console.log(`  Followers: ${summary.followers.toLocaleString()}`);
    console.log(`  Posts   : ${videos.length} fetched (total: ${summary.videoCount})`);
    console.log(`  Types   : ${typeStr}`);
    console.log(`  Likes   : ${summary.totalLikes.toLocaleString()}`);
    console.log(`  Comments: ${summary.totalComments.toLocaleString()}`);
    console.log(`  Output  : 数据已写入 outputs/douyin.db（SQLite）`);

    // Automatically generate/update dashboard
    try {
      console.log("\n[Dashboard] 正在自动更新全局监控面板...");
      const { execSync } = await import("node:child_process");
      const dashboardScript = join(__dirname, 'dashboard.mjs');
      execSync(`node "${dashboardScript}"`, { stdio: "inherit" });
    } catch (dashboardErr) {
      console.error("[Dashboard] 自动更新面板失败:", dashboardErr.message);
    }

  } catch (err) {
    console.error(`[douyin_skill v3.4] Error: ${err.message}`);
    process.exit(1);
  } finally {
    if (context) await context.close();
  }
})();
