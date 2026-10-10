/**
 * Đọc bảng `cmap` của font sfnt (OTF/TTF/WOFF2-đã-giải-nén) để lấy danh sách codepoint
 * mà font thực sự có glyph.
 *
 * Tự parse thay vì dùng `fontTools`/`opentype.js` vì: (1) máy dev không có sẵn
 * `fontTools`, (2) đây là test chạy trong `npm test` nên không nên thêm dependency chỉ
 * để đọc một bảng, (3) phần cần đọc rất nhỏ — chỉ table directory + cmap.
 *
 * Hỗ trợ cmap format 4 (BMP, phổ biến nhất), 12 (full Unicode) và 6 (trimmed).
 * Không hỗ trợ format 0/2 (legacy 1-byte/CJK) — nếu font chỉ có các format đó thì
 * đằng nào nó cũng không thể phủ tiếng Việt.
 *
 * Đọc được cả `.otf`/`.ttf` (sfnt thuần) và `.woff2` — bản WOFF2 cần thiết vì font brand
 * ship trong repo ở dạng đó, nên test phải chạy được mà không cần file OTF gốc (nằm ngoài
 * repo, trong skill `ias-design`).
 */
import { brotliDecompressSync } from 'node:zlib';

/** Font không phải sfnt hợp lệ, hoặc thiếu bảng cmap đọc được. */
export class FontParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FontParseError';
  }
}

const SFNT_VERSION_TRUETYPE = 0x00010000;
const TAG_OTTO = 0x4f54544f; // 'OTTO' — outline CFF (file .otf)
const TAG_TRUE = 0x74727565; // 'true' — biến thể TrueType cũ của Apple
const TAG_TTCF = 0x74746366; // 'ttcf' — font collection

interface TableRecord {
  readonly tag: string;
  readonly offset: number;
  readonly length: number;
}

