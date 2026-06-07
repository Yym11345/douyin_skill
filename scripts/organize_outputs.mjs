#!/usr/bin/env node
/**
 * scripts/organize_outputs.mjs
 * 
 * 读取 Excel 中的账号与负责人对应关系，
 * 将 outputs/ 目录下直接放置的账号文件夹（未按负责人分类的）
 * 物理移动至对应的 outputs/<负责人>/<账号名> 目录下。
 * 移动完成后自动重新生成监控看板。
 */

import { readdirSync, statSync, existsSync, mkdirSync, renameSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const outputsDir = join(projectRoot, 'outputs');
const excelPath = join(projectRoot, '账号监控_人员分组.xlsx');

function main() {
  if (!existsSync(excelPath)) {
    console.error(`[Error] 找不到 Excel 配置文件: ${excelPath}`);
    process.exit(1);
  }

  console.log('[Organize] 开始读取 Excel 中的账号配置...');
  const wb = XLSX.readFile(excelPath);
  const sheetName = '按人分组';
  const ws = wb.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 });

  const accounts = [];
  const owners = new Set();

  for (const row of rawData) {
    if (!row || row.length < 5) continue;
    const seq = row[0];
    if (seq === null || seq === undefined || isNaN(Number(seq))) continue;
    if (Number(seq) <= 0) continue;

    const person = String(row[1] || '').trim();
    const sec_user_id = String(row[3] || '').trim();
    const name = String(row[4] || '').trim();
    let outputPath = String(row[8] || '').trim();

    if (!sec_user_id) continue;
    if (person) owners.add(person);

    if (!outputPath) {
      outputPath = `outputs/${person}/${name}`;
    }

    accounts.push({
      sec_user_id,
      person,
      name,
      outputPath: join(projectRoot, outputPath)
    });
  }

  console.log(`[Organize] 共读取到 ${accounts.length} 个账号，负责人列表:`, Array.from(owners));

  // 1. 扫描 outputs 目录下的所有子文件夹，读取其 summary.json，并用 sec_user_id 映射其实际路径
  console.log('[Organize] 扫描 outputs/ 目录下的现有数据...');
  const directFolders = readdirSync(outputsDir).filter(name => {
    const fullPath = join(outputsDir, name);
    // 排除负责人目录和 index.html
    return statSync(fullPath).isDirectory() && !owners.has(name);
  });

  console.log(`[Organize] 发现 ${directFolders.length} 个未分类的账号文件夹。`);

  let movedCount = 0;
  let skippedCount = 0;

  for (const folder of directFolders) {
    const folderPath = join(outputsDir, folder);
    const summaryPath = join(folderPath, 'summary.json');
    if (!existsSync(summaryPath)) {
      console.log(`[Organize] 文件夹 ${folder} 中没有 summary.json，跳过`);
      continue;
    }

    let secUserId = '';
    try {
      const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
      secUserId = summary.id;
    } catch (e) {
      console.error(`[Organize] 解析 ${summaryPath} 失败:`, e.message);
      continue;
    }

    if (!secUserId) {
      console.log(`[Organize] 文件夹 ${folder} 的 summary.json 中没有 id，跳过`);
      continue;
    }

    // 匹配 Excel 中的账号
    const acct = accounts.find(a => a.sec_user_id === secUserId);
    if (!acct) {
      console.log(`[Organize] 未在 Excel 中找到 sec_user_id 为 ${secUserId} 的账号（文件夹: ${folder}），保持原样`);
      continue;
    }

    const targetPath = acct.outputPath;

    if (folderPath === targetPath) {
      // 已经在目标路径，不需要移动
      continue;
    }

    console.log(`[Organize] 匹配成功: ${acct.name} -> 目标路径: ${targetPath}`);

    // 创建目标的父目录 (即 outputs/负责人/)
    const parentDir = dirname(targetPath);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    // 执行移动操作
    if (existsSync(targetPath)) {
      console.log(`[Organize] 目标路径已存在: ${targetPath}。将覆盖其内容并清理源目录...`);
      try {
        // 如果目标路径已存在，为了避免重命名失败，删除目标再移动，或者直接删除源目录（如果数据已一样）
        rmSync(targetPath, { recursive: true, force: true });
        renameSync(folderPath, targetPath);
        movedCount++;
      } catch (err) {
        console.error(`[Organize] 覆盖移动文件夹 ${folder} 失败:`, err.message);
      }
    } else {
      try {
        renameSync(folderPath, targetPath);
        movedCount++;
      } catch (err) {
        console.error(`[Organize] 移动文件夹 ${folder} 失败:`, err.message);
      }
    }
  }

  console.log(`\n[Organize] 整理完成！移动/归类文件夹数量: ${movedCount}`);

  // 2. 重新生成看板
  try {
    console.log('\n[Organize] 正在自动重新更新全局监控面板...');
    execSync('node scripts/dashboard.mjs', { stdio: 'inherit' });
  } catch (err) {
    console.error('[Organize] 重新生成面板失败:', err.message);
  }
}

main();
