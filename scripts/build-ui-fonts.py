#!/usr/bin/env python
"""
Dựng bộ font UI self-hosted (Inter, Geist, Geist Mono) cho next/font/local — 2026-10-20.

Vì sao: src/app/layout.tsx từng nạp 3 font này qua `next/font/google`, nên `next build` phải tải font từ
Google. Môi trường nội bộ không có Internet → build hỏng. Các file .woff2 sinh ra ở đây được commit vào
src/app/fonts/ (như bộ Averta), build không cần mạng.

Nguồn (giấy phép SIL Open Font License 1.1 — được phép đóng kèm ứng dụng, bản giấy phép đi cùng file font):
  - Geist / Geist Mono: gói npm `geist` (Vercel)  — file variable gốc, đã nhỏ (~70KB), chép nguyên.
  - Inter: gói npm `inter-ui` (rsms, tác giả Inter) — file variable gốc ~350KB, subset về Latin + Latin
    Extended + tiếng Việt + ký hiệu giao diện (giữ nguyên trục wght và các OpenType feature) cho nhẹ.

Chạy (máy có Internet, chỉ khi cần đổi phiên bản font):
    mkdir tmp-fonts && cd tmp-fonts
    npm pack geist@1.8.1 inter-ui@4.1.1
    tar -xzf geist-1.8.1.tgz --one-top-level && tar -xzf inter-ui-4.1.1.tgz --one-top-level
    cd .. && python scripts/build-ui-fonts.py tmp-fonts
Sau đó kiểm glyph tiếng Việt: npm run ds:check-font -- src/app/fonts

Điều kiện: `pip install fonttools brotli` (tool lúc chuẩn bị font, không phải dependency của app).
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

try:
    from fontTools import subset
except ImportError:  # pragma: no cover
    sys.exit("Thiếu fonttools. Chạy: pip install fonttools brotli")

REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = REPO_ROOT / "src" / "app" / "fonts"

# Latin (như subset 'latin' của Google Fonts) + Latin-1/Extended + tiếng Việt (như subset 'vietnamese')
# + mũi tên, toán tử, hình học, dấu ✓/✗ mà giao diện dùng trong chữ (→, ≥, ×, ·, …).
UNICODES = (
    "U+0000-024F,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0300-0309,U+0323,U+0329,"
    "U+1EA0-1EF9,U+2000-206F,U+20AB,U+20AC,U+2122,U+2190-21FF,U+2200-22FF,"
    "U+2500-25FF,U+2713-2717,U+FEFF,U+FFFD"
)


def find(source: Path, pattern: str) -> Path:
    matches = sorted(source.rglob(pattern))
    if not matches:
        sys.exit(f"Không thấy {pattern} trong {source} — đã giải nén gói npm chưa?")
    return matches[0]


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("Dùng: python scripts/build-ui-fonts.py <thư mục chứa gói geist và inter-ui đã giải nén>")
    source = Path(sys.argv[1]).resolve()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for pattern, target in (("Geist-Variable.woff2", "geist-variable.woff2"), ("GeistMono-Variable.woff2", "geist-mono-variable.woff2")):
        shutil.copyfile(find(source, pattern), OUTPUT_DIR / target)
        print(f"  chép  {target}  ({(OUTPUT_DIR / target).stat().st_size // 1024} KB)")

    inter_source = find(source, "InterVariable.woff2")
    inter_target = OUTPUT_DIR / "inter-variable.woff2"
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]  # giữ mọi feature (tnum cho số liệu, kerning, chữ có dấu ghép)
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.notdef_outline = True
    options.glyph_names = False
    font = subset.load_font(str(inter_source), options)
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=subset.parse_unicodes(UNICODES))
    subsetter.subset(font)
    subset.save_font(font, str(inter_target), options)
    print(f"  subset inter-variable.woff2  ({inter_source.stat().st_size // 1024} KB → {inter_target.stat().st_size // 1024} KB)")

    for package, target in (("geist", "LICENSE-geist.txt"), ("inter-ui", "LICENSE-inter.txt")):
        licence = next((path for path in source.rglob("LICENSE.txt") if package in str(path)), None)
        if licence:
            shutil.copyfile(licence, OUTPUT_DIR / target)
            print(f"  chép  {target}")


if __name__ == "__main__":
    main()
