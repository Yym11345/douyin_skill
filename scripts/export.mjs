#!/usr/bin/env node
/**
 * scripts/export.mjs
 * douyin_skill v3.5 — 从 SQLite 导出 Excel
 *
 * 用法：
 *   node scripts/export.mjs                      # 导出到 outputs/Douyin_All_Data.xlsx
 *   node scripts/export.mjs --out ./my_export.xlsx
 *
 * 保持与旧版 Excel 完全相同的两 sheet 格式（Summary / Videos），向后兼容。
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { openDb, getAllAccounts, getAllVideos, getAllKeywordSuggestions, DEFAULT_DB_PATH } from './db.mjs';

const require = createRequire(import.meta.url);
const XLSX    = require('xlsx');

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ── Parse CLI args ────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, val, i, arr) => {
    if (val.startsWith('--')) acc.push([val.slice(2), arr[i + 1] || true]);
    return acc;
  }, [])
);

const outPath = args.out || join(__dirname, '..', 'outputs', 'Douyin_All_Data.xlsx');

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  if (!existsSync(DEFAULT_DB_PATH)) {
    console.error(`[Export] 未找到数据库文件：${DEFAULT_DB_PATH}`);
    console.error('[Export] 请先运行 node scripts/collect.mjs 采集数据。');
    process.exit(1);
  }

  const db = openDb(DEFAULT_DB_PATH);

  // ── Load data ──────────────────────────────────────────────────────────────
  const accounts = getAllAccounts(db);
  const videos   = getAllVideos(db);
  const keywords = getAllKeywordSuggestions(db);
  db.close();

  console.log(`[Export] 加载数据：${accounts.length} 个账号，${videos.length} 个视频，${keywords.length} 个长尾词`);

  // ── Build Summary sheet rows (column order matches legacy Excel) ───────────
  const summaryRows = accounts.map(a => ({
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
  }));

  // ── Build Videos sheet rows ───────────────────────────────────────────────
  const videoRows = videos.map(v => ({
    person:       v.person,
    account_name: v.account_name,
    account_id:   v.account_id,
    id:           v.id,
    type:         v.type,
    title:        String(v.title || '').slice(0, 32767),
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
  }));

  // ── Build Keywords sheet rows ─────────────────────────────────────────────
  const keywordRows = keywords.map(k => ({
    '核心大词':     k.root_keyword,
    '长尾精准词':   k.suggestion,
    '触发搜索词':   k.source_query,
    '挖掘时间':     k.captured_at,
  }));

  // ── Write Excel ───────────────────────────────────────────────────────────
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(videoRows),   'Videos');
  if (keywordRows.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(keywordRows), 'Keywords');
  }

  // Ensure output dir exists
  const outDir = dirname(outPath);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  XLSX.writeFile(wb, outPath);
  console.log(`[Export] ✅ 已导出：${outPath}`);
  console.log(`[Export]    Summary: ${summaryRows.length} 行  |  Videos: ${videoRows.length} 行  |  Keywords: ${keywordRows.length} 行`);
})();
