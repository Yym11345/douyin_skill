#!/usr/bin/env node
/**
 * scripts/dashboard.mjs
 * 
 * 读取 outputs/Douyin_All_Data.xlsx
 * 生成多级可视化的 Chart.js / HTML 看板:
 * - outputs/dashboard.html (全局总看板)
 * - outputs/person_dashboards/*.html (个人详细看板)
 * - outputs/leader_dashboards/*.html (组长管理看板)
 */

import { existsSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { openDb, getAllAccountsWithVideos, DEFAULT_DB_PATH } from './db.mjs';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const outputsDir = join(projectRoot, 'outputs');
const personDashboardsDir = join(outputsDir, 'person_dashboards');
const leaderDashboardsDir = join(outputsDir, 'leader_dashboards');

if (!existsSync(personDashboardsDir)) mkdirSync(personDashboardsDir, { recursive: true });
if (!existsSync(leaderDashboardsDir)) mkdirSync(leaderDashboardsDir, { recursive: true });

// ── 动态加载团队组织架构配置 ─────────────────────────────────────────
// 从 config/team.json 读取。首次使用请复制 config/team.example.json 并按实际组织层级修改。
const teamTxtPath = join(projectRoot, 'config', '组织关系.txt');
const teamConfigPath = join(projectRoot, 'config', 'team.json');
let TEAM_HIERARCHY = {};

if (existsSync(teamTxtPath)) {
    try {
        const lines = readFileSync(teamTxtPath, 'utf8').split('\n');
        let teamObj = {};
        let topLeader = null;
        let groupLeaders = [];
        
        for (let line of lines) {
            line = line.trim();
            if (!line) continue;
            if (line.includes('主管：')) {
                topLeader = line.split('主管：')[1].trim();
                continue;
            }
            if (line.includes('组长：') && line.includes('组员：')) {
                let parts = line.split('→');
                let groupName = parts[0].trim();
                let rest = parts[1] || '';
                let leaderStr = rest.split(/[,，]/)[0];
                let membersStr = rest.substring(leaderStr.length + 1);
                let leader = leaderStr.replace('组长：', '').trim();
                let members = membersStr.replace('组员：', '').split(/[、，, ]+/).map(s => s.trim()).filter(Boolean);
                
                teamObj[leader] = { groupName, members };
                groupLeaders.push(leader);
            }
        }
        if (topLeader) {
            teamObj[topLeader] = { groupName: '总管大盘', isTopLeader: true, members: groupLeaders };
        }
        TEAM_HIERARCHY = teamObj;
        writeFileSync(teamConfigPath, JSON.stringify({teams: teamObj}, null, 2), 'utf8');
        console.log(`[Dashboard] 自动将 组织关系.txt 转换为 team.json，加载了 ${Object.keys(TEAM_HIERARCHY).length} 个分组。`);
    } catch (e) {
        console.warn(`[Dashboard] 组织关系.txt 解析失败: ${e.message}`);
    }
} else if (existsSync(teamConfigPath)) {
  try {
    const raw = JSON.parse(readFileSync(teamConfigPath, 'utf8'));
    TEAM_HIERARCHY = raw.teams || {};
    console.log(`[Dashboard] 已加载团队配置: ${Object.keys(TEAM_HIERARCHY).length} 位组长`);
  } catch (e) {
    console.warn(`[Dashboard] ⚠️ config/team.json 解析失败: ${e.message}`);
    console.warn('[Dashboard] 将跳过组长看板生成，请检查 JSON 格式。');
  }
} else {
  console.warn('[Dashboard] ⚠️ 未找到 config/team.json，将不生成组长看板。');
  console.warn('[Dashboard] 请复制 config/team.example.json -> config/team.json 并配置您的团队人员架构。');
}

// 工具函数：近15天判定
function isWithin15Days(dateStr) {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 15;
}

// 工具函数：获取预期的评论数目标
function getTargetComments(likes) {
    if (likes < 10) return 1;
    if (likes < 50) return 2;
    if (likes < 100) return 4;
    if (likes < 500) return 5;
    if (likes < 1000) return 10;
    return 15;
}

// 工具函数： HTML 转义（防止 XSS 和 HTML 属性破坏）
function htmlEscape(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function loadDatabaseData() {
  const summaryMap = new Map();
  const videosMap  = new Map();

  // ── 优先读取 SQLite 数据库 ───────────────────────────────────────────────
  if (existsSync(DEFAULT_DB_PATH)) {
    try {
      const db = openDb(DEFAULT_DB_PATH);
      const { summaryMap: sm, videosMap: vm } = getAllAccountsWithVideos(db);
      db.close();

      // 将 SQLite snake_case 列名映射为 dashboard 期望的 camelCase 格式
      for (const [id, entry] of sm) {
        const a = entry.data;
        summaryMap.set(id, {
          data: {
            person:        a.person,
            id:            a.id,
            name:          a.name,
            platform:      a.platform,
            followers:     a.followers,
            videoCount:    a.video_count,
            totalLikes:    a.total_likes,
            totalComments: a.total_comments,
            url:           a.url,
            fetchedAt:     a.fetched_at,
          }
        });
      }

      // 将视频列名映射为 dashboard 期望的格式
      for (const [accId, vids] of vm) {
        videosMap.set(accId, vids.map(v => ({
          person:       v.person,
          account_name: v.account_name,
          account_id:   v.account_id,
          id:           v.id,
          type:         v.type,
          title:        v.title,
          url:          v.url,
          publishedAt:  v.published_at,
          duration:     v.duration,
          isTop:        v.is_top,
          likes:        v.likes,
          comments:     v.comments,
          shares:       v.shares,
          favorites:    v.favorites,
          tags:         v.tags,
          musicTitle:   v.music_title,
        })));
      }

      console.log(`[Dashboard] ✅ 从 SQLite 加载数据：${summaryMap.size} 个账号`);
      return { summaryMap, videosMap };
    } catch (e) {
      console.error(`[Dashboard] SQLite 读取失败，回退到 Excel：${e.message}`);
    }
  }

  // ── 回退：读取旧版 Excel（兼容历史数据）─────────────────────────────────
  const dataDbPath = join(outputsDir, 'Douyin_All_Data.xlsx');
  if (existsSync(dataDbPath)) {
    try {
      const dataWb = XLSX.readFile(dataDbPath);
      if (dataWb.SheetNames.includes('Summary')) {
        const summaries = XLSX.utils.sheet_to_json(dataWb.Sheets['Summary']);
        for (const s of summaries) {
          if (s.id) summaryMap.set(String(s.id), { data: s });
        }
      }
      if (dataWb.SheetNames.includes('Videos')) {
        const videos = XLSX.utils.sheet_to_json(dataWb.Sheets['Videos']);
        for (const v of videos) {
          const accId = String(v.account_id);
          if (!videosMap.has(accId)) videosMap.set(accId, []);
          videosMap.get(accId).push(v);
        }
      }
      console.log(`[Dashboard] ⚠️  从 Excel 回退加载：${summaryMap.size} 个账号（建议运行 migrate.mjs 迁移到 SQLite）`);
    } catch (e) {
      console.error(`[Dashboard] 读取 Excel 数据失败: ${e.message}`);
    }
  } else {
    console.warn(`[Dashboard] 警告：未找到数据源（SQLite 或 Excel）`);
    console.warn(`[Dashboard] 请先运行 node scripts/collect.mjs 采集数据，或运行 node scripts/migrate.mjs 迁移历史数据。`);
  }

  return { summaryMap, videosMap };
}

function generatePersonHtml(person, accounts, videos, updateTime) {
    // 聚合人员级别的数据
    const totalAccounts = accounts.length;
    const totalVideos = accounts.reduce((acc, a) => acc + (Number(a.data.videoCount) || videos.filter(v=>String(v.account_id)===String(a.data.id)).length), 0);
    const totalFollowers = accounts.reduce((acc, a) => acc + (Number(a.data.followers) || 0), 0);
    const totalLikes = videos.reduce((acc, v) => acc + (Number(v.likes) || 0), 0);
    const totalComments = videos.reduce((acc, v) => acc + (Number(v.comments) || 0), 0);

    let l15Videos = 0;
    let l15Maint = 0;
    let l15MissingCmts = 0;
    let allMaint = 0;

    const tiers = [
        { label: "10赞内", color: "#2e7d32", icon: "🟢", max: 10, vids: [] },
        { label: "50赞内", color: "#1565c0", icon: "🔵", max: 50, vids: [] },
        { label: "100赞内", color: "#f57f17", icon: "🟡", max: 100, vids: [] },
        { label: "500赞内", color: "#d84315", icon: "🟠", max: 500, vids: [] },
        { label: "1000赞内", color: "#c62828", icon: "🔴", max: 1000, vids: [] },
        { label: "1000赞以上", color: "#6a1b9a", icon: "🟣", max: Infinity, vids: [] },
    ];

    videos.forEach(v => {
        const likes = Number(v.likes) || 0;
        const comments = Number(v.comments) || 0;
        const targetComments = getTargetComments(likes);
        const isMaint = comments < targetComments;
        const isL15 = isWithin15Days(v.publishedAt);
        const accountName = accounts.find(a => String(a.data.id) === String(v.account_id))?.data.name || "未知账号";

        if (isL15) {
            l15Videos++;
            if (isMaint) l15Maint++;
            if (comments < targetComments) l15MissingCmts += (targetComments - comments);
        }
        if (isMaint) allMaint++;

        const vidObj = { ...v, accountName, isMaint, isL15, targetComments };
        for (const tier of tiers) {
            if (likes <= tier.max) {
                tier.vids.push(vidObj);
                break;
            }
        }
    });

    let tiersHtml = '';
    let tiersContentHtml = '';

    tiers.forEach(tier => {
        const okCount = tier.vids.filter(v => !v.isMaint).length;
        const warnCount = tier.vids.filter(v => v.isMaint).length;
        const l15MaintCount = tier.vids.filter(v => v.isMaint && v.isL15).length;

        tiersHtml += `<div class="tier-card" style="border-top:3px solid ${tier.color};"><div class="icon">${tier.icon}</div><div class="count" style="color:${tier.color};">${tier.vids.length}</div><div class="label" style="color:${tier.color};">${tier.label}</div><div class="sub">✅${okCount} ⚠️${warnCount}</div></div>`;

        // Sort videos: Maint first, then newest
        tier.vids.sort((a, b) => {
            if (a.isMaint && !b.isMaint) return -1;
            if (!a.isMaint && b.isMaint) return 1;
            const aDate = a.publishedAt || '';
            const bDate = b.publishedAt || '';
            return bDate.localeCompare(aDate);
        });

        let rowsHtml = ""; // Client-side rendering

        tiersContentHtml += `
    <div class="tier-panel">
    <div class="tier-header">
        <span class="tier-icon">${tier.icon}</span>
        <span class="tier-label" style="color:${tier.color};">${tier.label}</span>
        <span class="tier-pill tier-pill-maint">⚠️ 15天待维护 ${l15MaintCount}</span>
        <span class="tier-pill tier-pill-total">共 ${tier.vids.length} 条</span>
    </div>
    <div class="tier-strips"><table class="sortable tier-table"><thead><tr><th class="num">#</th><th class="no-sort">状态</th><th>账号</th><th>标题</th><th class="num">点赞</th><th class="num">评论</th><th>日期</th></tr></thead><tbody>
    ${rowsHtml}
    </tbody></table></div></div>`;
    });

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${person} - 抖音视频分级监控看板</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif; background:#f0f2f5; color:#333; }
.header { background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%); color:#fff; padding:20px 40px; }
.header .person { font-size:16px; color:#f6c23e; margin-bottom:2px; font-weight:600; }
.header h1 { font-size:22px; margin-bottom:4px; }
.header p { color:#a0aec0; font-size:12px; }
.hero-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; padding:18px 40px 6px; }
.hero-card { display:flex; align-items:center; gap:16px; border-radius:14px; padding:18px 22px; box-shadow:0 4px 16px rgba(0,0,0,0.08); border:2px solid transparent; transition:transform 0.15s; }
.hero-card:hover { transform:translateY(-2px); }
.hero-icon { font-size:36px; line-height:1; }
.hero-num { font-size:36px; font-weight:900; line-height:1.1; }
.hero-lbl { font-size:13px; font-weight:600; margin-top:4px; }
.hero-blue { background:linear-gradient(135deg,#dbeafe 0%,#eff6ff 100%); border-color:#93c5fd; color:#1e3a8a; }
.hero-red { background:linear-gradient(135deg,#fee2e2 0%,#fef2f2 100%); border-color:#fca5a5; color:#7f1d1d; }
.hero-red .hero-num { color:#dc2626; }
.hero-orange { background:linear-gradient(135deg,#ffedd5 0%,#fff7ed 100%); border-color:#fdba74; color:#7c2d12; }
.hero-orange .hero-num { color:#ea580c; }
.stats-row { display:grid; grid-template-columns:repeat(auto-fit,minmax(110px,1fr)); gap:10px; padding:10px 40px 14px; }
.stat-card { background:linear-gradient(135deg,#fff 60%,#f7fafc); border-radius:10px; padding:10px 8px; box-shadow:0 2px 6px rgba(0,0,0,0.04); text-align:center; }
.stat-card .num { font-size:20px; font-weight:800; color:#1a1a2e; line-height:1.2; }
.stat-card .lbl { font-size:11px; color:#718096; margin-top:2px; }
.stat-card.red { background:linear-gradient(135deg,#fef2f2 60%,#fff); }
.stat-card.red .num { color:#dc2626; }
.stat-card.red .lbl { color:#dc2626; }
.tier-row { display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:10px; padding:0 40px 14px; }
.tier-card { border-radius:10px; padding:10px 8px; text-align:center; background:#fff; box-shadow:0 2px 6px rgba(0,0,0,0.04); }
.tier-card .icon { font-size:16px; }
.tier-card .count { font-size:22px; font-weight:800; line-height:1.2; }
.tier-card .label { font-size:11px; }
.tier-card .sub { font-size:10px; opacity:0.7; margin-top:2px; color:#666; }
.content { padding:0 40px 40px; max-width:1700px; margin:0 auto; }
.tier-panel { border-radius:10px; padding:10px 16px; margin-bottom:10px; border:1px solid #e5e7eb; background:#fff; }
.tier-header { display:flex; align-items:center; gap:8px; margin-bottom:8px; padding-bottom:6px; border-bottom:1px solid rgba(0,0,0,0.05); }
.tier-icon { font-size:16px; }
.tier-label { font-size:14px; font-weight:700; }
.tier-pill { font-size:11px; padding:2px 8px; border-radius:10px; font-weight:600; }
.tier-pill-total { background:rgba(255,255,255,0.7); color:#6b7280; }
.tier-pill-ok { background:#c8e6c9; color:#1b5e20; }
.tier-pill-maint { background:#ffcdd2; color:#b71c1c; }
.tier-table { width:100%; border-collapse:collapse; font-size:12px; }
.tier-table thead th { background:#f3f4f6; color:#374151; padding:6px 10px; font-size:11px; font-weight:600; text-align:left; }
.tier-table tbody td { padding:6px 10px; border-bottom:1px solid #f3f4f6; }
.tier-table tbody tr:hover td { background:#f9fafb; }
.tier-table tbody tr.row-maint { background:#fef2f2; }
.tier-table tbody tr.row-maint:hover td { background:#fee2e2; }
.tier-table tbody tr.row-maint td.num { color:#dc2626; font-weight:700; }
.tier-table tbody td a { color:#2563eb; text-decoration:none; }
.tier-table tbody td a:hover { text-decoration:underline; }
.badge-maint { display:inline-block; background:#dc2626; color:#fff; padding:1px 6px; border-radius:4px; font-size:10px; font-weight:700; }
.badge-ok { display:inline-block; background:#d1fae5; color:#065f46; padding:1px 6px; border-radius:4px; font-size:10px; font-weight:600; }
</style>
</head>
<body>
<div class="header">
    <div class="person">👤 ${person}</div>
    <h1>📊 抖音视频分级监控看板</h1>
    <p>负责账号: ${totalAccounts} 个 · 总视频: ${totalVideos} 条 · 数据更新: ${updateTime}</p>
</div>

<div class="hero-stats">
    <div class="hero-card hero-blue">
        <div class="hero-icon">📅</div>
        <div class="hero-content">
            <div class="hero-num">${l15Videos}</div>
            <div class="hero-lbl">近15天 发布视频总数</div>
        </div>
    </div>
    <div class="hero-card hero-red">
        <div class="hero-icon">⚠️</div>
        <div class="hero-content">
            <div class="hero-num">${l15Maint}</div>
            <div class="hero-lbl">近15天 待维护视频数</div>
        </div>
    </div>
    <div class="hero-card hero-orange">
        <div class="hero-icon">💬</div>
        <div class="hero-content">
            <div class="hero-num">${l15MissingCmts}</div>
            <div class="hero-lbl">近15天 待评论总数</div>
        </div>
    </div>
</div>

<div class="stats-row">
    <div class="stat-card"><div class="num">${totalAccounts}</div><div class="lbl">负责账号</div></div>
    <div class="stat-card"><div class="num">${totalFollowers.toLocaleString()}</div><div class="lbl">总粉丝数</div></div>
    <div class="stat-card"><div class="num">${totalVideos.toLocaleString()}</div><div class="lbl">总视频数</div></div>
    <div class="stat-card"><div class="num">${totalLikes.toLocaleString()}</div><div class="lbl">总点赞</div></div>
    <div class="stat-card"><div class="num">${totalComments.toLocaleString()}</div><div class="lbl">总评论</div></div>
    <div class="stat-card red"><div class="num">${allMaint}</div><div class="lbl">⚠️ 待维护(全部)</div></div>
</div>

<div class="tier-row">
${tiersHtml}
</div>

<div class="content">
${tiersContentHtml}
</div>

<script>
  // Directly inject the JSON data from the server, safely encoding < to prevent script breakage
  const PAGE_DATA = ${JSON.stringify(tiers).replace(/</g, '\\u003c')};
  
  function htmlEscape(str) {
      return String(str || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
  }

  // Render a specific tier
  function renderTier(tierIndex) {
      const tier = PAGE_DATA[tierIndex];
      const tbody = document.querySelectorAll('.tier-table tbody')[tierIndex];
      
      // We render a max of 500 rows to prevent DOM bloat, or we can just render all since the JS loop is fast 
      // and won't lock up the server. But let's limit to 300 to be safe for DOM.
      const MAX_ROWS = 300;
      const vidsToRender = tier.vids.slice(0, MAX_ROWS);
      
      let rowsHtml = '';
      vidsToRender.forEach((v, i) => {
          const pubDate = (v.publishedAt || '').slice(0, 10);
          const safeTitle = htmlEscape(v.title || '');
          const shortTitle = htmlEscape((v.title || '').slice(0, 40));
          const rowClass = v.isMaint ? 'row-maint' : '';
          const statusBadge = v.isMaint ? '<span class="badge-maint">⚠️ 待维护</span>' : '<span class="badge-ok">✅ 达标</span>';
          const commentsHtml = v.comments + (v.isMaint ? ' <em>/' + v.targetComments + '</em>' : '');
          
          rowsHtml += '<tr class="' + rowClass + '"><td class="num">' + (i+1) + '</td><td>' + statusBadge + '</td><td>' + htmlEscape(v.accountName) + '</td><td><a href="' + (v.url || '#') + '" target="_blank" title="' + safeTitle + '">' + shortTitle + (v.title && v.title.length > 40 ? '...' : '') + '</a></td><td class="num">' + v.likes + '</td><td class="num">' + commentsHtml + '</td><td>' + pubDate + '</td></tr>';
      });
      
      if (tier.vids.length > MAX_ROWS) {
          rowsHtml += '<tr><td colspan="7" style="text-align:center;color:#666;">只显示前 ' + MAX_ROWS + ' 条数据，更多数据请查看全局面板或下载 Excel。</td></tr>';
      }
      
      tbody.innerHTML = rowsHtml;
  }

  // Initialize all tiers
  document.addEventListener('DOMContentLoaded', () => {
      for (let i = 0; i < PAGE_DATA.length; i++) {
          renderTier(i);
      }
  });
</script>
</body>
</html>`;
}


function generateLeaderHtml(leaderName, groupName, leaderStats, membersStats, updateTime) {
    let rowsHtml = '';
    
    // Sort combined by Maint L15 desc
    const allMembers = [leaderStats, ...membersStats].sort((a,b) => b.l15Maint - a.l15Maint);

    allMembers.forEach((m, i) => {
        const isLeader = m.name === leaderName;
        const leaderBadge = isLeader ? ' <span class="role-pill role-1">组长</span>' : '';
        const rowClass = isLeader ? 'class="is-leader"' : '';
        rowsHtml += `
<tr ${rowClass}>
    <td>${i+1}</td>
    <td><strong>${m.name}</strong>${leaderBadge}</td>
    <td>${m.totalAccounts}</td>
    <td>${m.totalVideos}</td>
    <td>${m.totalFollowers.toLocaleString()}</td>
    <td>${m.l15Videos}</td>
    <td style="color:#dc2626;font-weight:700;">${m.l15Maint}</td>
    <td style="color:#f87171;font-weight:600;">${m.l15MissingCmts}</td>
    <td><a href="../person_dashboards/${m.name}.html" target="_blank" style="color:#2563eb;">查看看板 →</a></td>
</tr>`;
    });

    const combinedL15Vids = allMembers.reduce((a,b) => a+b.l15Videos, 0);
    const combinedL15Maint = allMembers.reduce((a,b) => a+b.l15Maint, 0);
    const combinedL15MissingCmts = allMembers.reduce((a,b) => a+b.l15MissingCmts, 0);
    const combinedAccounts = allMembers.reduce((a,b) => a+b.totalAccounts, 0);
    const combinedVids = allMembers.reduce((a,b) => a+b.totalVideos, 0);

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${leaderName} 组长看板 - ${groupName}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif; background:#f0f2f5; color:#333; padding:40px; }
h1 { font-size:28px; margin-bottom:4px; }
h1 span { font-size:14px; font-weight:400; color:#9ca3af; margin-left:12px; }
.hero-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin:18px 0 24px; }
.hero-card { display:flex; align-items:center; gap:16px; border-radius:14px; padding:20px 24px; box-shadow:0 4px 16px rgba(0,0,0,0.08); border:2px solid transparent; transition:transform 0.15s; }
.hero-card:hover { transform:translateY(-2px); }
.hero-icon { font-size:36px; line-height:1; }
.hero-num { font-size:36px; font-weight:900; line-height:1.1; }
.hero-lbl { font-size:13px; font-weight:600; margin-top:4px; }
.hero-blue { background:linear-gradient(135deg,#dbeafe 0%,#eff6ff 100%); border-color:#93c5fd; color:#1e3a8a; }
.hero-red { background:linear-gradient(135deg,#fee2e2 0%,#fef2f2 100%); border-color:#fca5a5; color:#7f1d1d; }
.hero-red .hero-num { color:#dc2626; }
.hero-orange { background:linear-gradient(135deg,#ffedd5 0%,#fff7ed 100%); border-color:#fdba74; color:#7c2d12; }
.hero-orange .hero-num { color:#ea580c; }
.subtitle { color:#6b7280; font-size:13px; margin:0 0 8px; }
table { width:100%; border-collapse:collapse; background:#fff; border-radius:14px; overflow:hidden; box-shadow:0 2px 10px rgba(0,0,0,0.05); font-size:14px; }
th { background:linear-gradient(135deg,#1a1a2e,#16213e); color:#fff; padding:14px 16px; text-align:left; font-weight:600; font-size:13px; }
td { padding:12px 16px; border-bottom:1px solid #f3f4f6; }
tr:hover td { background:#f9fafb; }
.is-leader { background:#fef3c7 !important; font-weight:600; }
a { text-decoration:none; font-weight:600; }
a:hover { text-decoration:underline; }
.role-pill { display:inline-block; padding:2px 8px; border-radius:6px; font-size:11px; font-weight:700; margin-left:6px; }
.role-1 { background:#d1fae5; color:#065f46; }
.footer { margin-top:20px; font-size:13px; color:#9ca3af; text-align:center; }
@media (max-width:1024px) { .hero-stats { grid-template-columns:1fr; } body{padding:20px;} }
</style>
</head>
<body>
<h1>👥 ${leaderName} 组长看板 <span>${groupName} · 组员: ${membersStats.length} 人</span></h1>
<div class="subtitle">下属 <strong>${membersStats.length}</strong> 人 · 总账号 ${combinedAccounts} · 总视频 ${combinedVids}</div>
<div class="hero-stats">
    <div class="hero-card hero-blue">
        <div class="hero-icon">📅</div>
        <div class="hero-num">${combinedL15Vids}</div>
        <div class="hero-lbl">近15天 发布视频总数</div>
    </div>
    <div class="hero-card hero-red">
        <div class="hero-icon">⚠️</div>
        <div class="hero-num">${combinedL15Maint}</div>
        <div class="hero-lbl">⚠️ 近15天 待维护视频数</div>
    </div>
    <div class="hero-card hero-orange">
        <div class="hero-icon">💬</div>
        <div class="hero-num">${combinedL15MissingCmts}</div>
        <div class="hero-lbl">💬 近15天 待评论总数</div>
    </div>
</div>
<table class="sortable">
    <thead><tr><th class="num">#</th><th>姓名</th><th class="num">账号数</th><th class="num">总视频</th><th class="num">总粉丝</th><th class="num">近15天发布</th><th class="num" style="color:#fca5a5;">⚠️待维护视频</th><th class="num" style="color:#fca5a5;">待评论数</th><th class="no-sort">看板</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
</table>
<div class="footer">数据更新: ${updateTime} · 仅统计近15天内发布视频</div>
</body>
</html>`;
}

function computePersonStats(person, accounts, videos) {
    const totalAccounts = accounts.length;
    const totalVideos = accounts.reduce((acc, a) => acc + (Number(a.data.videoCount) || videos.filter(v=>String(v.account_id)===String(a.data.id)).length), 0);
    const totalFollowers = accounts.reduce((acc, a) => acc + (Number(a.data.followers) || 0), 0);
    
    let l15Videos = 0;
    let l15Maint = 0;
    let l15MissingCmts = 0;

    videos.forEach(v => {
        const likes = Number(v.likes) || 0;
        const comments = Number(v.comments) || 0;
        const targetComments = getTargetComments(likes);
        const isMaint = comments < targetComments;
        const isL15 = isWithin15Days(v.publishedAt);

        if (isL15) {
            l15Videos++;
            if (isMaint) l15Maint++;
            if (comments < targetComments) l15MissingCmts += (targetComments - comments);
        }
    });

    return {
        name: person,
        totalAccounts,
        totalVideos,
        totalFollowers,
        l15Videos,
        l15Maint,
        l15MissingCmts
    };
}


// 这里是全局看板的生成逻辑（保留之前做的）
function generateGlobalDashboardHtml(DATA, INSIGHTS) {
  // 从原有的代码里把那些 Chart.js 全局看板代码复制过来
  const generatedAt = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>抖音账号总体监控看板</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif; background: #f0f2f5; color: #333; }
.header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); color: #fff; padding: 30px 40px; }
.header h1 { font-size: 28px; margin-bottom: 8px; }
.header p { color: #a0aec0; font-size: 14px; }
.nav-links { display:flex; gap:12px; margin-top:12px;}
.nav-links a { color:#fff; text-decoration:none; background:rgba(255,255,255,0.15); padding:6px 12px; border-radius:6px; font-size:14px; transition:background 0.2s; }
.nav-links a:hover { background:rgba(255,255,255,0.25); }
.stats-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; padding: 24px 40px; }
.stat-card { background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); text-align: center; }
.stat-card .number { font-size: 32px; font-weight: 700; color: #1a1a2e; }
.stat-card .label { font-size: 13px; color: #718096; margin-top: 4px; }
.stat-card .sub { font-size: 11px; color: #a0aec0; margin-top: 2px; }
.content { padding: 0 40px 40px; max-width: 1600px; margin: 0 auto; }
.section { margin-bottom: 28px; }
.section-title { font-size: 18px; font-weight: 600; margin-bottom: 16px; color: #2d3748; display: flex; align-items: center; gap: 8px; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; }
.card { background: #fff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); overflow: hidden; }
.card-header { padding: 16px 20px; border-bottom: 1px solid #edf2f7; font-weight: 600; font-size: 15px; color: #2d3748; }
.card-body { padding: 20px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th { background: #f7fafc; padding: 10px 12px; text-align: left; font-weight: 600; color: #4a5568; border-bottom: 2px solid #e2e8f0; white-space: nowrap; }
td { padding: 10px 12px; border-bottom: 1px solid #edf2f7; }
tr:hover td { background: #f7fafc; }
.rank-num { display: inline-block; width: 24px; height: 24px; line-height: 24px; text-align: center; border-radius: 50%; font-size: 12px; font-weight: 700; background: #e2e8f0; color: #4a5568; }
.rank-1 { background: #f6c23e; color: #fff; }
.rank-2 { background: #a0aec0; color: #fff; }
.rank-3 { background: #ed8936; color: #fff; }
.tag-cloud { display: flex; flex-wrap: wrap; gap: 8px; }
.tag-item { background: #ebf4ff; color: #3182ce; padding: 6px 14px; border-radius: 16px; font-size: 13px; transition: transform 0.2s; }
.tag-item:hover { transform: scale(1.05); background: #bee3f8; }
.chart-container { position: relative; height: 300px; }
.insight-box { background: linear-gradient(135deg, #fefcbf, #fef9e7); border-left: 4px solid #d69e2e; padding: 16px 20px; border-radius: 8px; font-size: 14px; line-height: 1.8; }
.insight-box strong { color: #744210; }
@media (max-width: 1024px) { .grid-2, .grid-3 { grid-template-columns: 1fr; } .content { padding: 0 16px 16px; } .header { padding: 20px; } .stats-row { padding: 16px; grid-template-columns: repeat(2, 1fr); } }
</style>
</head>
<body>

<div class="header">
    <h1>📊 抖音账号总体监控看板</h1>
    <p>监控账号总数: ${DATA.totalAccounts} 个 · 数据起止: ${DATA.earliestDate} 至 ${DATA.latestDate} · 报告生成: ${generatedAt}</p>
    <div class="nav-links">
        ${Object.keys(TEAM_HIERARCHY).map(leader => `<a href="./leader_dashboards/${leader}.html">${leader}看板</a>`).join('')}
    </div>
</div>

<div class="stats-row">
    <div class="stat-card">
        <div class="number">${DATA.totalAccounts}</div>
        <div class="label">监控账号总数</div>
        <div class="sub">活跃 ${DATA.activeAccounts} / 空数据 ${DATA.inactiveAccounts}</div>
    </div>
    <div class="stat-card">
        <div class="number">${(DATA.totalFollowers / 10000).toFixed(1)}万</div>
        <div class="label">总粉丝数</div>
        <div class="sub">覆盖 ${DATA.totalFollowers.toLocaleString()} 人</div>
    </div>
    <div class="stat-card">
        <div class="number">${DATA.totalVideos}</div>
        <div class="label">总视频数</div>
        <div class="sub">去重采集 ${DATA.totalUniqueVideos} 条</div>
    </div>
    <div class="stat-card">
        <div class="number">${(DATA.totalLikes / 10000).toFixed(1)}万</div>
        <div class="label">总点赞数</div>
        <div class="sub">${DATA.totalLikes.toLocaleString()} 次</div>
    </div>
    <div class="stat-card">
        <div class="number">${DATA.totalComments.toLocaleString()}</div>
        <div class="label">总评论数</div>
        <div class="sub">互动总计 ${DATA.totalEngagement.toLocaleString()}</div>
    </div>
    <div class="stat-card">
        <div class="number">${DATA.avgEngagementPerVideo}</div>
        <div class="label">单条平均互动</div>
        <div class="sub">点赞+评论 / 视频数</div>
    </div>
</div>

<div class="content">

<div class="section">
    <div class="section-title">💡 核心洞察</div>
    <div class="insight-box" id="insightBox"></div>
</div>

<div class="section">
    <div class="grid-3">
        <div class="card">
            <div class="card-header">🏆 粉丝数 TOP 10</div>
            <div class="card-body" style="padding:0">
                <table>
                    <thead><tr><th>#</th><th>账号</th><th>粉丝</th><th>视频</th><th>点赞</th></tr></thead>
                    <tbody id="followersRank"></tbody>
                </table>
            </div>
        </div>
        <div class="card">
            <div class="card-header">🔥 点赞数 TOP 10</div>
            <div class="card-body" style="padding:0">
                <table>
                    <thead><tr><th>#</th><th>账号</th><th>点赞</th><th>粉丝</th><th>评论</th></tr></thead>
                    <tbody id="likesRank"></tbody>
                </table>
            </div>
        </div>
        <div class="card">
            <div class="card-header">📹 高产账号 TOP 10</div>
            <div class="card-body" style="padding:0">
                <table>
                    <thead><tr><th>#</th><th>账号</th><th>视频数</th><th>粉丝</th><th>点赞</th></tr></thead>
                    <tbody id="videosRank"></tbody>
                </table>
            </div>
        </div>
    </div>
</div>

<div class="section">
    <div class="grid-2">
        <div class="card">
            <div class="card-header">📈 粉丝数分布</div>
            <div class="card-body">
                <div class="chart-container"><canvas id="distChart"></canvas></div>
            </div>
        </div>
        <div class="card">
            <div class="card-header">🎬 视频类型分布</div>
            <div class="card-body">
                <div class="chart-container"><canvas id="typeChart"></canvas></div>
            </div>
        </div>
    </div>
</div>

<div class="section">
    <div class="grid-2">
        <div class="card">
            <div class="card-header">📊 账号粉丝数排行 TOP 15</div>
            <div class="card-body">
                <div class="chart-container"><canvas id="barChart"></canvas></div>
            </div>
        </div>
        <div class="card">
            <div class="card-header">⚡ 互动率排行 TOP 15</div>
            <div class="card-body">
                <div class="chart-container"><canvas id="engagementChart"></canvas></div>
            </div>
        </div>
    </div>
</div>

<div class="section">
    <div class="card">
        <div class="card-header">🏷️ 热门话题标签 TOP 30</div>
        <div class="card-body">
            <div class="tag-cloud" id="tagCloud"></div>
        </div>
    </div>
</div>

<div class="section">
    <div class="card">
        <div class="card-header">📋 所有账号数据总表（按粉丝数排序）</div>
        <div class="card-body" style="padding:0; overflow-x:auto;">
            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>负责人</th>
                        <th>账号名称</th>
                        <th>粉丝数</th>
                        <th>视频数</th>
                        <th>总点赞</th>
                        <th>总评论</th>
                        <th>互动率</th>
                    </tr>
                </thead>
                <tbody id="allAccountsTable"></tbody>
            </table>
        </div>
    </div>
</div>

</div>

<script>
var DATA = ${JSON.stringify(DATA)};
var INSIGHTS = ${JSON.stringify(INSIGHTS)};

// 核心洞察
document.getElementById('insightBox').innerHTML = INSIGHTS.map(function(s) { return '📌 ' + s; }).join('<br>');

// 排行榜
function renderRank(tbodyId, data, mode) {
    var tbody = document.getElementById(tbodyId);
    var html = '';
    for (var i = 0; i < Math.min(10, data.length); i++) {
        var item = data[i];
        var rankClass = i === 0 ? 'rank-1' : (i === 1 ? 'rank-2' : (i === 2 ? 'rank-3' : ''));
        var name = item.name || '未命名';
        var v1, v2, v3;
        if (mode === 'followers') {
            v1 = item.followers.toLocaleString();
            v2 = item.videos.toLocaleString();
            v3 = item.likes.toLocaleString();
        } else if (mode === 'likes') {
            v1 = item.likes.toLocaleString();
            v2 = item.followers.toLocaleString();
            v3 = item.comments.toLocaleString();
        } else {
            v1 = item.videos.toLocaleString();
            v2 = item.followers.toLocaleString();
            v3 = item.likes.toLocaleString();
        }
        html += '<tr>' +
            '<td><span class="rank-num ' + rankClass + '">' + (i+1) + '</span></td>' +
            '<td><strong>' + name + '</strong></td>' +
            '<td>' + v1 + '</td>' +
            '<td>' + v2 + '</td>' +
            '<td>' + v3 + '</td></tr>';
    }
    tbody.innerHTML = html;
}

renderRank('followersRank', DATA.byFollowers, 'followers');
renderRank('likesRank', DATA.byLikes, 'likes');
renderRank('videosRank', DATA.byVideos, 'videos');

// 粉丝数分布图
new Chart(document.getElementById('distChart'), {
    type: 'pie',
    data: {
        labels: DATA.sizeDistribution.map(function(d) { return d.range + ' 粉丝'; }),
        datasets: [{
            data: DATA.sizeDistribution.map(function(d) { return d.count; }),
            backgroundColor: ['#48bb78', '#4299e1', '#ed8936', '#9f7aea', '#f56565'],
            borderWidth: 2,
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'right', labels: { font: { size: 13 } } },
            tooltip: {
                callbacks: {
                    label: function(ctx) {
                        return ctx.label + ': ' + ctx.raw + ' 个账号 (' + (ctx.raw / DATA.totalAccounts * 100).toFixed(1) + '%)';
                    }
                }
            }
        }
    }
});

// 视频类型分布
var typeLabels = { 'video': '视频', 'image_text': '图文', 'live_replay': '直播回放', 'live': '直播', 'unknown': '其他' };
var typeKeys = Object.keys(DATA.videoTypes);
var typeData = typeKeys.map(function(k) { return DATA.videoTypes[k]; });
var typeNames = typeKeys.map(function(k) { return typeLabels[k] || k; });

new Chart(document.getElementById('typeChart'), {
    type: 'doughnut',
    data: {
        labels: typeNames,
        datasets: [{
            data: typeData,
            backgroundColor: ['#4299e1', '#48bb78', '#ed8936', '#9f7aea', '#f56565'],
            borderWidth: 2,
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'right', labels: { font: { size: 13 } } },
            tooltip: {
                callbacks: {
                    label: function(ctx) {
                        var total = typeData.reduce(function(a,b) { return a+b; }, 0);
                        return ctx.label + ': ' + ctx.raw + ' 条 (' + (ctx.raw / total * 100).toFixed(1) + '%)';
                    }
                }
            }
        }
    }
});

// 粉丝数柱状图 TOP 15
var colors15 = ['#667eea','#764ba2','#f093fb','#4facfe','#43e97b','#fa709a','#f6d365','#a18cd1','#fbc2eb','#a6c1ee','#fccb90','#d57eeb','#e0c3fc','#8ec5fc','#a78bfa'];
var top15 = DATA.byFollowers.slice(0, 15);

new Chart(document.getElementById('barChart'), {
    type: 'bar',
    data: {
        labels: top15.map(function(a) {
            var name = a.name || '未命名';
            return name.length > 6 ? name.slice(0,6) + '..' : name;
        }),
        datasets: [{
            label: '粉丝数',
            data: top15.map(function(a) { return a.followers; }),
            backgroundColor: colors15,
            borderRadius: 4,
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
            x: { title: { display: true, text: '粉丝数' } },
            y: { ticks: { font: { size: 11 } } }
        }
    }
});

// 互动率排行
var engData = DATA.engagementRate.slice(0, 15);
var engColors = ['#48bb78','#38a169','#4299e1','#3182ce','#ed8936','#dd6b20','#9f7aea','#805ad5','#f56565','#e53e3e','#d69e2e','#b7791f','#38b2ac','#319795','#667eea'];

new Chart(document.getElementById('engagementChart'), {
    type: 'bar',
    data: {
        labels: engData.map(function(a) {
            var name = a.name || '未命名';
            return name.length > 6 ? name.slice(0,6) + '..' : name;
        }),
        datasets: [{
            label: '互动率 (互动/粉丝)',
            data: engData.map(function(a) { return a.rate; }),
            backgroundColor: engColors,
            borderRadius: 4,
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
            x: { title: { display: true, text: '互动率' } },
            y: { ticks: { font: { size: 11 } } }
        }
    }
});

// 热门标签
var tagCloud = document.getElementById('tagCloud');
var maxCount = 0;
for (var ti = 0; ti < DATA.topTags.length; ti++) {
    if (DATA.topTags[ti].count > maxCount) maxCount = DATA.topTags[ti].count;
}
var tagHtml = '';
for (var ti = 0; ti < DATA.topTags.length; ti++) {
    var t = DATA.topTags[ti];
    var size = 12 + (t.count / maxCount) * 18;
    var opacity = 0.5 + (t.count / maxCount) * 0.5;
    tagHtml += '<span class="tag-item" style="font-size:' + size.toFixed(0) + 'px; opacity:' + opacity.toFixed(2) + '">#' + t.tag + ' (' + t.count + ')</span>';
}
tagCloud.innerHTML = tagHtml;

// 所有账号总表
var allTbody = document.getElementById('allAccountsTable');
var allHtml = '';
for (var ai = 0; ai < DATA.byFollowers.length; ai++) {
    var a = DATA.byFollowers[ai];
    var er = a.followers > 0 ? ((a.likes + a.comments) / a.followers).toFixed(2) : '-';
    var person = a.person || '-';
    allHtml += '<tr>' +
        '<td>' + (ai+1) + '</td>' +
        '<td><span style="color:#718096">' + person + '</span></td>' +
        '<td><a href="./person_dashboards/' + person + '.html" target="_blank" style="color:#3182ce; text-decoration:none;"><strong>' + (a.name || '未命名') + '</strong></a></td>' +
        '<td>' + a.followers.toLocaleString() + '</td>' +
        '<td>' + a.videos.toLocaleString() + '</td>' +
        '<td>' + a.likes.toLocaleString() + '</td>' +
        '<td>' + a.comments.toLocaleString() + '</td>' +
        '<td>' + er + '</td></tr>';
}
allTbody.innerHTML = allHtml;
</script>
</body>
</html>`}

function generateGlobalStats(summaryMap, videosMap) {
  let totalAccounts = 0;
  let activeAccounts = 0;
  let totalFollowers = 0;
  let totalVideos = 0;
  let totalLikes = 0;
  let totalComments = 0;
  let totalUniqueVideos = 0;
  let earliestDate = "9999-12-31";
  let latestDate = "0000-01-01";
  
  const videoTypes = {};
  const tagCounts = {};
  const accountsData = [];

  for (const [secId, summaryObj] of summaryMap.entries()) {
    const s = summaryObj.data;
    const vids = videosMap.get(secId) || [];
    
    totalAccounts++;
    const followers = Number(s.followers) || 0;
    const likes = Number(s.totalLikes) || 0;
    const comments = Number(s.totalComments) || 0;
    const vCount = vids.length; 
    
    if (vCount > 0 || likes > 0 || followers > 0) activeAccounts++;
    
    totalFollowers += followers;
    totalLikes += likes;
    totalComments += comments;
    totalVideos += (Number(s.videoCount) || vCount);
    totalUniqueVideos += vCount;
    
    for (const v of vids) {
      const t = v.type || 'video';
      videoTypes[t] = (videoTypes[t] || 0) + 1;
      
      if (v.publishedAt) {
        const d = v.publishedAt.slice(0, 10);
        if (d < earliestDate) earliestDate = d;
        if (d > latestDate) latestDate = d;
      }
      if (v.tags) {
        const tags = String(v.tags).split(' ').filter(Boolean);
        for (const tag of tags) tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }
    
    accountsData.push({
      person: s.person || '',
      name: s.name || '未命名',
      followers,
      videos: vCount,
      likes,
      comments
    });
  }
  
  const totalEngagement = totalLikes + totalComments;
  const avgEngagementPerVideo = totalUniqueVideos > 0 ? (totalEngagement / totalUniqueVideos).toFixed(1) : 0;
  
  const sortedTags = Object.entries(tagCounts).map(([tag, count]) => ({tag, count})).sort((a, b) => b.count - a.count);
  const byFollowers = [...accountsData].sort((a, b) => b.followers - a.followers);
  const byLikes = [...accountsData].sort((a, b) => b.likes - a.likes);
  const byVideos = [...accountsData].sort((a, b) => b.videos - a.videos);
  
  const engagementRate = [...accountsData].filter(a => a.followers > 0).map(a => ({
      name: a.name,
      followers: a.followers,
      rate: Number(((a.likes + a.comments) / a.followers).toFixed(2))
    })).sort((a, b) => b.rate - a.rate);
    
  const dist = [
    { range: "0-100", max: 100, count: 0 },
    { range: "101-500", max: 500, count: 0 },
    { range: "501-1000", max: 1000, count: 0 },
    { range: "1001-5000", max: 5000, count: 0 },
    { range: "5000+", max: Infinity, count: 0 }
  ];
  for (const a of accountsData) {
    for (const d of dist) {
      if (a.followers <= d.max) { d.count++; break; }
    }
  }
  
  const DATA = {
    totalAccounts, activeAccounts, inactiveAccounts: totalAccounts - activeAccounts,
    totalFollowers, totalVideos, totalLikes, totalComments, totalEngagement, totalUniqueVideos, avgEngagementPerVideo,
    earliestDate: earliestDate === "9999-12-31" ? "-" : earliestDate,
    latestDate: latestDate === "0000-01-01" ? "-" : latestDate,
    videoTypes, topTags: sortedTags.slice(0, 30), byFollowers, byLikes, byVideos, engagementRate,
    sizeDistribution: dist.map(d => ({ range: d.range, count: d.count }))
  };
  
  const INSIGHTS = [
    `覆盖总粉丝 ${totalFollowers.toLocaleString()} 人，总点赞 ${totalLikes.toLocaleString()} 次，总评论 ${totalComments.toLocaleString()} 条`,
    byFollowers.length > 0 ? `粉丝最多的账号是「${byFollowers[0].name}」，拥有 ${byFollowers[0].followers.toLocaleString()} 粉丝` : '',
    byLikes.length > 0 ? `最受欢迎的账号是「${byLikes[0].name}」，累计获得 ${byLikes[0].likes.toLocaleString()} 次点赞` : '',
    byVideos.length > 0 ? `最高产的账号是「${byVideos[0].name}」，共发布 ${byVideos[0].videos.toLocaleString()} 条视频` : '',
  ].filter(Boolean);
  
  if (DATA.topTags.length > 0) INSIGHTS.push(`热门话题「#${DATA.topTags[0].tag}」出现 ${DATA.topTags[0].count} 次`);

  return { DATA, INSIGHTS };
}


function main() {
  console.log('[Dashboard] 开始读取数据并生成多级监控看板...');

  const { summaryMap, videosMap } = loadDatabaseData();
  const updateTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  // 1. 获取所有人员名单
  const personSet = new Set();
  for (const s of summaryMap.values()) {
      if (s.data.person) personSet.add(s.data.person);
  }
  // 加上配置里的人员，以防部分人员没数据
  Object.keys(TEAM_HIERARCHY).forEach(k => {
      personSet.add(k);
      TEAM_HIERARCHY[k].members.forEach(m => personSet.add(m));
  });

  const allPersonStats = {};

  // 2. 生成个人看板 (Person Dashboards)
  for (const person of personSet) {
      // Find accounts for this person
      const pAccounts = [];
      const pVideos = [];
      for (const s of summaryMap.values()) {
          if (s.data.person === person) {
              pAccounts.push(s);
              const vids = videosMap.get(String(s.data.id)) || [];
              pVideos.push(...vids);
          }
      }

      // 生成个人统计数据并保存，供 leader 板块使用
      const pStats = computePersonStats(person, pAccounts, pVideos);
      allPersonStats[person] = pStats;

      // 生成 HTML
      const pHtml = generatePersonHtml(person, pAccounts, pVideos, updateTime);
      writeFileSync(join(personDashboardsDir, `${person}.html`), pHtml, 'utf8');
  }
  console.log(`[Dashboard] 生成了 ${personSet.size} 个个人监控看板`);

  // 3. 生成组长看板 (Leader Dashboards)
  let leaderCount = 0;
  for (const [leader, info] of Object.entries(TEAM_HIERARCHY)) {
      leaderCount++;
      const leaderStats = allPersonStats[leader] || computePersonStats(leader, [], []);
      
      let membersStats = [];
      
      if (info.isTopLeader) {
          info.members.forEach(m => {
              let mStats = allPersonStats[m];
              // 聚合组长底下的数据
              if (TEAM_HIERARCHY[m]) {
                  const subTeam = TEAM_HIERARCHY[m].members;
                  let combinedStats = { ...mStats };
                  subTeam.forEach(sub => {
                      if(allPersonStats[sub]) {
                          combinedStats.totalAccounts += allPersonStats[sub].totalAccounts;
                          combinedStats.totalVideos += allPersonStats[sub].totalVideos;
                          combinedStats.totalFollowers += allPersonStats[sub].totalFollowers;
                          combinedStats.l15Videos += allPersonStats[sub].l15Videos;
                          combinedStats.l15Maint += allPersonStats[sub].l15Maint;
                          combinedStats.l15MissingCmts += allPersonStats[sub].l15MissingCmts;
                      }
                  });
                  membersStats.push(combinedStats);
              } else {
                  if(mStats) membersStats.push(mStats);
              }
          });
      } else {
          info.members.forEach(m => {
              if (allPersonStats[m]) membersStats.push(allPersonStats[m]);
          });
      }

      const lHtml = generateLeaderHtml(leader, info.groupName, leaderStats, membersStats, updateTime);
      writeFileSync(join(leaderDashboardsDir, `${leader}.html`), lHtml, 'utf8');
  }
  console.log(`[Dashboard] 生成了 ${leaderCount} 个组长监控看板`);

  // 4. 生成全局大看板
  const { DATA, INSIGHTS } = generateGlobalStats(summaryMap, videosMap);
  const globalHtml = generateGlobalDashboardHtml(DATA, INSIGHTS);
  writeFileSync(join(outputsDir, 'dashboard.html'), globalHtml, 'utf8');
  console.log(`[Dashboard] 成功生成全局图表看板: ${join(outputsDir, 'dashboard.html')}`);
}

main();
