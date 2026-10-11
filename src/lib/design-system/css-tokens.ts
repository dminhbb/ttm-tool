/**
 * Giải biến CSS custom property tĩnh từ `globals.css` + `ias-tokens.css`.
 *
 * Vì sao cần: tầng token của app là một chuỗi alias ba bậc
 * (`text-fb-blue` → `--color-fb-blue` → `--accent` → `--color-text-brand`
 * → `--color-primary-500` → `#141ED2`). Một mắt gõ sai tên sẽ khiến `var()` resolve
 * thành rỗng và màu biến mất — nhưng CSS KHÔNG báo lỗi, chỉ ra kết quả trống. Đây đúng
 * là kiểu lỗi đã tạo ra tình trạng "`--color-fb-blue` tên là blue mà hoá ra xanh lá".
 *
 * Module này đọc CSS như file text (không cần browser/Playwright) để test có thể
 * assert giá trị cuối cùng của từng token theo từng brand, một cách tất định.
 */

export interface TokenBlock {
  /** Selector nguyên văn, ví dụ `:root[data-brand="ias"]`. */
  readonly selector: string;
  /** Khai báo trong block, theo đúng thứ tự xuất hiện. */
  readonly declarations: readonly (readonly [name: string, value: string])[];
}

/**
 * Tách các block khai báo custom property ở mức cao nhất của file CSS.
 *
 * Chỉ quan tâm `@theme` và các selector bắt đầu bằng `:root` — đó là nơi duy nhất
 * app khai báo token. Mọi block khác (rule component, media query) bị bỏ qua.
 */
export function parseTokenBlocks(css: string): TokenBlock[] {
  const blocks: TokenBlock[] = [];
  // Bỏ comment trước khi tách để `/* ... { ... } ... */` không làm lệch việc đếm ngoặc.
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

  const blockPattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;

  while ((match = blockPattern.exec(withoutComments)) !== null) {
    const selector = normalizeSelector(match[1]);
    const body = match[2];
    if (selector !== '@theme' && !selector.includes(':root')) continue;

    const declarations: [string, string][] = [];
    for (const rawDeclaration of body.split(';')) {
      const separatorIndex = rawDeclaration.indexOf(':');
      if (separatorIndex === -1) continue;
      const name = rawDeclaration.slice(0, separatorIndex).trim();
      if (!name.startsWith('--')) continue;
      declarations.push([name, rawDeclaration.slice(separatorIndex + 1).trim()]);
    }

    if (declarations.length > 0) blocks.push({ selector, declarations });
  }

  return blocks;
}

/**
 * Cắt bỏ phần "rác" dính trước selector.
 *
 * `[^{}]+` ăn mọi thứ từ sau dấu `}` trước đó tới `{` hiện tại, nên với block đầu
 * file nó kéo luôn cả `@import "tailwindcss"; @plugin '…';` vào selector — đó chính
 * là lý do `@theme` từng bị nhận diện sai và toàn bộ token `--color-fb-*` biến mất
 * khỏi kết quả. Mọi at-rule độc lập đều kết thúc bằng `;`, nên lấy phần sau dấu `;`
 * cuối cùng là đủ.
 */
function normalizeSelector(raw: string): string {
  const lastStatementEnd = raw.lastIndexOf(';');
  return (lastStatementEnd === -1 ? raw : raw.slice(lastStatementEnd + 1)).trim();
}

/**
 * Block này có áp dụng cho brand đang xét hay không.
 *
 * Mô hình thật của app: `@theme` (tầng thấp nhất, Tailwind đẩy vào `@layer theme`)
 * → `:root` / `:root[data-theme="light"]` (nền sáng chung) → `:root[data-brand="<brand>"]`
 * (đè cuối). `[data-theme="dark"]` bị loại hẳn vì KHÔNG CÓ CHỖ NÀO trong app set
 * `data-theme` — xác nhận bằng grep toàn bộ src/ — nên nhánh dark là code chết.
 */
function blockAppliesTo(selector: string, brand: string): boolean {
  if (selector === '@theme') return true;
  if (selector.includes('data-theme="dark"')) return false;

  const brandMatch = selector.match(/data-brand="([^"]+)"/);
  if (brandMatch) return brandMatch[1] === brand;

  // `:root`, `:root[data-theme="light"]`, hoặc danh sách gộp cả hai.
  return /^:root(\s*,\s*:root\[data-theme="light"\])?$/.test(selector);
}

