#!/usr/bin/env node
/**
 * Masks Epic/Story/Subtask issue keys in a raw Jira CSV export, for cases where the CSV needs to
 * leave this machine/environment before import (e.g. handed to a vendor, used in a demo) but the
 * real Jira key would identify a real internal issue. Project key (the "Project key" column, or
 * project_key/epic_key prefix in Py Jira API format) stays exactly as-is — only the configured
 * project's key PREFIX is swapped for a fake one, and the numeric/suffix part is replaced by a
 * value derived from a stable hash of the original key. Only the projects you name with --map are
 * touched; every other project's keys pass through unchanged.
 *
 * Stability is the whole point: the SAME original issue key always produces the SAME masked key,
 * both within one run and across every future run (including tomorrow's incremental CSV) — this
 * app treats issue_key as an issue's permanent identity across daily imports (see
 * issue-resolution-sql.ts's LATEST_ISSUES_CTE), so a masked key that changed from one day's import
 * to the next would look like a brand-new issue and silently break every accumulated history table
 * (epic_ttm_snapshots, issue_daily_snapshots, epic_alert_history) for it.
 *
 * Masking is a pure function of the original key (sha256-derived), so it's stable even on a
 * completely fresh run with no state file. The state file (--state, default
 * scripts/.jira-key-mask-map.json, already gitignored) is kept anyway as an audit trail and as a
 * safety net against the astronomically unlikely case of two different original keys hashing to
 * the same masked suffix — once a mapping is recorded there it is always reused verbatim, so
 * losing/deleting the state file cannot make already-masked keys shift (the hash still lands the
 * same place); only re-import with a NEW state file if you also change --map, since that changes
 * what every hash is derived from.
 *
 * Detects the file's format the same way processImport() picks an adapter: a `hierarchy_level`
 * column means Py Jira API; otherwise Pure Jira Export.
 *
 * Usage:
 *   node scripts/mask-jira-csv.js --input export.csv --output export.masked.csv --map API=PHUCLAM
 *   node scripts/mask-jira-csv.js --input export.csv --output export.masked.csv --map API=PHUCLAM,OTHER=FAKE2 --state scripts/.jira-key-mask-map.json
 *   node mask-jira-csv.js --input ttm_jira_issues_ToolCore_20260828_1129.csv --output export.masked.csv --map API=PHUCLAM,HCM=VIOANH,BPMCN=TAN,CRMCN=THANH,DL=MINHNT,ECM=MCE,MS=SM,MSME=LONGNX1,PMP=HIEU,SBU=LONGNX2,SC=THUY,SMEDS=TUNGDT,TCTHTW=NHUNG,WM=HUONG,YCPT=BRD --state scripts/.jira-key-mask-map.json
 *
 * --map PROJ=FAKE[,PROJ2=FAKE2,...]  Required. Only these project prefixes get masked.
 * --state <path>                      Optional. Persistent key map (default scripts/.jira-key-mask-map.json).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const args = process.argv.slice(2);
function argValue(name) {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? null : args[index + 1];
}

const inputPath = argValue('input');
const outputPath = argValue('output');
const mapArg = argValue('map');
const statePath = argValue('state') || path.join(__dirname, '.jira-key-mask-map.json');

if (!inputPath || !outputPath || !mapArg) {
  console.error('Usage: node scripts/mask-jira-csv.js --input <file.csv> --output <masked.csv> --map API=PHUCLAM[,OTHER=FAKE2] [--state <path>]');
  process.exit(1);
}

const projectMap = {};
for (const pair of mapArg.split(',')) {
  const [from, to] = pair.split('=').map((value) => value.trim());
  if (!from || !to) {
    console.error(`--map entry không hợp lệ: "${pair}". Định dạng đúng: API=PHUCLAM`);
    process.exit(1);
  }
  projectMap[from.toUpperCase()] = to;
}

// ---------- CSV parse/write — same quote-aware algorithm as src/lib/csv-parser.ts, kept in sync
// by hand since this script must stay a standalone Node file with no build step. ----------
function parseCSV(csvText) {
  const result = [];
  let row = [];
  let inQuotes = false;
  let currentVal = '';
  let i = 0;
  while (i < csvText.length) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];
    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') { currentVal += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      currentVal += char; i++;
    } else if (char === '"') {
      inQuotes = true; i++;
    } else if (char === ',') {
      row.push(currentVal); currentVal = ''; i++;
    } else if (char === '\n' || char === '\r') {
      row.push(currentVal); result.push(row); row = []; currentVal = ''; i++;
      if (char === '\r' && nextChar === '\n') i++;
    } else {
      currentVal += char; i++;
    }
  }
  if (row.length > 0 || currentVal !== '') { row.push(currentVal); result.push(row); }
  return result.filter((r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ''));
}

function csvField(value) {
  const str = value ?? '';
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function writeCSV(rows) {
  return rows.map((row) => row.map(csvField).join(',')).join('\r\n');
}

// ---------- Key masking ----------
const KEY_PATTERN = /^([A-Za-z][A-Za-z0-9]*)-(.+)$/;

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return {};
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

const state = loadState();
const usedMaskedKeys = new Set(Object.values(state));
let newlyMaskedCount = 0;

/** Deterministic: same originalKey always derives the same masked key, with or without state.json
 * (state.json only records it — the hash computation itself needs no prior run to reproduce). */
