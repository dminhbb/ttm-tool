#!/usr/bin/env python
"""
Task 1 (bước sau cửa gate) — chuyển bộ font brand Averta Std CY từ OTF sang WOFF2 đã subset.

Chạy:  python scripts/build-brand-font.py

Vì sao cần bước này thay vì nạp thẳng .otf:
  - Mỗi file .otf nặng ~131KB; 3 weight = ~394KB tải về mỗi lần cache miss.
  - Font gốc là biến thể **Cyrillic** (849 glyph) nhưng ứng dụng chỉ dùng Latin + tiếng Việt,
    nên gần một nửa glyph là tải vô ích.
  - WOFF2 (brotli) + subset đưa về ~35KB/weight, tức giảm khoảng 70%.

Điều kiện: `pip install fonttools brotli` (chỉ là tool lúc build, KHÔNG phải dependency runtime
của app — không thêm gì vào package.json).

LƯU Ý về weight: bộ Averta Std CY KHÔNG có Medium (500). Các file có sẵn là
100/200/300/400/600/700/800/900. Type scale của IAS dùng 500 cho H4/H5/Body1/Caption, nên
theo thuật toán khớp font của CSS (với đích 500, duyệt các weight <= 500 theo chiều giảm trước)
weight 500 sẽ render bằng Regular 400 — KHÔNG phải faux-bold do browser tổng hợp.
Đây là giới hạn của chính bộ font brand, không phải lựa chọn của bước này.
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from fontTools import subset
    from fontTools.ttLib import TTFont
except ImportError:  # pragma: no cover
    sys.exit("Thiếu fonttools. Chạy: pip install fonttools brotli")

REPO_ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = REPO_ROOT.parent / "ias-design" / "fonts"
OUTPUT_DIR = REPO_ROOT / "src" / "app" / "fonts"

# Chỉ 3 weight ứng dụng thực dùng: body 400, nhãn/tiêu đề 600, số liệu nhấn 700.
# Bỏ italic (UI không dùng), bỏ 100/200/300/800/900 (type scale không chạm tới).
WEIGHTS = [
    (400, "Intelligent_Design_-_AvertaStdCY-Regular.otf", "averta-std-cy-400.woff2"),
    (600, "Intelligent_Design_-_AvertaStdCY-Semibold.otf", "averta-std-cy-600.woff2"),
    (700, "Intelligent_Design_-_AvertaStdCY-Bold.otf", "averta-std-cy-700.woff2"),
]

# Khoảng Unicode giữ lại. Gom đủ cho UI tiếng Việt + ký hiệu thật sự xuất hiện trên màn hình.
UNICODE_RANGES = ",".join(
    [
        "U+0000-00FF",  # Basic Latin + Latin-1 (gồm À Á Â Ã È É Ê Ì Í Ò Ó Ô Õ Ù Ú Ý ×)
        "U+0100-017F",  # Latin Extended-A (Ă ă Đ đ Ĩ ĩ Ũ ũ)
        "U+0180-024F",  # Latin Extended-B (Ơ ơ Ư ư)
        "U+1E00-1EFF",  # Latin Extended Additional (Ạ…ỹ — phần lớn chữ Việt có dấu)
        "U+2000-206F",  # General Punctuation (– — ' ' " " … • ‹ › ‰)
        "U+20A0-20CF",  # Currency Symbols (₫ ₫ €)
        "U+2190-21BB",  # Arrows (→ ← ↑ ↓ ↔ ↻ — dùng trong nhãn luồng/trạng thái)
        "U+2212",  # minus sign (khác hyphen, dùng cho số âm)
        "U+2248,U+2260,U+2264,U+2265",  # ≈ ≠ ≤ ≥ (ngưỡng TTM)
        "U+25A0-25FF",  # Geometric Shapes (▲ ▼ ■ ● — mũi sort, dot trạng thái)
        "U+2713,U+2714,U+2716,U+2717",  # ✓ ✔ ✖ ✗
        "U+FEFF,U+FFFD",  # BOM + replacement char
    ]
)


def build() -> int:
    if not SOURCE_DIR.is_dir():
        print(f"Không tìm thấy thư mục font nguồn: {SOURCE_DIR}", file=sys.stderr)
        return 1

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    total_before = 0
    total_after = 0
    built: list[tuple[int, str, float, float]] = []

    for weight, source_name, output_name in WEIGHTS:
        source = SOURCE_DIR / source_name
        if not source.is_file():
            print(f"THIẾU file nguồn: {source}", file=sys.stderr)
            return 1

        destination = OUTPUT_DIR / output_name

        options = subset.Options()
        options.flavor = "woff2"
        options.with_zopfli = False
        # Giữ layout features cần cho chữ Việt dựng sẵn + kerning; bỏ phần còn lại.
        options.layout_features = ["kern", "liga", "ccmp", "mark", "mkmk", "locl", "tnum"]
        # `name` rút gọn: chỉ giữ family/style/version để file nhẹ, vẫn đọc được family name.
        options.name_IDs = [1, 2, 3, 4, 5, 6]
        options.name_legacy = False
        options.notdef_outline = True
        options.recalc_bounds = True
        options.drop_tables += ["DSIG"]

        font = TTFont(source)
        subsetter = subset.Subsetter(options=options)
        subsetter.populate(unicodes=subset.parse_unicodes(UNICODE_RANGES))
        subsetter.subset(font)
        font.flavor = "woff2"
        font.save(destination)
        font.close()

        before_kb = source.stat().st_size / 1024
        after_kb = destination.stat().st_size / 1024
        total_before += before_kb
        total_after += after_kb
        built.append((weight, output_name, before_kb, after_kb))

    print("\n=== Build font brand — Averta Std CY → WOFF2 (đã subset) ===\n")
    print(f"  {'weight':>6}  {'file':<26} {'OTF':>9}  {'WOFF2':>9}  giảm")
    print("  " + "-" * 62)
    for weight, name, before_kb, after_kb in built:
        saved = 100 - (after_kb / before_kb * 100)
        print(f"  {weight:>6}  {name:<26} {before_kb:>7.1f}KB  {after_kb:>7.1f}KB  {saved:>4.0f}%")
    print("  " + "-" * 62)
    saved_total = 100 - (total_after / total_before * 100)
    print(
        f"  {'TỔNG':>6}  {'':<26} {total_before:>7.1f}KB  {total_after:>7.1f}KB  {saved_total:>4.0f}%"
    )
    print(f"\n  Đích: {OUTPUT_DIR}")
    print("  Nạp qua next/font/local trong src/app/layout.tsx (Task 3).")
    print("  Nhắc lại: không có weight 500 — type scale 500 sẽ render bằng 400 Regular.\n")
    return 0


if __name__ == "__main__":
    sys.exit(build())
