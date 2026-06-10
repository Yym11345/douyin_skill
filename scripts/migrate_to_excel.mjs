import { readdirSync, statSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const outputsDir = join(projectRoot, 'outputs');

// The directory to migrate from
const sourceDir = process.argv[2] || outputsDir;

console.log(`[Migration] 开始扫描目录: ${sourceDir}`);

// Read person map from Excel
const personMap = {};
const groupExcelPath = join(projectRoot, '账号监控_人员分组.xlsx');
if (existsSync(groupExcelPath)) {
  const groupWb = XLSX.readFile(groupExcelPath);
  if (groupWb.SheetNames.includes('按人分组')) {
    const groupData = XLSX.utils.sheet_to_json(groupWb.Sheets['按人分组'], { header: 1 });
    for (const row of groupData) {
      if (row[3]) personMap[String(row[3]).trim()] = String(row[1] || '').trim();
    }
  }
}

// Find all summary.json and corresponding videos.json
const summaries = [];
const allVideos = [];

function traverse(dir) {
  if (!existsSync(dir)) return;
  const files = readdirSync(dir);
  for (const file of files) {
    const fullPath = join(dir, file);
    let stat;
    try { stat = statSync(fullPath); } catch (e) { continue; }
    
    if (stat.isDirectory()) {
      traverse(fullPath);
    } else if (file === 'summary.json') {
      try {
        const summary = JSON.parse(readFileSync(fullPath, 'utf8'));
        
        let person = personMap[summary.id] || "";

        const summaryRow = {
          person: person,
          id: summary.id,
          name: summary.name,
          platform: summary.platform,
          followers: summary.followers,
          videoCount: summary.videoCount,
          totalLikes: summary.totalLikes,
          totalComments: summary.totalComments,
          url: summary.url,
          fetchedAt: summary.fetchedAt
        };
        summaries.push(summaryRow);

        const videosPath = join(dir, 'videos.json');
        if (existsSync(videosPath)) {
          const videos = JSON.parse(readFileSync(videosPath, 'utf8'));
          for (const v of videos) {
            allVideos.push({
              person: summaryRow.person,
              account_name: summaryRow.name,
              account_id: summaryRow.id,
              id: v.id,
              type: v.type || 'video',
              title: v.title,
              url: v.url,
              publishedAt: v.publishedAt,
              duration: v.duration,
              isTop: v.isTop ? 1 : 0,
              likes: v.likes,
              comments: v.comments,
              shares: v.shares,
              favorites: v.favorites,
              tags: (v.tags || []).join(" "),
              musicTitle: v.musicTitle || ""
            });
          }
        }
      } catch (e) {
        console.error(`读取 ${fullPath} 失败:`, e.message);
      }
    }
  }
}

traverse(sourceDir);

console.log(`[Migration] 扫描完毕，找到 ${summaries.length} 个账号，共 ${allVideos.length} 条视频。`);
if (summaries.length === 0) {
  console.log('[Migration] 未发现需要迁移的数据。');
  process.exit(0);
}

const excelPath = join(outputsDir, 'Douyin_All_Data.xlsx');
let wb;
if (existsSync(excelPath)) {
  wb = XLSX.readFile(excelPath);
} else {
  wb = XLSX.utils.book_new();
}

const summarySheetName = "Summary";
const videoSheetName = "Videos";

// Update Summary Sheet
let existingSummaries = [];
if (wb.SheetNames.includes(summarySheetName)) {
  existingSummaries = XLSX.utils.sheet_to_json(wb.Sheets[summarySheetName]);
}
for (const s of summaries) {
  const idx = existingSummaries.findIndex(r => String(r.id) === String(s.id));
  if (idx >= 0) existingSummaries[idx] = s;
  else existingSummaries.push(s);
}
const newSummaryWs = XLSX.utils.json_to_sheet(existingSummaries);
if (wb.SheetNames.includes(summarySheetName)) wb.Sheets[summarySheetName] = newSummaryWs;
else XLSX.utils.book_append_sheet(wb, newSummaryWs, summarySheetName);

// Update Videos Sheet
let existingVideos = [];
if (wb.SheetNames.includes(videoSheetName)) {
  existingVideos = XLSX.utils.sheet_to_json(wb.Sheets[videoSheetName]);
}
// Remove all old videos for the migrated accounts to prevent duplicates
const summaryIds = new Set(summaries.map(s => String(s.id)));
existingVideos = existingVideos.filter(v => !summaryIds.has(String(v.account_id)));
existingVideos.push(...allVideos);

const newVideoWs = XLSX.utils.json_to_sheet(existingVideos);
if (wb.SheetNames.includes(videoSheetName)) wb.Sheets[videoSheetName] = newVideoWs;
else XLSX.utils.book_append_sheet(wb, newVideoWs, videoSheetName);

// Write to file
mkdirSync(outputsDir, { recursive: true });
XLSX.writeFile(wb, excelPath);

console.log(`[Migration] 迁移成功！数据已全部保存到: ${excelPath}`);