function maskKey(originalKey) {
  if (!originalKey) return originalKey;
  const match = originalKey.match(KEY_PATTERN);
  if (!match) return originalKey; // not a "PROJ-123"-shaped key — leave untouched
  const [, prefix, suffix] = match;
  const fakePrefix = projectMap[prefix.toUpperCase()];
  if (!fakePrefix) return originalKey; // project not in --map — pass through unchanged

  if (state[originalKey]) return state[originalKey];

  // Stable numeric suffix derived from sha256(originalKey); on the astronomically unlikely
  // collision against a DIFFERENT original key's already-assigned masked key, rehash with a
  // salted nonce until unique — still fully deterministic given the same state.
  let nonce = 0;
  let masked;
  do {
    const hash = crypto.createHash('sha256').update(`${originalKey}::${nonce}`).digest('hex');
    const digits = (parseInt(hash.slice(0, 8), 16) % 900000) + 100000; // stable 6-digit number
    masked = `${fakePrefix}-${digits}`;
    nonce += 1;
  } while (usedMaskedKeys.has(masked) && state[originalKey] !== masked);

  state[originalKey] = masked;
  usedMaskedKeys.add(masked);
  newlyMaskedCount += 1;
  void suffix; // only the hash of the full original key is used — the real suffix never leaks in
  return masked;
}

/** For epic_stories / story_subtasks style cells: a comma/semicolon-separated list of keys. */
function maskKeyList(raw) {
  if (!raw) return raw;
  return raw.split(/([,;])/).map((token) => (token === ',' || token === ';' ? token : maskKey(token.trim()))).join('');
}

// ---------- Main ----------
const csvText = fs.readFileSync(inputPath, 'utf8');
const rows = parseCSV(csvText);
if (rows.length === 0) {
  console.error('File CSV rỗng.');
  process.exit(1);
}

const headers = rows[0].map((h) => h.trim());
const headerIndex = (names) => headers.findIndex((h) => names.some((name) => h.toLowerCase() === name.toLowerCase()));

const isPyJiraApi = headerIndex(['hierarchy_level']) >= 0;

let columnsToMask; // { index: number, isList: boolean }[]
if (isPyJiraApi) {
  columnsToMask = [
    { index: headerIndex(['epic_key']), isList: false },
    { index: headerIndex(['story_key']), isList: false },
    { index: headerIndex(['subtask_key']), isList: false },
    { index: headerIndex(['epic_stories']), isList: true },
    { index: headerIndex(['story_subtasks']), isList: true },
  ].filter((col) => col.index >= 0);
} else {
  columnsToMask = [
    { index: headerIndex(['Issue key', 'Key', 'Issue Key']), isList: false },
    { index: headerIndex(['Custom field (Epic Link)', 'Epic Link', 'Epic-Link']), isList: false },
    // "Parent id"/"Parent" is normally Jira's numeric internal ID (untouched — see doc comment
    // above the Pure Jira Export branch in issue-resolution-sql.ts), but some export variants put
    // an actual issue key there instead. Mask it only when the cell looks like "PROJ-123", not a
    // bare number, so numeric parent IDs are left alone.
    { index: headerIndex(['Parent id', 'Parent ID', 'Parent']), isList: false, keyLikeOnly: true },
  ].filter((col) => col.index >= 0);
}

if (columnsToMask.length === 0) {
  console.error('Không tìm thấy cột chứa Issue Key nào trong file — kiểm tra lại định dạng CSV.');
  process.exit(1);
}

for (let r = 1; r < rows.length; r++) {
  const row = rows[r];
  for (const col of columnsToMask) {
    if (col.index >= row.length) continue;
    const value = row[col.index];
    if (col.keyLikeOnly && !KEY_PATTERN.test(value.trim())) continue;
    row[col.index] = col.isList ? maskKeyList(value) : maskKey(value.trim());
  }
}

fs.writeFileSync(outputPath, writeCSV(rows));
saveState(state);

console.log(`Định dạng phát hiện: ${isPyJiraApi ? 'Py Jira API' : 'Pure Jira Export'}`);
console.log(`Đã xử lý ${rows.length - 1} dòng, ${newlyMaskedCount} key mới được mask (tổng cộng đã lưu trong state: ${Object.keys(state).length}).`);
console.log(`File kết quả: ${outputPath}`);
console.log(`State file (giữ bí mật, KHÔNG commit): ${statePath}`);
