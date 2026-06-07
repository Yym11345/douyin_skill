#!/usr/bin/env node
/**
 * scripts/dashboard.mjs
 * 
 * 读取 账号监控_人员分组.xlsx 与 outputs/ 目录下的所有 summary.json & videos.json，
 * 按照 VAM 团队监控矩阵的“维护提醒”规则与 UI 风格，生成 outputs/index.html 监控面板。
 */

import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const outputsDir = join(projectRoot, 'outputs');
const excelPath = join(projectRoot, '账号监控_人员分组.xlsx');
// 格式化展示的粉丝/赞数/比率
function formatCount(num) {
  num = Number(num) || 0;
  if (num >= 10000) {
    return (num / 10000).toFixed(1).replace(/\.0$/, '') + 'w';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
  return String(num);
}

// 维护提醒规则分类
function classifyVideo(likes, comments) {
  likes = Number(likes) || 0;
  comments = Number(comments) || 0;

  // Global classification category
  let globalCategory = 'ok';
  if (likes <= 10) {
    globalCategory = 'muted';
  } else if (likes > 500) {
    if (comments >= 50) globalCategory = 'ok';
    else if (comments < 10) globalCategory = 'critical';
    else if (comments < 25) globalCategory = 'warning';
    else globalCategory = 'caution';
  } else {
    const ratio = comments / likes;
    if (ratio >= 0.1) globalCategory = 'ok';
    else if (ratio < 0.02) globalCategory = 'critical';
    else if (ratio < 0.05) globalCategory = 'warning';
    else globalCategory = 'caution';
  }

  // UI representation (row styling)
  let level = 'ok';
  let severity = 1;
  let label = '正常';
  let color = '#1ec98b';
  let ratioText = '';
  let needsMaintenance = false;

  if (likes === 0) {
    level = 'nodata';
    severity = 0;
    label = '无数据';
    color = '#525c70';
    ratioText = '–';
    needsMaintenance = false;
  } else if (likes <= 10) {
    const ratio = comments / likes;
    level = 'ok';
    severity = 1;
    label = '正常';
    color = '#1ec98b';
    ratioText = `${(ratio * 100).toFixed(0)}%`;
    needsMaintenance = false;
  } else if (likes > 500) {
    ratioText = formatCount(comments);
    if (comments >= 50) {
      level = 'ok';
      severity = 1;
      label = '正常';
      color = '#1ec98b';
      needsMaintenance = false;
    } else if (comments < 10) {
      level = 'critical';
      severity = 4;
      label = '极低';
      color = '#f04352';
      needsMaintenance = true;
    } else if (comments < 25) {
      level = 'warning';
      severity = 3;
      label = '很低';
      color = '#f97316';
      needsMaintenance = true;
    } else {
      level = 'caution';
      severity = 2;
      label = '偏低';
      color = '#f5a623';
      needsMaintenance = true;
    }
  } else {
    // 10 < likes <= 500
    const ratio = comments / likes;
    ratioText = `${(ratio * 100).toFixed(0)}%`;
    if (ratio >= 0.1) {
      level = 'ok';
      severity = 1;
      label = '正常';
      color = '#1ec98b';
      needsMaintenance = false;
    } else if (ratio < 0.02) {
      level = 'critical';
      severity = 4;
      label = '极低';
      color = '#f04352';
      needsMaintenance = true;
    } else if (ratio < 0.05) {
      level = 'warning';
      severity = 3;
      label = '很低';
      color = '#f97316';
      needsMaintenance = true;
    } else {
      level = 'caution';
      severity = 2;
      label = '偏低';
      color = '#f5a623';
      needsMaintenance = true;
    }
  }

  return {
    level,
    severity,
    label,
    color,
    ratioText,
    needsMaintenance,
    globalCategory
  };
}


// 递归查找所有的 summary.json 文件并解析出包含的信息
function findSummaryFiles(baseDir) {
  const summaries = [];
  if (!existsSync(baseDir)) return summaries;

  function traverse(dir) {
    const files = readdirSync(dir);
    for (const file of files) {
      const fullPath = join(dir, file);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch (e) {
        continue;
      }
      if (stat.isDirectory()) {
        traverse(fullPath);
      } else if (file === 'summary.json') {
        try {
          const content = readFileSync(fullPath, 'utf8');
          const summary = JSON.parse(content);
          summaries.push({
            filePath: fullPath,
            data: summary
          });
        } catch (e) {
          console.error(`读取 ${fullPath} 失败:`, e.message);
        }
      }
    }
  }

  traverse(baseDir);
  return summaries;
}

function main() {
  console.log('[Dashboard] 开始读取数据并生成 VAM 团队监控矩阵...');

  // 1. 读取所有的 summary.json 并映射
  const summaryMap = new Map();
  const diskSummaries = findSummaryFiles(outputsDir);
  for (const s of diskSummaries) {
    if (s.data && s.data.id) {
      summaryMap.set(s.data.id, s);
    }
  }

  // 2. 读取 Excel 配置文件
  if (!existsSync(excelPath)) {
    console.error(`[Error] 找不到 Excel 文件: ${excelPath}`);
    process.exit(1);
  }

  const wb = XLSX.readFile(excelPath);
  const sheetName = '按人分组';
  if (!wb.SheetNames.includes(sheetName)) {
    console.error(`[Error] Excel 中找不到工作表: ${sheetName}`);
    process.exit(1);
  }

  const ws = wb.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 });
  
  const excelAccounts = [];
  for (const row of rawData) {
    if (!row || row.length < 5) continue;
    const seq = row[0];
    if (seq === null || seq === undefined || isNaN(Number(seq))) continue;
    if (Number(seq) <= 0) continue;

    const sec_user_id = String(row[3] || '').trim();
    if (!sec_user_id) continue;

    excelAccounts.push({
      index: Number(seq),
      person: String(row[1] || '').trim(),
      url: String(row[2] || '').trim(),
      sec_user_id,
      name: String(row[4] || '').trim(),
      excelFollowers: Number(row[5]) || 0,
      excelLikes: Number(row[6]) || 0,
      excelComments: Number(row[7]) || 0,
      outputPath: String(row[8] || '').trim()
    });
  }

  // 全局分类计数器
  const globalAlerts = {
    critical: 0,  // 极低
    warning: 0,   // 很低
    caution: 0,   // 偏低
    ok: 0,        // 正常
    muted: 0      // 基数小
  };

  let totalVideosCount = 0;
  let totalNeedsMaintenance = 0;

  // 3. 关联并分析视频明细
  const finalAccounts = excelAccounts.map(acct => {
    // 优先通过 sec_user_id 匹配
    let match = summaryMap.get(acct.sec_user_id);
    
    // 找不到就尝试通过人名+文件夹名匹配
    if (!match) {
      const parts = (acct.outputPath || '').split('/');
      const folderName = parts[parts.length - 1];
      if (folderName) {
        const altPath = join(outputsDir, acct.person, folderName, 'summary.json');
        if (existsSync(altPath)) {
          try {
            match = { filePath: altPath, data: JSON.parse(readFileSync(altPath, 'utf8')) };
          } catch (e) {}
        }
      }
    }

    const realData = match ? match.data : null;
    const summaryPath = match ? match.filePath : null;

    let videos = [];
    let isCollected = false;

    if (summaryPath) {
      isCollected = true;
      const folderDir = dirname(summaryPath);
      const videosPath = join(folderDir, 'videos.json');
      if (existsSync(videosPath)) {
        try {
          videos = JSON.parse(readFileSync(videosPath, 'utf8'));
        } catch (e) {
          console.error(`读取 ${videosPath} 失败:`, e.message);
        }
      }
    }

    // 分析所有视频并判定评级
    let needsMaintenanceCount = 0;
    const analyzedVideos = videos.map(v => {
      const classification = classifyVideo(v.likes, v.comments);
      
      // 累加全局统计
      if (classification.globalCategory === 'critical') globalAlerts.critical++;
      else if (classification.globalCategory === 'warning') globalAlerts.warning++;
      else if (classification.globalCategory === 'caution') globalAlerts.caution++;
      else if (classification.globalCategory === 'ok') globalAlerts.ok++;
      else if (classification.globalCategory === 'muted') globalAlerts.muted++;

      if (classification.needsMaintenance) {
        needsMaintenanceCount++;
        totalNeedsMaintenance++;
      }
      totalVideosCount++;

      return {
        id: v.id,
        type: v.type || 'video',
        title: v.title || '(无标题)',
        url: v.url || '#',
        likes: v.likes || 0,
        comments: v.comments || 0,
        level: classification.level,
        severity: classification.severity,
        color: classification.color,
        ratioText: classification.ratioText,
        needsMaintenance: classification.needsMaintenance
      };
    });

    // 对该账号 of 视频进行排序：严重级别高（severity 降序）优先，其次按点赞数（likes 降序）
    analyzedVideos.sort((a, b) => {
      if (b.severity !== a.severity) return b.severity - a.severity;
      return b.likes - a.likes;
    });

    // 确定当前账号创作者卡片的严重级别
    let creatorLevel = 'level-ok';
    const severities = analyzedVideos.map(v => v.level);
    if (severities.includes('critical')) creatorLevel = 'level-critical';
    else if (severities.includes('warning')) creatorLevel = 'level-warning';
    else if (severities.includes('caution')) creatorLevel = 'level-caution';
    else if (!isCollected) creatorLevel = 'missing';

    // 取前 5 个视频展示
    const topVideos = analyzedVideos.slice(0, 5);
    const moreVideosCount = analyzedVideos.length > 5 ? (analyzedVideos.length - 5) : 0;

    // 总粉丝、赞数、评论数
    const followers = realData ? (realData.followers || 0) : acct.excelFollowers;
    const likes = realData ? (realData.totalLikes || 0) : acct.excelLikes;
    const comments = realData ? (realData.totalComments || 0) : acct.excelComments;

    // 格式化展示的粉丝/赞数/比率
    const ratioStr = likes > 0 ? ((comments / likes) * 100).toFixed(1) + '%' : '0.0%';

    // 计算 reportUrl 相对路径
    let reportUrl = '#';
    if (summaryPath) {
      const relativeFolder = summaryPath.slice(outputsDir.length + 1).replace(/\\/g, '/');
      reportUrl = './' + relativeFolder.replace('summary.json', 'report.html');
    }

    return {
      index: acct.index,
      person: acct.person,
      sec_user_id: acct.sec_user_id,
      name: realData && realData.name ? realData.name : acct.name,
      followers,
      likes,
      comments,
      ratioStr,
      videoCount: analyzedVideos.length,
      needsMaintenanceCount,
      creatorLevel,
      topVideos,
      moreVideosCount,
      isCollected,
      reportUrl
    };
  });

  // 4. 按负责人 (owner) 进行分组
  const ownerMap = new Map();
  for (const acct of finalAccounts) {
    if (!ownerMap.has(acct.person)) {
      ownerMap.set(acct.person, {
        name: acct.person,
        creators: [],
        totalVideos: 0,
        needsMaintenance: 0
      });
    }
    const owner = ownerMap.get(acct.person);
    owner.creators.push(acct);
    owner.totalVideos += acct.videoCount;
    owner.needsMaintenance += acct.needsMaintenanceCount;
  }

  // 针对每个负责人的创作者进行排序：严重程度降序 -> 待维护数降序 -> 粉丝数降序
  for (const owner of ownerMap.values()) {
    owner.creators.sort((a, b) => {
      const getSeverity = (level) => {
        if (level === 'level-critical') return 4;
        if (level === 'level-warning') return 3;
        if (level === 'level-caution') return 2;
        if (level === 'level-ok') return 1;
        return 0; // missing
      };
      const sevA = getSeverity(a.creatorLevel);
      const sevB = getSeverity(b.creatorLevel);
      if (sevB !== sevA) return sevB - sevA;
      if (b.needsMaintenanceCount !== a.needsMaintenanceCount) {
        return b.needsMaintenanceCount - a.needsMaintenanceCount;
      }
      return b.followers - a.followers;
    });
  }

  // 负责人排序：按需要维护的视频数降序排列，以便管理者第一眼看到需要行动的人员
  const sortedOwners = Array.from(ownerMap.values()).sort((a, b) => {
    if (b.needsMaintenance !== a.needsMaintenance) return b.needsMaintenance - a.needsMaintenance;
    return b.totalVideos - a.totalVideos;
  });

  const collectedCount = finalAccounts.filter(a => a.isCollected).length;
  const missingCount = finalAccounts.length - collectedCount;
  const missingAccounts = finalAccounts.filter(a => !a.isCollected);

  // 5. 组装并生成 HTML 页面
  const htmlContent = generateMatrixHtml({
    generatedAt: new Date().toISOString(),
    totalPeople: sortedOwners.length,
    totalCreators: finalAccounts.length,
    collectedCount,
    missingCount,
    totalVideosCount,
    totalNeedsMaintenance,
    globalAlerts,
    owners: sortedOwners,
    missingAccounts
  });

  const destPath = join(outputsDir, 'index.html');
  writeFileSync(destPath, htmlContent, 'utf8');
  console.log(`[Dashboard] 成功生成矩阵监控面板: ${destPath}`);
}

