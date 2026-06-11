#!/usr/bin/env node
/**
 * scripts/miner.mjs
 * keyboards_skill - 长尾词库挖掘工具 (Long-tail Keyword Miner)
 * 
 * 自动拦截 Douyin Search Suggest API 并生成 A-Z 和 0-9 的长尾词。
 */

import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { openDb, upsertKeywordSuggestions, getKeywordSuggestionsByRoot } from './db.mjs';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const projectRoot = join(__dirname, '..');
const profilePath = join(projectRoot, 'private', 'profiles', 'douyin');

// ── Parse CLI args ────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, val, i, arr) => {
    if (val.startsWith('--')) acc.push([val.slice(2), arr[i + 1] || true]);
    return acc;
  }, [])
);

const coreKeyword = args.keyword;
const delayMs     = Number(args.delay) || 2000;

if (!coreKeyword || coreKeyword === true) {
  console.error('[Miner] ❌ 请指定核心关键词。示例：node scripts/miner.mjs --keyword 发膜');
  process.exit(1);
}

// ── Build Query List ──────────────────────────────────────────────────────────
const queries = [coreKeyword];

// A-Z
for (let i = 97; i <= 122; i++) {
  queries.push(`${coreKeyword} ${String.fromCharCode(i)}`);
}

// 0-9
for (let i = 0; i <= 9; i++) {
  queries.push(`${coreKeyword} ${i}`);
}

