#!/usr/bin/env node
/**
 * scripts/db.mjs
 * douyin_skill v3.5 — SQLite 数据访问层
 *
 * 使用 better-sqlite3（同步 API），封装所有数据库操作。
 * 数据库文件默认位于 outputs/douyin.db
 *
 * 导出：
 *   openDb(dbPath?)           — 打开/初始化数据库，返回 Database 实例
 *   upsertAccount(db, row)    — 账号 upsert
 *   upsertVideos(db, rows)    — 批量视频 upsert（事务）
 *   getAllAccounts(db)         — 返回所有账号数组
 *   getVideosByAccount(db, id) — 返回指定账号的所有视频
 *   getAllVideos(db)            — 返回所有视频
 */

import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync } from 'node:fs';

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DEFAULT_DB_PATH = join(__dirname, '..', 'outputs', 'douyin.db');

// ── Schema DDL ────────────────────────────────────────────────────────────────

const DDL = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous  = NORMAL;

CREATE TABLE IF NOT EXISTS accounts (
  id             TEXT PRIMARY KEY,  -- sec_user_id
  person         TEXT DEFAULT '',   -- 负责人
  name           TEXT DEFAULT '',   -- 昵称
  platform       TEXT DEFAULT 'douyin',
  followers      INTEGER DEFAULT 0,
  video_count    INTEGER DEFAULT 0,
  total_likes    INTEGER DEFAULT 0,
  total_comments INTEGER DEFAULT 0,
  url            TEXT DEFAULT '',
  fetched_at     TEXT DEFAULT ''    -- ISO 8601
);