function generateMatrixHtml(data) {
  const timeStr = new Date(data.generatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  // 渲染负责人板块
  const ownerBoardsHtml = data.owners.map(owner => {
    const creatorCardsHtml = owner.creators.map(c => {
      if (!c.isCollected) {
        return `
          <article class="creator-card missing">
            <div class="cc-header">
              <span class="cc-name">${c.name}</span>
              <span class="cc-status missing">未找到</span>
            </div>
            <div class="cc-empty">outputs/ 中无此账号</div>
          </article>
        `;
      }

      // 渲染该账号的前 5 个视频行
      const videoRowsHtml = c.topVideos.map(v => {
        const typeClass = v.type === 'image_text' ? 'badge type-img' : 'badge type-vid';
        const typeLabel = v.type === 'image_text' ? '图文' : '视频';
        const rowLevelClass = `vrow level-${v.level}`;
        const fmtLikes = formatCount(v.likes);
        const fmtComments = formatCount(v.comments);

        return `
          <a href="${v.url}" target="_blank" rel="noopener noreferrer" class="${rowLevelClass}">
            <span class="vrow-light" style="background:${v.color}">${v.ratioText}</span>
            <span class="vrow-title" title="${v.title}">${v.title}</span>
            <span class="vrow-meta">${fmtLikes}赞 / ${fmtComments}评</span>
            <span class="vrow-type ${typeClass}">${typeLabel}</span>
          </a>
        `;
      }).join('');

      const fmtCreatorLikes = formatCount(c.likes);
      const fmtCreatorComments = formatCount(c.comments);

      return `
        <article class="creator-card ${c.creatorLevel}">
          <div class="cc-header">
            <a href="${c.reportUrl}" target="_blank" class="cc-name" title="查看数据详情">${c.name}</a>
            <span class="cc-id">@${c.sec_user_id.slice(0, 8)}...</span>
          </div>
          <div class="cc-stats">
            <span class="cc-stat"><b>${c.videoCount}</b> 视频</span>
            <span class="cc-stat"><b>${fmtCreatorLikes}</b> 赞</span>
            <span class="cc-stat"><b>${fmtCreatorComments}</b> 评</span>
            <span class="cc-stat"><b>${c.ratioStr}</b> 比率</span>
          </div>
          <div class="cc-videos">
            ${videoRowsHtml}
            ${c.moreVideosCount > 0 ? `<div class="cc-more">+${c.moreVideosCount} 更多…</div>` : ''}
            ${c.videoCount === 0 ? '<div class="cc-empty">账号内暂无采集视频</div>' : ''}
          </div>
        </article>
      `;
    }).join('');

    const alertBadgeHtml = owner.needsMaintenance > 0 
      ? `<span class="alert-badge">${owner.needsMaintenance} 需维护</span>` 
      : `<span class="ok-badge">正常</span>`;

    return `
      <section class="owner-board">
        <div class="owner-header">
          <span class="owner-name">👤 ${owner.name}</span>
          <span class="owner-stats">
            ${owner.creators.length} 创作者 · ${owner.totalVideos} 视频
            ${alertBadgeHtml}
          </span>
        </div>
        <div class="creator-grid">
          ${creatorCardsHtml}
        </div>
      </section>
    `;
  }).join('');

  // 渲染缺失创作者的警告栏
  const warningsHtml = data.missingCount > 0
    ? `
      <div class="warnings">
        <div class="warnings-title">⚠️ 缺失创作者 (${data.missingCount})</div>
        <div class="warnings-text">
          以下账号未在 outputs/ 目录找到采集数据（可能未采集或拼写不匹配）：
          ${data.missingAccounts.map(a => `<b>${a.name} (${a.person})</b>`).join('，')}
        </div>
      </div>
    `
    : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>VAM 团队监控矩阵 · ${data.totalPeople} 人 · ${data.totalNeedsMaintenance} 待维护</title>

<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    margin: 0;
    background: #070b14;
    color: #e9ecf2;
    font-size: 14px;
    line-height: 1.4;
    -webkit-font-smoothing: antialiased;
    padding-bottom: 50px;
  }
  
  :root {
    --bg-root: #070b14;
    --bg-primary: #0a0f1c;
    --bg-secondary: #0f1629;
    --bg-tertiary: #161f3a;
    --bg-elevated: #1a2445;
    --bg-hover: #1e2a4f;
    --border: rgba(255,255,255,.06);
    --border-strong: rgba(255,255,255,.10);
    --border-accent: rgba(0,217,255,.18);
    --text-primary: #e9ecf2;
    --text-secondary: #8b95a8;
    --text-muted: #525c70;
    --text-high: #f4f6fa;
    --accent: #00d9ff;
    --accent-glow: rgba(0,217,255,.35);
    --accent-dim: rgba(0,217,255,.10);
    --radius-sm: 3px;
    --radius-md: 5px;
  }

  body::before {
    content: "";
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 9999;
    height: 1px;
    background: linear-gradient(90deg, transparent 0%, var(--accent) 20%, var(--accent-glow) 50%, var(--accent) 80%, transparent 100%);
    box-shadow: 0 0 10px var(--accent-glow), 0 0 30px var(--accent-glow);
    pointer-events: none;
  }

  .vam-header {
    position: relative;
    background: radial-gradient(ellipse 120% 300% at 15% 0%, rgba(0,217,255,.07) 0%, transparent 60%), linear-gradient(180deg, #0d1428 0%, var(--bg-primary) 100%);
    border-bottom: 1px solid var(--border-strong);
    padding: 14px 24px;
    display: flex;
    align-items: center;
    gap: 24px;
    flex-wrap: wrap;
  }

  .vam-brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .vam-logo {
    color: var(--accent);
    font-size: 22px;
    text-shadow: 0 0 10px var(--accent-glow), 0 0 20px var(--accent-glow);
    filter: drop-shadow(0 0 6px var(--accent-glow));
  }

  .vam-title {
    font-size: 17px;
    font-weight: 700;
    letter-spacing: .08em;
    color: var(--text-high);
  }

  .vam-stats {
    display: flex;
    gap: 0;
    flex: 1;
  }

  .vam-stats .stat {
    display: flex;
    flex-direction: column;
    padding: 6px 16px;
    border-right: 1px solid var(--border);
    min-width: 90px;
  }

  .vam-stats .stat:last-child {
    border-right: none;
  }

  .vam-stats .k {
    font-size: 10px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: .08em;
    margin-bottom: 3px;
  }

  .vam-stats .v {
    font-size: 20px;
    font-weight: 700;
    font-family: monospace;
    color: var(--text-high);
    line-height: 1.1;
  }

  .vam-stats .v-sm {
    font-size: 13px;
  }

  .vam-stats .v-alert {
    color: #f04352;
    text-shadow: 0 0 8px rgba(240,67,82,.4);
  }

  .vam-meta {
    font-size: 10px;
    color: var(--text-muted);
    font-family: monospace;
    margin-left: auto;
    opacity: .7;
  }

  main {
    padding: 16px 24px 20px;
    max-width: 1840px;
    margin: 0 auto;
  }

  section {
    margin-bottom: 18px;
  }

  .section-title {
    font-size: 13px;
    color: var(--text-high);
    font-weight: 600;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
    letter-spacing: .03em;
  }

  .section-title::before {
    content: "";
    display: inline-block;
    width: 3px;
    height: 14px;
    background: var(--accent);
    border-radius: 2px;
    box-shadow: 0 0 6px var(--accent-glow);
    flex-shrink: 0;
  }

  .alert-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
  }

  @media (max-width: 1100px) {
    .alert-grid { grid-template-columns: repeat(3, 1fr); }
  }

  @media (max-width: 700px) {
    .alert-grid { grid-template-columns: repeat(2, 1fr); }
  }

  .alert-card {
    position: relative;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-top: 3px solid var(--c, var(--border));
    border-radius: var(--radius-md);
    padding: 10px 12px;
  }

  .ac-label {
    font-size: 10px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: .07em;
    margin-bottom: 4px;
  }

  .ac-count {
    font-size: 24px;
    font-weight: 700;
    font-family: monospace;
    color: var(--c, var(--text-high));
    line-height: 1;
  }

  .warnings {
    background: rgba(245,158,11,.06);
    border-left: 3px solid #f5a623;
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    margin-top: 8px;
  }

  .warnings-title {
    font-size: 11px;
    font-weight: 600;
    color: #f5a623;
    margin-bottom: 4px;
  }

  .warnings-text {
    font-size: 11px;
    color: var(--text-secondary);
  }

  .owner-board {
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 12px;
    margin-bottom: 12px;
  }

  .owner-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
  }

  .owner-name {
    font-size: 15px;
    font-weight: 700;
    color: var(--text-high);
    letter-spacing: .02em;
  }

  .owner-stats {
    font-size: 11px;
    color: var(--text-muted);
    font-family: monospace;
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
  }

  .alert-badge {
    background: rgba(240,67,82,.2);
    color: #f04352;
    padding: 2px 8px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .04em;
  }

  .ok-badge {
    background: rgba(30,201,139,.2);
    color: #1ec98b;
    padding: 2px 8px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 700;
  }

  .creator-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 8px;
  }

  .creator-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-left: 3px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 8px 10px;
    transition: border-color .15s, background .15s;
  }

  .creator-card:hover {
    border-color: var(--border-accent);
    background: var(--bg-tertiary);
  }

  .creator-card.missing {
    border-left-color: #525c70;
    opacity: .6;
  }

  .creator-card.level-critical {
    border-left-color: #f04352;
    box-shadow: inset 0 0 0 1px rgba(240,67,82,.15);
  }

  .creator-card.level-warning {
    border-left-color: #f97316;
  }

  .creator-card.level-caution {
    border-left-color: #f5a623;
  }

  .creator-card.level-ok {
    border-left-color: #1ec98b;
  }

  .cc-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }

  .cc-name {
    font-size: 12px;
    font-weight: 700;
    color: var(--text-high);
    letter-spacing: .01em;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  a.cc-name {
    text-decoration: none;
    transition: color .12s;
  }

  a.cc-name:hover {
    color: var(--accent);
    text-decoration: underline;
  }


  .cc-id {
    font-size: 10px;
    color: var(--text-muted);
    font-family: monospace;
  }

  .cc-status {
    font-size: 9px;
    padding: 1px 4px;
    border-radius: 2px;
  }

  .cc-status.missing {
    background: rgba(82,92,112,.2);
    color: #8b95a8;
  }

  .cc-stats {
    display: flex;
    gap: 8px;
    margin-bottom: 6px;
    font-size: 10px;
    color: var(--text-muted);
    font-family: monospace;
    flex-wrap: wrap;
  }

  .cc-stats .cc-stat b {
    color: var(--text-primary);
    font-weight: 700;
    margin-right: 2px;
  }

  .cc-videos {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .vrow {
    display: flex;
    align-items: stretch;
    height: 22px;
    background: #10172c;
    border-radius: 2px;
    text-decoration: none;
    color: inherit;
    font-family: monospace;
    font-size: 10px;
    overflow: hidden;
    transition: background .12s, transform .12s;
  }

  .vrow:nth-child(even) {
    background: #0c1224;
  }

  .vrow:hover {
    background: var(--bg-hover);
    transform: translateX(2px);
  }

  .vrow.level-critical {
    box-shadow: inset 3px 0 0 #f04352;
  }

  .vrow.level-warning {
    box-shadow: inset 3px 0 0 #f97316;
  }

  .vrow.level-caution {
    box-shadow: inset 3px 0 0 #f5a623;
  }

  .vrow-light {
    min-width: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    color: #080e1a;
    font-size: 10px;
    flex-shrink: 0;
  }

  .vrow-title {
    flex: 1;
    padding: 0 6px;
    display: flex;
    align-items: center;
    font-family: -apple-system, sans-serif;
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text-primary);
  }

  .vrow-meta {
    font-size: 10px;
    color: var(--text-muted);
    padding: 0 6px;
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .vrow-type {
    font-size: 9px;
    padding: 0 4px;
    display: flex;
    align-items: center;
    flex-shrink: 0;
    font-weight: 600;
  }

  .badge.type-vid {
    background: rgba(59,130,246,.2);
    color: #60a5fa;
  }

  .badge.type-img {
    background: rgba(236,72,153,.2);
    color: #f472b6;
  }

  .cc-more {
    font-size: 10px;
    color: var(--text-muted);
    padding: 2px 0 0 6px;
    font-style: italic;
  }

  .cc-empty {
    font-size: 11px;
    color: var(--text-muted);
    padding: 4px 0;
  }
</style>
</head>
<body>

<header class="vam-header">
  <div class="vam-brand">
    <span class="vam-logo">◉</span>
    <span class="vam-title">VAM 团队监控矩阵</span>
  </div>
  <div class="vam-stats">
    <div class="stat"><span class="k">团队成员</span><span class="v">${data.totalPeople}</span></div>
    <div class="stat"><span class="k">创作者</span><span class="v">${data.collectedCount}/${data.totalCreators}</span></div>
    <div class="stat"><span class="k">监控视频</span><span class="v">${data.totalVideosCount}</span></div>
    <div class="stat"><span class="k">需维护</span><span class="v v-alert">${data.totalNeedsMaintenance}</span></div>
    <div class="stat"><span class="k">阈值</span><span class="v v-sm">评论 &lt; 10%×点赞</span></div>
  </div>
  <div class="vam-meta">生成于 ${timeStr}</div>
</header>
<main>

<section class="alert-summary">
  <div class="section-title">🚨 维护提醒汇总 <span class="hint" style="color:var(--text-secondary);font-weight:normal;margin-left:10px;">规则: likes≤10 放行, 10&lt;likes≤500 走 1/10, likes&gt;500 仅需 ≥50 评</span></div>
  <div class="alert-grid">
    <div class="alert-card" style="--c:#f04352">
      <div class="ac-label">极低 (&lt; 2% / &lt;10评)</div>
      <div class="ac-count">${data.globalAlerts.critical}</div>
    </div>
    <div class="alert-card" style="--c:#f97316">
      <div class="ac-label">很低 (2-5% / 10-24评)</div>
      <div class="ac-count">${data.globalAlerts.warning}</div>
    </div>
    <div class="alert-card" style="--c:#f5a623">
      <div class="ac-label">偏低 (5-10% / 25-49评)</div>
      <div class="ac-count">${data.globalAlerts.caution}</div>
    </div>
    <div class="alert-card" style="--c:#1ec98b">
      <div class="ac-label">正常 (≥10% / ≥50评)</div>
      <div class="ac-count">${data.globalAlerts.ok}</div>
    </div>
    <div class="alert-card" style="--c:#525c70">
      <div class="ac-label">基数小/无数据 (likes≤10)</div>
      <div class="ac-count">${data.globalAlerts.muted}</div>
    </div>
  </div>
  ${warningsHtml}
</section>

<section class="matrix-list">
  <div class="section-title">👤 团队负责人看板</div>
  ${ownerBoardsHtml}
</section>

</main>
</body>
</html>`;
}

main();