function readTag(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

function readTableDirectory(view: DataView): TableRecord[] {
  const sfntVersion = view.getUint32(0);
  if (
    sfntVersion !== SFNT_VERSION_TRUETYPE &&
    sfntVersion !== TAG_OTTO &&
    sfntVersion !== TAG_TRUE
  ) {
    if (sfntVersion === TAG_TTCF) {
      throw new FontParseError('Font collection (ttcf) chưa được hỗ trợ — hãy tách từng font ra.');
    }
    throw new FontParseError(
      `Không phải font sfnt hợp lệ (sfntVersion = 0x${sfntVersion.toString(16)}). ` +
        'File .woff/.woff2 phải được giải nén trước khi đọc.',
    );
  }

  const numTables = view.getUint16(4);
  const tables: TableRecord[] = [];
  for (let i = 0; i < numTables; i += 1) {
    const recordOffset = 12 + i * 16;
    tables.push({
      tag: readTag(view, recordOffset),
      offset: view.getUint32(recordOffset + 8),
      length: view.getUint32(recordOffset + 12),
    });
  }
  return tables;
}

/** Một subtable cmap kèm điểm ưu tiên — càng cao càng phủ rộng. */
interface CmapSubtable {
  readonly offset: number;
  readonly priority: number;
}

function subtablePriority(platformId: number, encodingId: number): number {
  // Windows (3) / UCS-4 (10) — phủ cả ngoài BMP, tốt nhất.
  if (platformId === 3 && encodingId === 10) return 5;
  // Windows / BMP (1) — đủ cho tiếng Việt, phổ biến nhất ở font desktop.
  if (platformId === 3 && encodingId === 1) return 4;
  // Unicode (0) — bảng độc lập nền tảng.
  if (platformId === 0) return encodingId >= 4 ? 3 : 2;
  return 1;
}

function readFormat4(view: DataView, base: number): Set<number> {
  const codepoints = new Set<number>();
  const segCount = view.getUint16(base + 6) / 2;
  const endCodeBase = base + 14;
  const startCodeBase = endCodeBase + segCount * 2 + 2; // +2 cho reservedPad
  const idDeltaBase = startCodeBase + segCount * 2;
  const idRangeOffsetBase = idDeltaBase + segCount * 2;

  for (let seg = 0; seg < segCount; seg += 1) {
    const endCode = view.getUint16(endCodeBase + seg * 2);
    const startCode = view.getUint16(startCodeBase + seg * 2);
    // 0xFFFF là segment canh cuối bắt buộc, không phải ký tự thật.
    if (startCode === 0xffff) continue;

    const idDelta = view.getInt16(idDeltaBase + seg * 2);
    const idRangeOffsetAddr = idRangeOffsetBase + seg * 2;
    const idRangeOffset = view.getUint16(idRangeOffsetAddr);

    for (let cp = startCode; cp <= endCode; cp += 1) {
      let glyphId: number;
      if (idRangeOffset === 0) {
        glyphId = (cp + idDelta) & 0xffff;
      } else {
        const glyphAddr = idRangeOffsetAddr + idRangeOffset + (cp - startCode) * 2;
        if (glyphAddr + 1 >= view.byteLength) continue;
        const raw = view.getUint16(glyphAddr);
        glyphId = raw === 0 ? 0 : (raw + idDelta) & 0xffff;
      }
      // glyphId 0 = .notdef → font KHÔNG có ký tự này.
      if (glyphId !== 0) codepoints.add(cp);
    }
  }
  return codepoints;
}

function readFormat6(view: DataView, base: number): Set<number> {
  const codepoints = new Set<number>();
  const firstCode = view.getUint16(base + 6);
  const entryCount = view.getUint16(base + 8);
  for (let i = 0; i < entryCount; i += 1) {
    if (view.getUint16(base + 10 + i * 2) !== 0) codepoints.add(firstCode + i);
  }
  return codepoints;
}

function readFormat12(view: DataView, base: number): Set<number> {
  const codepoints = new Set<number>();
  const numGroups = view.getUint32(base + 12);
  for (let g = 0; g < numGroups; g += 1) {
    const groupBase = base + 16 + g * 12;
    const startCharCode = view.getUint32(groupBase);
    const endCharCode = view.getUint32(groupBase + 4);
    const startGlyphId = view.getUint32(groupBase + 8);
    for (let cp = startCharCode; cp <= endCharCode; cp += 1) {
      if (startGlyphId + (cp - startCharCode) !== 0) codepoints.add(cp);
    }
  }
  return codepoints;
}

function readSubtable(view: DataView, base: number): Set<number> | null {
  const format = view.getUint16(base);
  switch (format) {
    case 4:
      return readFormat4(view, base);
    case 6:
      return readFormat6(view, base);
    case 12:
      return readFormat12(view, base);
    default:
      return null;
  }
}

export interface FontCharset {
  /** Mọi codepoint font có glyph thật (đã loại .notdef). */
  readonly codepoints: ReadonlySet<number>;
  /** Format của subtable cmap đã dùng — hữu ích khi debug. */
  readonly cmapFormat: number;
  /** Tên họ font đọc từ bảng `name` (nameID 1), nếu đọc được. */
  readonly familyName: string | null;
}

function readFamilyName(view: DataView, table: TableRecord): string | null {
  try {
    const base = table.offset;
    const count = view.getUint16(base + 2);
    const stringOffset = view.getUint16(base + 4);
    for (let i = 0; i < count; i += 1) {
      const record = base + 6 + i * 12;
      const nameId = view.getUint16(record + 6);
      if (nameId !== 1) continue;
      const platformId = view.getUint16(record);
      const length = view.getUint16(record + 8);
      const offset = view.getUint16(record + 10);
      const start = base + stringOffset + offset;
      const bytes: number[] = [];
      // Platform 3 (Windows) dùng UTF-16BE; platform 1 (Mac) dùng 1 byte/ký tự.
      if (platformId === 3) {
        for (let b = 0; b < length; b += 2) bytes.push(view.getUint16(start + b));
      } else {
        for (let b = 0; b < length; b += 1) bytes.push(view.getUint8(start + b));
      }
      const name = String.fromCharCode(...bytes).trim();
      if (name) return name;
    }
  } catch {
    // Bảng `name` chỉ để hiển thị cho dễ đọc — lỗi ở đây không ảnh hưởng kết quả kiểm tra.
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────────────────
   WOFF2

   WOFF2 nén TOÀN BỘ dữ liệu bảng thành MỘT stream brotli duy nhất, nối tiếp theo
   đúng thứ tự table directory. Directory không lưu offset — phải tự tích luỹ độ dài.
   Bảng `cmap` không bao giờ bị "transform" (chỉ `glyf`/`loca` mới có), nên sau khi
   giải nén, dữ liệu cmap nằm liền khối tại offset tích luỹ và parse được như sfnt thường.
   ──────────────────────────────────────────────────────────────────────────── */

const WOFF2_SIGNATURE = 0x774f4632; // 'wOF2'

/** 63 tag bảng "đã biết", theo đúng thứ tự trong spec WOFF2 — index 63 nghĩa là tag tự do. */
const WOFF2_KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm',
  'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern',
  'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC',
  'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar',
  'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty',
  'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat',
  'Gloc', 'Feat', 'Sill',
] as const;

/** Số nguyên biến độ dài (7 bit mỗi byte, bit cao = còn byte tiếp). */
function readUIntBase128(view: DataView, cursor: { offset: number }): number {
  let result = 0;
  for (let i = 0; i < 5; i += 1) {
    const byte = view.getUint8(cursor.offset);
    cursor.offset += 1;
    // Byte đầu bằng 0x80 nghĩa là có leading zero — spec cấm.
    if (i === 0 && byte === 0x80) throw new FontParseError('WOFF2: UIntBase128 có leading zero.');
    result = result * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) return result;
  }
  throw new FontParseError('WOFF2: UIntBase128 dài quá 5 byte.');
}

function isWoff2(view: DataView): boolean {
  return view.byteLength >= 48 && view.getUint32(0) === WOFF2_SIGNATURE;
}

/**
 * Giải nén WOFF2 và trả về DataView của stream bảng đã giải nén, kèm offset/length
 * của từng bảng trong stream đó.
 */
function decodeWoff2(view: DataView): { stream: DataView; tables: TableRecord[] } {
  const numTables = view.getUint16(12);
  const totalCompressedSize = view.getUint32(20);

  const cursor = { offset: 48 };
  const entries: { tag: string; origLength: number; transformLength: number | null }[] = [];

  for (let i = 0; i < numTables; i += 1) {
    const flags = view.getUint8(cursor.offset);
    cursor.offset += 1;

    const tagIndex = flags & 0x3f;
    let tag: string;
    if (tagIndex === 0x3f) {
      tag = readTag(view, cursor.offset);
      cursor.offset += 4;
    } else {
      tag = WOFF2_KNOWN_TAGS[tagIndex];
    }

    const transformVersion = (flags >> 6) & 0x03;
    const origLength = readUIntBase128(view, cursor);

    // `glyf`/`loca`: transform mặc định (0) CÓ biến đổi, 3 nghĩa là null-transform.
    // Bảng khác: 0 là null-transform, khác 0 mới có biến đổi.
    const transformed =
      tag === 'glyf' || tag === 'loca' ? transformVersion !== 3 : transformVersion !== 0;
    const transformLength = transformed ? readUIntBase128(view, cursor) : null;

    entries.push({ tag, origLength, transformLength });
  }

  const compressed = new Uint8Array(
    view.buffer,
    view.byteOffset + cursor.offset,
    totalCompressedSize,
  );
  let decompressed: Uint8Array;
  try {
    decompressed = brotliDecompressSync(compressed);
  } catch (error) {
    throw new FontParseError(`WOFF2: giải nén brotli thất bại — ${String(error)}`);
  }

  const tables: TableRecord[] = [];
  let offset = 0;
  for (const entry of entries) {
    const length = entry.transformLength ?? entry.origLength;
    tables.push({ tag: entry.tag, offset, length });
    offset += length;
  }

  return {
    stream: new DataView(decompressed.buffer, decompressed.byteOffset, decompressed.byteLength),
    tables,
  };
}

/**
 * Trích charset của font từ nội dung file.
 *
 * @param data Nội dung file font — `.otf`, `.ttf` hoặc `.woff2`.
 */
export function readFontCharset(data: Uint8Array): FontCharset {
  const fileView = new DataView(data.buffer, data.byteOffset, data.byteLength);

  const { view, tables } = isWoff2(fileView)
    ? (() => {
        const decoded = decodeWoff2(fileView);
        return { view: decoded.stream, tables: decoded.tables };
      })()
    : { view: fileView, tables: readTableDirectory(fileView) };

  const cmapTable = tables.find((t) => t.tag === 'cmap');
  if (!cmapTable) throw new FontParseError('Font không có bảng `cmap`.');

  const numSubtables = view.getUint16(cmapTable.offset + 2);
  const subtables: CmapSubtable[] = [];
  for (let i = 0; i < numSubtables; i += 1) {
    const record = cmapTable.offset + 4 + i * 8;
    subtables.push({
      offset: cmapTable.offset + view.getUint32(record + 4),
      priority: subtablePriority(view.getUint16(record), view.getUint16(record + 2)),
    });
  }
  subtables.sort((a, b) => b.priority - a.priority);

  const nameTable = tables.find((t) => t.tag === 'name');
  const familyName = nameTable ? readFamilyName(view, nameTable) : null;

  for (const subtable of subtables) {
    const codepoints = readSubtable(view, subtable.offset);
    if (codepoints && codepoints.size > 0) {
      return { codepoints, cmapFormat: view.getUint16(subtable.offset), familyName };
    }
  }

  throw new FontParseError(
    'Không đọc được subtable cmap nào (chỉ hỗ trợ format 4/6/12). ' +
      'Font chỉ có format 0/2 thì cũng không thể phủ tiếng Việt.',
  );
}