CREATE TABLE IF NOT EXISTS videos (
  id           TEXT NOT NULL,        -- aweme_id
  account_id   TEXT NOT NULL,        -- FK → accounts.id
  person       TEXT DEFAULT '',
  account_name TEXT DEFAULT '',
  type         TEXT DEFAULT 'video', -- video/image_text/live_replay/live
  title        TEXT DEFAULT '',
  url          TEXT DEFAULT '',
  published_at TEXT DEFAULT '',
  duration     TEXT DEFAULT '',
  is_top       INTEGER DEFAULT 0,
  likes        INTEGER DEFAULT 0,
  comments     INTEGER DEFAULT 0,
  shares       INTEGER DEFAULT 0,
  favorites    INTEGER DEFAULT 0,
  tags         TEXT DEFAULT '',      -- 空格分隔
  music_title  TEXT DEFAULT '',
  PRIMARY KEY (id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_videos_account  ON videos(account_id);
CREATE INDEX IF NOT EXISTS idx_videos_person   ON videos(person);
CREATE INDEX IF NOT EXISTS idx_accounts_person ON accounts(person);

CREATE TABLE IF NOT EXISTS keyword_suggestions (
  suggestion   TEXT,
  root_keyword TEXT DEFAULT '',
  source_query TEXT DEFAULT '',
  captured_at  TEXT DEFAULT '',
  rank         INTEGER DEFAULT 999,
  PRIMARY KEY (root_keyword, source_query, suggestion)
);

CREATE INDEX IF NOT EXISTS idx_keyword_suggestions_root ON keyword_suggestions(root_keyword);
`;

// ── openDb ────────────────────────────────────────────────────────────────────

/**
 * 打开（或创建）SQLite 数据库，自动建表和索引。
 * @param {string} [dbPath] 数据库文件路径，默认 outputs/douyin.db
 * @returns {import('better-sqlite3').Database}
 */
export function openDb(dbPath = DEFAULT_DB_PATH) {
  // 确保 outputs/ 目录存在
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (e) {
    throw new Error(
      `[db] 缺少依赖 better-sqlite3。请运行：npm install better-sqlite3\n原始错误：${e.message}`
    );
  }

  const db = new Database(dbPath);
  db.exec(DDL);
  
    // Schema migration for rank is no longer needed as we recreated the table.
    // Try to restore old data if available
    try {
      db.exec(`
        INSERT OR IGNORE INTO keyword_suggestions (suggestion, root_keyword, source_query, captured_at, rank)
        SELECT suggestion, root_keyword, source_query, captured_at, rank FROM keyword_suggestions_old;
      `);
      db.exec("DROP TABLE keyword_suggestions_old;");
    } catch (e) {
      // Ignored
    }
  
  return db;
}

// ── upsertAccount ─────────────────────────────────────────────────────────────

/**
 * 插入或更新账号信息（以 id 为主键）。
 * @param {import('better-sqlite3').Database} db
 * @param {{
 *   id: string, person?: string, name?: string, platform?: string,
 *   followers?: number, video_count?: number, total_likes?: number,
 *   total_comments?: number, url?: string, fetched_at?: string
 * }} row
 */
export function upsertAccount(db, row) {
  const stmt = db.prepare(`
    INSERT INTO accounts
      (id, person, name, platform, followers, video_count, total_likes, total_comments, url, fetched_at)
    VALUES
      (@id, @person, @name, @platform, @followers, @video_count, @total_likes, @total_comments, @url, @fetched_at)
    ON CONFLICT(id) DO UPDATE SET
      person         = excluded.person,
      name           = excluded.name,
      platform       = excluded.platform,
      followers      = excluded.followers,
      video_count    = excluded.video_count,
      total_likes    = excluded.total_likes,
      total_comments = excluded.total_comments,
      url            = excluded.url,
      fetched_at     = excluded.fetched_at
  `);
  stmt.run({
    id:             String(row.id || ''),
    person:         String(row.person || ''),
    name:           String(row.name || ''),
    platform:       String(row.platform || 'douyin'),
    followers:      Number(row.followers) || 0,
    video_count:    Number(row.video_count) || 0,
    total_likes:    Number(row.total_likes) || 0,
    total_comments: Number(row.total_comments) || 0,
    url:            String(row.url || ''),
    fetched_at:     String(row.fetched_at || new Date().toISOString()),
  });
}

// ── upsertVideos ──────────────────────────────────────────────────────────────

/**
 * 批量插入或更新视频记录（事务包裹，提升性能）。
 * @param {import('better-sqlite3').Database} db
 * @param {Array<object>} rows
 */
export function upsertVideos(db, rows) {
  if (!rows || rows.length === 0) return;

  const stmt = db.prepare(`
    INSERT INTO videos
      (id, account_id, person, account_name, type, title, url, published_at,
       duration, is_top, likes, comments, shares, favorites, tags, music_title)
    VALUES
      (@id, @account_id, @person, @account_name, @type, @title, @url, @published_at,
       @duration, @is_top, @likes, @comments, @shares, @favorites, @tags, @music_title)
    ON CONFLICT(id, account_id) DO UPDATE SET
      person       = excluded.person,
      account_name = excluded.account_name,
      type         = excluded.type,
      title        = excluded.title,
      url          = excluded.url,
      published_at = excluded.published_at,
      duration     = excluded.duration,
      is_top       = excluded.is_top,
      likes        = excluded.likes,
      comments     = excluded.comments,
      shares       = excluded.shares,
      favorites    = excluded.favorites,
      tags         = excluded.tags,
      music_title  = excluded.music_title
  `);

  const insertMany = db.transaction((items) => {
    for (const v of items) {
      stmt.run({
        id:           String(v.id || ''),
        account_id:   String(v.account_id || ''),
        person:       String(v.person || ''),
        account_name: String(v.account_name || ''),
        type:         String(v.type || 'video'),
        title:        String(v.title || '').slice(0, 32767),
        url:          String(v.url || ''),
        published_at: String(v.published_at || ''),
        duration:     String(v.duration || ''),
        is_top:       v.is_top ? 1 : 0,
        likes:        Number(v.likes) || 0,
        comments:     Number(v.comments) || 0,
        shares:       Number(v.shares) || 0,
        favorites:    Number(v.favorites) || 0,
        tags:         String(v.tags || ''),
        music_title:  String(v.music_title || ''),
      });
    }
  });

  insertMany(rows);
}

// ── Query Helpers ─────────────────────────────────────────────────────────────

/**
 * 返回所有账号，按 person → followers DESC 排序。
 * @param {import('better-sqlite3').Database} db
 * @returns {Array<object>}
 */
export function getAllAccounts(db) {
  return db
    .prepare('SELECT * FROM accounts ORDER BY person ASC, followers DESC')
    .all();
}

/**
 * 返回指定账号的所有视频，按 published_at DESC 排序。
 * @param {import('better-sqlite3').Database} db
 * @param {string} accountId
 * @returns {Array<object>}
 */
export function getVideosByAccount(db, accountId) {
  return db
    .prepare('SELECT * FROM videos WHERE account_id = ? ORDER BY published_at DESC')
    .all(String(accountId));
}

/**
 * 返回所有视频，按 person → account_name → published_at DESC 排序。
 * @param {import('better-sqlite3').Database} db
 * @returns {Array<object>}
 */
export function getAllVideos(db) {
  return db
    .prepare(`
      SELECT * FROM videos
      ORDER BY person ASC, account_name ASC, published_at DESC
    `)
    .all();
}

/**
 * 批量加载所有账号+视频（dashboard 专用，减少多次查询开销）。
 * 返回 { summaryMap: Map<id, accountRow>, videosMap: Map<id, videoRow[]> }
 * @param {import('better-sqlite3').Database} db
 */
export function getAllAccountsWithVideos(db) {
  const summaryMap = new Map();
  const videosMap  = new Map();

  const accounts = getAllAccounts(db);
  for (const acc of accounts) {
    summaryMap.set(acc.id, { data: acc });
  }

  const videos = getAllVideos(db);
  for (const v of videos) {
    const key = v.account_id;
    if (!videosMap.has(key)) videosMap.set(key, []);
    videosMap.get(key).push(v);
  }

  return { summaryMap, videosMap };
}

// ── Keyword Suggestions ────────────────────────────────────────────────────────

/**
 * 批量插入或更新长尾词（事务包裹）
 * @param {import('better-sqlite3').Database} db
 * @param {Array<{suggestion: string, root_keyword: string, source_query: string, captured_at: string}>} rows
 */
export function upsertKeywordSuggestions(db, rows) {
  if (!rows || rows.length === 0) return;

  const stmt = db.prepare(`
    INSERT INTO keyword_suggestions
      (suggestion, root_keyword, source_query, captured_at, rank)
    VALUES
      (@suggestion, @root_keyword, @source_query, @captured_at, @rank)
    ON CONFLICT(root_keyword, source_query, suggestion) DO UPDATE SET
      captured_at  = excluded.captured_at,
      rank         = excluded.rank
  `);

  const insertMany = db.transaction((items) => {
    for (const v of items) {
      stmt.run({
        suggestion:   String(v.suggestion || '').trim(),
        root_keyword: String(v.root_keyword || '').trim(),
        source_query: String(v.source_query || '').trim(),
        captured_at:  String(v.captured_at || new Date().toISOString()),
        rank:         Number(v.rank) || 999
      });
    }
  });

  insertMany(rows);
}

/**
 * 返回所有抓取到的长尾词
 * @param {import('better-sqlite3').Database} db
 * @returns {Array<object>}
 */
export function getAllKeywordSuggestions(db) {
  return db
    .prepare('SELECT * FROM keyword_suggestions ORDER BY root_keyword ASC, source_query ASC, suggestion ASC')
    .all();
}

/**
 * 根据核心大词查询相关的所有长尾词
 * @param {import('better-sqlite3').Database} db
 * @param {string} rootKeyword
 * @returns {Array<object>}
 */
export function getKeywordSuggestionsByRoot(db, rootKeyword) {
  return db
    .prepare('SELECT * FROM keyword_suggestions WHERE root_keyword = ? ORDER BY source_query ASC, rank ASC')
    .all(rootKeyword);
}

// ── Default DB path export (for other scripts) ────────────────────────────────
export { DEFAULT_DB_PATH };