/**
 * Thu các khai báo thô (chưa resolve `var()`) áp dụng cho một brand, theo thứ tự đè.
 */
export function collectDeclarations(
  cssSources: readonly string[],
  brand: string,
): Map<string, string> {
  const declared = new Map<string, string>();
  for (const css of cssSources) {
    for (const block of parseTokenBlocks(css)) {
      if (!blockAppliesTo(block.selector, brand)) continue;
      for (const [name, value] of block.declarations) declared.set(name, value);
    }
  }
  return declared;
}

/** Không resolve được `var()` — hoặc tên không tồn tại, hoặc alias tự tham chiếu vòng. */
export class TokenResolutionError extends Error {
  /** Token đang resolve khi gặp lỗi. Khai báo rời thay vì parameter property vì
      `node --test` chạy TypeScript ở chế độ strip-only, không hỗ trợ cú pháp đó. */
  readonly token: string;

  constructor(message: string, token: string) {
    super(message);
    this.name = 'TokenResolutionError';
    this.token = token;
  }
}

/**
 * Resolve một token về giá trị cuối cùng, thay thế đệ quy mọi `var(--x[, fallback])`.
 */
export function resolveToken(
  token: string,
  declared: ReadonlyMap<string, string>,
  seen: ReadonlySet<string> = new Set(),
): string {
  if (seen.has(token)) {
    throw new TokenResolutionError(
      `Alias tự tham chiếu vòng: ${[...seen, token].join(' → ')}`,
      token,
    );
  }

  const raw = declared.get(token);
  if (raw === undefined) {
    throw new TokenResolutionError(`Token chưa được khai báo: ${token}`, token);
  }

  const nextSeen = new Set([...seen, token]);
  return substituteVars(raw, declared, nextSeen, token);
}

/** Thay mọi `var()` trong một chuỗi giá trị. Tự cắt ngoặc để xử lý `var()` lồng nhau. */
function substituteVars(
  value: string,
  declared: ReadonlyMap<string, string>,
  seen: ReadonlySet<string>,
  owner: string,
): string {
  let result = '';
  let index = 0;

  while (index < value.length) {
    const varStart = value.indexOf('var(', index);
    if (varStart === -1) {
      result += value.slice(index);
      break;
    }

    result += value.slice(index, varStart);

    // Tìm ngoặc đóng khớp với `var(` này.
    let depth = 0;
    let cursor = varStart + 3;
    let varEnd = -1;
    for (; cursor < value.length; cursor += 1) {
      if (value[cursor] === '(') depth += 1;
      else if (value[cursor] === ')') {
        depth -= 1;
        if (depth === 0) {
          varEnd = cursor;
          break;
        }
      }
    }
    if (varEnd === -1) {
      throw new TokenResolutionError(`var() thiếu ngoặc đóng trong ${owner}`, owner);
    }

    const inner = value.slice(varStart + 4, varEnd);
    const commaIndex = splitTopLevelComma(inner);
    const referenced = (commaIndex === -1 ? inner : inner.slice(0, commaIndex)).trim();
    const fallback = commaIndex === -1 ? null : inner.slice(commaIndex + 1).trim();

    if (declared.has(referenced)) {
      result += resolveToken(referenced, declared, seen);
    } else if (fallback !== null) {
      result += substituteVars(fallback, declared, seen, owner);
    } else {
      throw new TokenResolutionError(
        `${owner} trỏ tới token chưa khai báo: ${referenced}`,
        owner,
      );
    }

    index = varEnd + 1;
  }

  return result.trim();
}

/** Vị trí dấu phẩy ngoài cùng đầu tiên (bỏ qua phẩy nằm trong ngoặc). */
function splitTopLevelComma(value: string): number {
  let depth = 0;
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === '(') depth += 1;
    else if (value[i] === ')') depth -= 1;
    else if (value[i] === ',' && depth === 0) return i;
  }
  return -1;
}

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

