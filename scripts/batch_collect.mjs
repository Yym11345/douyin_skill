#!/usr/bin/env node
/**
 * scripts/batch_collect.mjs
 * 
 * 读取 账号监控_人员分组.xlsx 中的所有有效账号，
 * 依次、逐个同步调用 scripts/collect.mjs 进行采集（无额外间隔延迟）。
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const excelPath = join(projectRoot, '账号监控_人员分组.xlsx');

function main() {
  if (!existsSync(excelPath)) {
    console.error(`[Error] 找不到 Excel 配置文件: ${excelPath}`);
    process.exit(1);
  }

  console.log('[Batch] 开始解析 Excel 中的账号列表...');
  const wb = XLSX.readFile(excelPath);
  const sheetName = '按人分组';
  if (!wb.SheetNames.includes(sheetName)) {
    console.error(`[Error] Excel 中找不到工作表: ${sheetName}`);
    process.exit(1);
  }

  const ws = wb.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 });
  
  const accounts = [];
  for (const row of rawData) {
    if (!row || row.length < 5) continue;
    const seq = row[0];
    if (seq === null || seq === undefined || isNaN(Number(seq))) continue;
    if (Number(seq) <= 0) continue;

    const sec_user_id = String(row[3] || '').trim();
    const name = String(row[4] || '').trim();
    if (!sec_user_id) continue;

    let outputPath = String(row[8] || '').trim();
    if (!outputPath) {
      outputPath = `outputs/${String(row[1] || '').trim()}/${name}`;
    }

    accounts.push({
      index: Number(seq),
      person: String(row[1] || '').trim(),
      name,
      sec_user_id,
      outputPath
    });
  }

  console.log(`[Batch] 共读取到 ${accounts.length} 个有效的监控账号。准备开始逐个采集...`);

  for (let i = 0; i < accounts.length; i++) {
    const acct = accounts[i];
    console.log(`\n======================================================================`);
    console.log(`[Batch] [${i + 1}/${accounts.length}] 正在采集: ${acct.name} (归属: ${acct.person})`);
    console.log(`[Batch] sec_user_id: ${acct.sec_user_id}`);
    console.log(`======================================================================`);

    try {
      // 执行单账号采集命令并传入负责人参数，统一存入单文件 Excel
      const collectScript = join(__dirname, 'collect.mjs');
      execSync(`node "${collectScript}" --account ${acct.sec_user_id} --limit 200 --person "${acct.person}"`, { stdio: 'inherit' });
    } catch (err) {
      console.error(`[Batch] 账号 ${acct.name} 采集失败:`, err.message);
    }
  }

  console.log('\n[Batch] 所有账号批处理采集完毕！正在自动更新全局监控面板...');

  // 批量采集完成后自动重新生成所有看板
  try {
    const dashboardScript = join(__dirname, 'dashboard.mjs');
    execSync(`node "${dashboardScript}"`, { stdio: 'inherit' });
    console.log('\n[Batch] 监控面板已更新完成！');
    console.log(`\n[Batch] 请打开 outputs/dashboard.html 查看全局总看板`);
  } catch (dashErr) {
    console.error('[Batch] 看板生成失败，请手动运行: node scripts/dashboard.mjs');
    console.error(dashErr.message);
  }
}

main();
