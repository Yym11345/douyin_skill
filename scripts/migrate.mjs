#!/usr/bin/env node
/**
 * scripts/migrate.mjs
 * douyin_skill v3.5 — 历史 Excel 数据迁移到 SQLite
 *
 * 读取 outputs/Douyin_All_Data.xlsx（旧版数据）并写入 SQLite。
 * 只需运行一次。迁移后请保留 Excel 作为备份。
 *
 * 用法：
 *   node scripts/migrate.mjs
 *   node scripts/migrate.mjs --excel ./outputs/Douyin_All_Data.xlsx
 */

import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { openDb, upsertAccount, upsertVideos, DEFAULT_DB_PATH } from './db.mjs';

const require = createRequire(import.meta.url);
const XLSX    = require('xlsx');

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ── Parse CLI args ────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
let excelPath = join(__dirname, '..', 'outputs', 'Douyin_All_Data.xlsx');
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--excel' && argv[i + 1]) excelPath = argv[i + 1];
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  if (!existsSync(excelPath)) {
    console.error(`[Migrate] 未找到 Excel 文件：${excelPath}`);
    console.error('[Migrate] 如没有历史数据可直接跳过本脚本。');
    process.exit(0);
  }

  console.log(`[Migrate] 读取 Excel：${excelPath}`);
  let wb;
  try {
    wb = XLSX.readFile(excelPath);
  } catch (e) {
    console.error(`[Migrate] Excel 读取失败：${e.message}`);
    process.exit(1);
  }

  // ── Read Summary ──────────────────────────────────────────────────────────
  let summaries = [];
  if (wb.SheetNames.includes('Summary')) {
    summaries = XLSX.utils.sheet_to_json(wb.Sheets['Summary']);
    console.log(`[Migrate] Summary sheet: ${summaries.length} 行`);
  } else {
    console.warn('[Migrate] 未找到 Summary sheet，跳过账号导入。');
  }

  // ── Read Videos ───────────────────────────────────────────────────────────
  let videoRows = [];
  if (wb.SheetNames.includes('Videos')) {
    videoRows = XLSX.utils.sheet_to_json(wb.Sheets['Videos']);
    console.log(`[Migrate] Videos sheet: ${videoRows.length} 行`);
  } else {
    console.warn('[Migrate] 未找到 Videos sheet，跳过视频导入。');
  }

  // ── Open DB ───────────────────────────────────────────────────────────────
  const db = openDb(DEFAULT_DB_PATH);

  // ── Migrate accounts ──────────────────────────────────────────────────────
  let accCount = 0;
  for (const s of summaries) {
    if (!s.id) continue;
    upsertAccount(db, {
      id:             String(s.id),
      person:         String(s.person || ''),
      name:           String(s.name || ''),
      platform:       String(s.platform || 'douyin'),
      followers:      Number(s.followers) || 0,
      video_count:    Number(s.videoCount) || 0,
      total_likes:    Number(s.totalLikes) || 0,
      total_comments: Number(s.totalComments) || 0,
      url:            String(s.url || ''),
      fetched_at:     String(s.fetchedAt || ''),
    });
    accCount++;
  }
  console.log(`[Migrate] ✅ 账号已迁移：${accCount} 个`);

  // ── Migrate videos (batch by account) ────────────────────────────────────
  // Group by account_id first
  const byAccount = new Map();
  for (const v of videoRows) {
    const aid = String(v.account_id || '');
    if (!aid) continue;
    if (!byAccount.has(aid)) byAccount.set(aid, []);
    byAccount.get(aid).push({
      id:           String(v.id || ''),
      account_id:   aid,
      person:       String(v.person || ''),
      account_name: String(v.account_name || ''),
      type:         String(v.type || 'video'),
      title:        String(v.title || ''),
      url:          String(v.url || ''),
      published_at: String(v.publishedAt || ''),
      duration:     String(v.duration || ''),
      is_top:       Number(v.isTop) || 0,
      likes:        Number(v.likes) || 0,
      comments:     Number(v.comments) || 0,
      shares:       Number(v.shares) || 0,
      favorites:    Number(v.favorites) || 0,
      tags:         String(v.tags || ''),
      music_title:  String(v.musicTitle || ''),
    });
  }

  let vidCount = 0;
  for (const [aid, rows] of byAccount) {
    upsertVideos(db, rows);
    vidCount += rows.length;
  }
  console.log(`[Migrate] ✅ 视频已迁移：${vidCount} 条`);

  db.close();

  console.log('\n[Migrate] 迁移完成！');
  console.log(`  数据库位置：${DEFAULT_DB_PATH}`);
  console.log('  原 Excel 文件已保留作为备份，可在确认数据无误后删除。');
})();