/** Đọc màu dạng `#rgb`/`#rrggbb`/`#rrggbbaa`/`rgb()`/`rgba()`. Trả null nếu không phải màu. */
export function parseColor(value: string): Rgb | null {
  const input = value.trim();

  const hex = input.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    const digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      const [r, g, b, a] = [...digits].map((d) => parseInt(d + d, 16));
      return { r, g, b, a: digits.length === 4 ? a / 255 : 1 };
    }
    if (digits.length === 6 || digits.length === 8) {
      const pairs = digits.match(/../g)!.map((p) => parseInt(p, 16));
      return { r: pairs[0], g: pairs[1], b: pairs[2], a: digits.length === 8 ? pairs[3] / 255 : 1 };
    }
    return null;
  }

  // Nhận cả cú pháp dấu phẩy `rgb(1, 2, 3)` và cú pháp khoảng trắng `rgb(1 2 3 / .2)`.
  const functional = input.match(/^rgba?\(([^)]+)\)$/i);
  if (functional) {
    const parts = functional[1].split('/');
    const channels = parts[0].trim().split(/[\s,]+/).filter(Boolean);
    if (channels.length < 3) return null;
    const [r, g, b] = channels.slice(0, 3).map(Number);
    const alphaSource = parts[1] ?? channels[3];
    const a = alphaSource === undefined ? 1 : parsePercentOrNumber(alphaSource);
    if ([r, g, b, a].some((n) => Number.isNaN(n))) return null;
    return { r, g, b, a };
  }

  return null;
}

function parsePercentOrNumber(value: string): number {
  const trimmed = value.trim();
  return trimmed.endsWith('%') ? Number(trimmed.slice(0, -1)) / 100 : Number(trimmed);
}

/** Luminance tương đối theo WCAG 2.1. */
function relativeLuminance({ r, g, b }: Rgb): number {
  const [lr, lg, lb] = [r, g, b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/**
 * Tỉ lệ tương phản WCAG giữa hai màu đục. Trả về số 1–21.
 * Màu có alpha < 1 phải được hoà lên nền trước bằng `flatten()`.
 */
export function contrastRatio(foreground: Rgb, background: Rgb): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

/** Hoà một màu có alpha lên nền đục, để tính được contrast. */
export function flatten(color: Rgb, background: Rgb): Rgb {
  if (color.a >= 1) return color;
  return {
    r: Math.round(color.r * color.a + background.r * (1 - color.a)),
    g: Math.round(color.g * color.a + background.g * (1 - color.a)),
    b: Math.round(color.b * color.a + background.b * (1 - color.a)),
    a: 1,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   Đọc rule CSS thường (không phải custom property)

   Dùng cho các test kiểm spec component: `.ias-btn` có đúng min-height 40px hay
   không, `.ias-table th` có bị sót `text-transform: uppercase` hay không, …
   Tự đọc CSS như text thay vì render trong browser để test chạy tất định và
   không cần Playwright.
   ──────────────────────────────────────────────────────────────────────────── */

export interface CssRule {
  /** Các selector trong cùng một khối, đã tách theo dấu phẩy và trim. */
  readonly selectors: readonly string[];
  readonly declarations: ReadonlyMap<string, string>;
}

/** Tách toàn bộ rule ở mức cao nhất. At-rule có thân lồng nhau bị bỏ qua. */
export function parseRules(css: string): CssRule[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: CssRule[] = [];

  for (const match of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectorText = normalizeSelector(match[1]);
    if (!selectorText || selectorText.startsWith('@')) continue;

    const declarations = new Map<string, string>();
    for (const rawDeclaration of match[2].split(';')) {
      const separatorIndex = rawDeclaration.indexOf(':');
      if (separatorIndex === -1) continue;
      declarations.set(
        rawDeclaration.slice(0, separatorIndex).trim(),
        rawDeclaration.slice(separatorIndex + 1).trim(),
      );
    }
    if (declarations.size === 0) continue;

    rules.push({
      selectors: selectorText.split(',').map((s) => s.trim().replace(/\s+/g, ' ')),
      declarations,
    });
  }

  return rules;
}

/**
 * Gộp mọi khai báo áp lên một selector, theo thứ tự xuất hiện (rule sau đè rule trước).
 *
 * Khớp selector theo chuỗi chính xác sau khi chuẩn hoá khoảng trắng — cố ý KHÔNG mô
 * phỏng cascade/specificity, vì mục đích là kiểm "rule này có khai báo đúng giá trị
 * không", không phải tính xem browser sẽ render ra gì.
 */
export function declarationsFor(css: string, selector: string): Map<string, string> {
  const target = selector.trim().replace(/\s+/g, ' ');
  const merged = new Map<string, string>();
  for (const rule of parseRules(css)) {
    if (!rule.selectors.includes(target)) continue;
    for (const [property, value] of rule.declarations) merged.set(property, value);
  }
  return merged;
}