// Common Suffixes
const suffixes = ['怎么', '推荐', '哪个好', '测评', '排行榜', '多少钱', '区别'];
for (const suffix of suffixes) {
  queries.push(`${coreKeyword}${suffix}`);
  queries.push(`${coreKeyword} ${suffix}`); // Added spaced suffix
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`[Miner] 🚀 开始挖掘长尾词...`);
  console.log(`[Miner] 核心大词: ${coreKeyword}`);
  console.log(`[Miner] 将执行 ${queries.length} 次搜索探测`);

  const db = openDb();
  
  // 清理该核心大词的历史数据，实现全新覆盖
  db.prepare('DELETE FROM keyword_suggestions WHERE root_keyword = ?').run(coreKeyword);
  console.log(`[Miner] 🧹 已清理 '${coreKeyword}' 的历史数据，准备全新覆盖...`);
  
  const sessionStartTime = new Date().toISOString();
  const allCapturedWords = [];

  // Launch browser with persistent context
  if (!existsSync(dirname(profilePath))) mkdirSync(dirname(profilePath), { recursive: true });
  
  const context = await chromium.launchPersistentContext(profilePath, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    channel: 'chrome', 
    args: ['--disable-blink-features=AutomationControlled']
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  // Stealth
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  // Current query state
  let currentQuery = '';
  let capturedForCurrent = false;

  // Intercept Suggest API
  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('/aweme/v1/web/discover/search/suggest/') || url.includes('/sug/')) {
      try {
        const json = await res.json();
        let words = [];
        
        // Extract words based on douyin's payload structure
        if (json.sug_list && Array.isArray(json.sug_list)) {
          words = json.sug_list.map(s => s.content || s.word).filter(Boolean);
        } else if (json.data && Array.isArray(json.data)) {
          words = json.data.map(s => s.content || s.word || s.keyword).filter(Boolean);
        }
        
        if (words.length > 0 && currentQuery) {
          const rows = words.map((word, idx) => ({
            suggestion: word,
            root_keyword: coreKeyword,
            source_query: currentQuery,
            captured_at: new Date().toISOString(),
            rank: idx + 1
          }));
          
          allCapturedWords.push(...rows);
          console.log(`  [拦截成功] '${currentQuery}' -> 捕获 ${words.length} 个长尾词 (例如: ${words[0]})`);
          capturedForCurrent = true;
          
          // Save to DB immediately
          upsertKeywordSuggestions(db, rows);
        }
      } catch (e) {
        // Ignore parse errors silently
      }
    }
  });

  console.log('[Miner] 正在打开抖音首页...');
  await page.goto('https://www.douyin.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000); // 增加等待时间以防出现 Please wait...

  // Try to find the search input field
  const searchSelectors = [
    'input[data-e2e="searchbar-input"]',
    'input.search-input',
    'input[placeholder*="搜索"]',
    'input[type="text"]',
    '[data-e2e="searchbar-input"]'
  ];
  
  let searchInput = null;
  for (const sel of searchSelectors) {
    if (await page.$(sel)) {
      searchInput = sel;
      break;
    }
  }

  if (!searchInput) {
    console.error('[Miner] ❌ 找不到搜索框，请确认页面是否需要验证码或登录。');
    // Try to take a screenshot for debugging
    await page.screenshot({ path: 'miner_error.png' });
    console.error('[Miner] 📸 已保存错误截图到 miner_error.png');
    await context.close();
    process.exit(1);
  }

  console.log('[Miner] 准备就绪，正在检测搜索框是否可用 (若有登录弹窗，请在这 60 秒内手动关闭或扫码)...');
  try {
    // 尝试点击一下搜索框，如果被遮挡会等待，最多等 60 秒
    await page.click(searchInput, { timeout: 60000 });
    console.log('[Miner] 搜索框可用，开始批量探测！');
  } catch (e) {
    console.log('[Miner] ⚠️ 警告: 等待搜索框超时，页面可能被弹窗遮挡。尝试继续执行...');
  }

  // Iterate over all queries
  for (let i = 0; i < queries.length; i++) {
    currentQuery = queries[i];
    capturedForCurrent = false;
    console.log(`\n[Miner] 探测 (${i+1}/${queries.length}): ${currentQuery}`);

    try {
      // Focus and clear input
      await page.click(searchInput);
      
      // Select all text and delete it
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(500);

      // Type the query slowly to trigger the suggest API
      await page.keyboard.type(currentQuery, { delay: 150 });
      
      // Wait for API to respond
      let waitCount = 0;
      while (!capturedForCurrent && waitCount < 10) {
        await page.waitForTimeout(300);
        waitCount++;
      }
      
      if (!capturedForCurrent) {
          // If fill doesn't trigger, try pressing space
          await page.keyboard.press('Space');
          await page.keyboard.press('Backspace');
          await page.waitForTimeout(1000);
      }

    } catch (e) {
      console.log(`  [警告] 探测 '${currentQuery}' 时出现错误: ${e.message}`);
    }

    await page.waitForTimeout(delayMs);
  }

  console.log(`\n[Miner] 🎉 挖掘完成！共执行 ${queries.length} 次探测。`);
  
  // Clean up deduplication count
  const allWordsForRoot = getKeywordSuggestionsByRoot(db, coreKeyword);
  console.log(`[Miner] 数据库中 '${coreKeyword}' 相关的去重长尾词库总量为: ${allWordsForRoot.length} 个。`);
  
  // ── Generate Specific Export ───────────────────────────────────────────────
  const keywordDir = join(projectRoot, 'outputs', 'keywords', coreKeyword);
  if (!existsSync(keywordDir)) mkdirSync(keywordDir, { recursive: true });

  // 1. Export Excel (Only include records captured/updated in THIS session)
  const sessionData = allWordsForRoot.filter(k => k.captured_at >= sessionStartTime);
  const keywordRows = sessionData.map(k => {
    const parts = k.source_query.split(' ');
    const isTextSuffix = parts.length > 1 && parts[1].length > 1;
    const displaySource = isTextSuffix ? k.source_query.replace(' ', '(带空格) ') : k.source_query;
    return {
      '最高推荐排名': k.rank === 999 ? '-' : k.rank,
      '核心大词':     k.root_keyword,
      '长尾精准词':   k.suggestion,
      '触发搜索词':   displaySource,
      '挖掘时间':     k.captured_at,
    };
  });
  
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(keywordRows), 'Keywords');
  const excelPath = join(keywordDir, `${coreKeyword}_长尾词库.xlsx`);
  XLSX.writeFile(wb, excelPath);
  console.log(`[Miner] 📊 专属 Excel 导出成功: ${excelPath}`);

  // 2. Export HTML Webpage
  const groupedData = {};
  for (const k of sessionData) {
    if (!groupedData[k.source_query]) groupedData[k.source_query] = [];
    groupedData[k.source_query].push(k);
  }

  const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>${coreKeyword} - 长尾词挖掘报告</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; padding: 20px; background-color: #f5f5f7; color: #333; }
        h1 { text-align: center; color: #1a1a1a; margin-bottom: 5px; }
        .header-meta { text-align: center; color: #666; margin-bottom: 30px; font-size: 0.95em; }
        
        /* Grid Layout for Boxes */
        .grid-container {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
            gap: 20px;
            max-width: 1400px;
            margin: 0 auto;
        }
        
        /* Individual Search Box */
        .search-box {
            background: #fff;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.06);
            overflow: hidden;
            display: flex;
            flex-direction: column;
            border: 1px solid #eaeaea;
        }
        
        .box-header {
            background-color: #f8f9fa;
            padding: 15px 20px;
            border-bottom: 1px solid #eee;
            font-size: 1.1em;
            font-weight: 600;
            color: #2c3e50;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .box-header .count {
            font-size: 0.8em;
            background: #eef2f5;
            padding: 3px 8px;
            border-radius: 12px;
            color: #666;
            font-weight: normal;
        }

        .word-list {
            list-style: none;
            padding: 0;
            margin: 0;
        }

        .word-item {
            padding: 12px 20px;
            border-bottom: 1px solid #f5f5f5;
            display: flex;
            align-items: center;
        }
        .word-item:last-child {
            border-bottom: none;
        }
        .word-item:hover {
            background-color: #fcfcfd;
        }

        .rank-badge {
            width: 24px;
            height: 24px;
            background: #f0f4f8;
            color: #0066cc;
            border-radius: 50%;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 0.85em;
            font-weight: bold;
            margin-right: 15px;
            flex-shrink: 0;
        }
        
        /* Highlight top 3 ranks */
        .rank-badge[data-rank="1"] { background: #ffebee; color: #d32f2f; }
        .rank-badge[data-rank="2"] { background: #fff3e0; color: #ef6c00; }
        .rank-badge[data-rank="3"] { background: #f1f8e9; color: #33691e; }

        .suggestion {
            font-size: 0.95em;
            color: #333;
            word-break: break-all;
        }
    </style>
</head>
<body>
    <h1>🔍 "${coreKeyword}" 专属长尾词挖掘报告</h1>
    <div class="header-meta">
        共挖掘 <strong>${Object.keys(groupedData).length}</strong> 个触发词，合计 <strong>${sessionData.length}</strong> 个排名长尾词 | 导出时间：${new Date().toLocaleString()}
    </div>
    
    <div class="grid-container">
        ${Object.keys(groupedData).map(query => {
            const parts = query.split(' ');
            const isTextSuffix = parts.length > 1 && parts[1].length > 1;
            const displayQuery = isTextSuffix ? query.replace(' ', '<span style="background-color:#ffeaa7; padding:2px 4px; border-radius:4px; font-size:0.75em; margin:0 4px; color:#d35400;">带空格</span>') : query;
            return `
        <div class="search-box">
            <div class="box-header">
                <span>触发词：<span style="color:#0066cc;">${displayQuery}</span></span>
                <span class="count">${groupedData[query].length} 个</span>
            </div>
            <ul class="word-list">
                ${groupedData[query].map(k => `
                <li class="word-item">
                    <span class="rank-badge" data-rank="${k.rank}">${k.rank === 999 ? '-' : k.rank}</span>
                    <span class="suggestion">${k.suggestion}</span>
                </li>
                `).join('')}
            </ul>
        </div>
        `}).join('')}
    </div>
</body>
</html>`;
  
  const fs = require('node:fs');
  const htmlPath = join(keywordDir, `${coreKeyword}_长尾词报告.html`);
  fs.writeFileSync(htmlPath, htmlContent, 'utf-8');
  console.log(`[Miner] 🌐 专属网页展示导出成功: ${htmlPath}`);

  db.close();
  await context.close();
  
  console.log(`\n[Miner] 全部流程处理完毕！`);
})();
