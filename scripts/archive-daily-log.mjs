#!/usr/bin/env node
/**
 * scripts/archive-daily-log.mjs
 *
 * Cắt bớt daily_change_log.md: giữ lại N ngày gần nhất (mặc định 30), phần cũ hơn được
 * chuyển sang file lưu trữ trong daily_change_log/archive/ để không mất thông tin.
 *
 * Cách dùng:
 *   node scripts/archive-daily-log.mjs            # giữ 30 ngày gần nhất
 *   node scripts/archive-daily-log.mjs --days=90  # giữ 90 ngày
 *   node scripts/archive-daily-log.mjs --dry-run  # chỉ báo sẽ làm gì, không ghi file
 *
 * Quy tắc (đồng bộ với AGENTS.md § "Daily change log"):
 *   - Mỗi entry là một khối bắt đầu bằng `## yyyy-mm-dd` (ngày mới nhất ở TRÊN CÙNG).
 *   - Mọi dòng TRƯỚC khối ngày đầu tiên (tiêu đề + intro) luôn giữ nguyên.
 *   - Ngày "gần nhất" tính từ ngày của entry mới nhất trong file, không phải từ hệ thống
 *     (để chạy trên clone cũ vẫn ổn định). Giữ các khối có ngày >= ngày mới nhất - (days - 1).
 *   - Khối cũ hơn được gom vào một file archive theo tháng (archive-YYYY-MM.md), khối mới
 *     của cùng tháng được nối thêm vào CUỐI file archive (giữ thứ tự thời gian tăng dần).
 *   - Script KHÔNG xoá entry của ngày hiện tại đang được sửa dở; chỉ xử lý khối đã hoàn chỉnh.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const LOG_PATH = path.join(ROOT, 'daily_change_log.md');
const ARCHIVE_DIR = path.join(ROOT, 'daily_change_log', 'archive');
const DEFAULT_DAYS = 30;

function parseArgs() {
  const args = process.argv.slice(2);
  let days = DEFAULT_DAYS;
  let dryRun = false;
  for (const arg of args) {
    if (arg === '--dry-run') dryRun = true;
    else if (arg.startsWith('--days=')) {
      const n = parseInt(arg.slice('--days='.length), 10);
      if (!Number.isFinite(n) || n < 1) throw new Error(`Số ngày không hợp lệ: ${arg}`);
      days = n;
    }
  }
  return { days, dryRun };
}

/** Tách file log thành { intro, blocks } — blocks là mảng { date, text } giữ thứ tự xuất hiện. */
function parseLog(raw) {
  // Chuẩn hoá CRLF -> LF để parse ổn định trên mọi checkout (git `* text=auto`).
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const headingRe = /^## (\d{4}-\d{2}-\d{2})$/;
  let intro = [];
  let current = null;
  const blocks = [];
  for (const line of lines) {
    const m = line.match(headingRe);
    if (m) {
      current = { date: m[1], text: [] };
      blocks.push(current);
    } else if (current) {
      current.text.push(line);
    } else {
      intro.push(line);
    }
  }
  // Bỏ dòng cuối trống do trailing newline của việc tách
  return { intro, blocks };
}

function toEpoch(dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, mo - 1, d);
}

/** Ghi đè (hoặc tạo) file archive: thay thế toàn bộ nội dung archive bằng các khối đã được truyền vào. */
function writeArchive(archivePath, blocks) {
  const header = `# Daily Change Log — Lưu trữ\n\n> Các entry cũ hơn ${DEFAULT_DAYS} ngày được chuyển từ daily_change_log.md sang đây bởi scripts/archive-daily-log.mjs. Không sửa tay.\n\n`;
  const body = blocks.map((b) => `## ${b.date}\n${b.text.join('\n').replace(/\n+$/, '')}\n`).join('\n');
  fs.mkdirSync(path.dirname(archivePath), { recursive: true });
  fs.writeFileSync(archivePath, header + body, 'utf8');
}

export function run({ days = DEFAULT_DAYS, dryRun = false, logPath = LOG_PATH } = {}) {
  if (!fs.existsSync(logPath)) {
    throw new Error(`Không tìm thấy ${logPath}`);
  }
  const raw = fs.readFileSync(logPath, 'utf8');
  const { intro, blocks } = parseLog(raw);
  if (blocks.length === 0) {
    return { changed: false, kept: 0, archived: 0 };
  }

  // Ngày mới nhất trong file (dòng đầu, vì log để mới nhất trên cùng).
  const newest = blocks[0].date;
  const cutoff = toEpoch(newest) - (days - 1) * 86_400_000;

  const kept = [];
  const archived = [];
  for (const block of blocks) {
    if (toEpoch(block.date) >= cutoff) kept.push(block);
    else archived.push(block);
  }

  if (archived.length === 0) {
    return { changed: false, kept: kept.length, archived: 0, newest };
  }

  if (!dryRun) {
    // Ghi lại daily_change_log.md chỉ với intro + các khối giữ lại.
    const newLog = `${intro.join('\n')}\n${kept.map((b) => `## ${b.date}\n${b.text.join('\n').replace(/\n+$/, '')}`).join('\n')}\n`;
    fs.writeFileSync(logPath, newLog, 'utf8');

    // Gộp khối cũ vào archive theo tháng (mỗi tháng một file, khối mới nối thêm cuối).
    const byMonth = new Map();
    for (const b of archived) {
      const month = b.date.slice(0, 7); // YYYY-MM
      if (!byMonth.has(month)) byMonth.set(month, []);
      byMonth.get(month).push(b);
    }
    for (const [month, monthBlocks] of byMonth) {
      const archivePath = path.join(ARCHIVE_DIR, `archive-${month}.md`);
      const existing = fs.existsSync(archivePath) ? parseLog(fs.readFileSync(archivePath, 'utf8')) : { intro: [], blocks: [] };
      // Chỉ nối thêm khối chưa có (tránh trùng khi chạy lại).
      const existingDates = new Set(existing.blocks.map((b) => b.date));
      const newBlocks = monthBlocks.filter((b) => !existingDates.has(b.date));
      const merged = [...existing.blocks, ...newBlocks].sort((a, b) => a.date.localeCompare(b.date));
      writeArchive(archivePath, merged);
    }
  }

  return { changed: !dryRun, kept: kept.length, archived: archived.length, newest };
}

// Chạy trực tiếp từ CLI:
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  try {
    const { days, dryRun } = parseArgs();
    const result = run({ days, dryRun });
    const prefix = dryRun ? '[dry-run] ' : '';
    if (result.archived === 0) {
      console.log(`${prefix}Không có entry nào cũ hơn ${days} ngày (giữ ${result.kept} khối). Không đổi gì.`);
    } else {
      console.log(`${prefix}Giữ ${result.kept} khối ngày gần nhất (mới nhất ${result.newest}), chuyển ${result.archived} khối cũ sang daily_change_log/archive/.`);
    }
  } catch (error) {
    console.error('[archive-daily-log] Lỗi:', error);
    process.exit(1);
  }
}
