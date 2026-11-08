import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PRODUCT_GUIDE_HTML } from '@/lib/product-guide-content';
import { getProductDocSections, searchProductDocs, parseProductDoc } from '@/lib/product-doc-service';
import { GET as getProductGuideRoute } from '@/app/api/docs/product-guide/route';

describe('Product Guide in-memory sync & MCP service', () => {
  it('PRODUCT_GUIDE_HTML is exactly in sync with public/docs/product-guide.html', () => {
    const htmlPath = path.join(process.cwd(), 'public', 'docs', 'product-guide.html');
    const diskHtml = fs.readFileSync(htmlPath, 'utf8');
    assert.equal(
      PRODUCT_GUIDE_HTML,
      diskHtml,
      'src/lib/product-guide-content.ts bị lệch so với public/docs/product-guide.html. Hãy chạy "npm run sync-docs" để đồng bộ.',
    );
  });

  it('parseProductDoc extracts headings and sections properly', () => {
    const sections = parseProductDoc(PRODUCT_GUIDE_HTML);
    assert.ok(sections.length > 50, `Kỳ vọng > 50 mục tài liệu, thực tế: ${sections.length}`);

    // Verify key sections exist
    const hasChapter1 = sections.some((s) => s.title.includes('Tổng quan hệ thống') || s.chapter.includes('Tổng quan'));
    assert.ok(hasChapter1, 'Thiếu chương Tổng quan hệ thống');

    const hasChapter5 = sections.some((s) => s.title.includes('Mô hình') || s.chapter.includes('Mô hình'));
    assert.ok(hasChapter5, 'Thiếu chương Mô hình & Sơ đồ CSDL');

    // Verify unique ids and valid levels
    const ids = new Set<string>();
    for (const section of sections) {
      assert.ok(!ids.has(section.id), `Trùng lặp id mục tài liệu: ${section.id}`);
      ids.add(section.id);
      assert.ok(section.level === 2 || section.level === 3, `Level không hợp lệ: ${section.level}`);
      assert.ok(section.title.length > 0, 'Tiêu đề không được rỗng');
    }

    const nonEmptySections = sections.filter((s) => s.text.length > 0);
    assert.ok(nonEmptySections.length >= 85, `Kỳ vọng ít nhất 85 mục có nội dung text, thực tế: ${nonEmptySections.length}`);
  });

  it('getProductDocSections returns in-memory sections without reading disk', async () => {
    const sections = await getProductDocSections();
    assert.ok(Array.isArray(sections));
    assert.ok(sections.length > 50);

    // Subsequent calls return cached reference
    const sectionsAgain = await getProductDocSections();
    assert.strictEqual(sections, sectionsAgain, 'Kỳ vọng trả về cùng một cached array instance');
  });

  it('searchProductDocs finds relevant sections by keyword ranking', async () => {
    const hits = await searchProductDocs('TTM-CNTT', 3);
    assert.ok(hits.length > 0, 'Kỳ vọng tìm thấy kết quả cho từ khóa TTM-CNTT');
    assert.ok(hits[0].score > 0);
    assert.ok(hits[0].title.length > 0);

    const emptyHits = await searchProductDocs('xyznonexistentterm12345');
    assert.equal(emptyHits.length, 0);
  });

  it('GET /api/docs/product-guide returns HTML response directly from memory', async () => {
    const response = getProductGuideRoute();
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('content-type')?.includes('text/html'));
    assert.ok(response.headers.get('content-type')?.includes('utf-8'));
    const text = await response.text();
    assert.equal(text, PRODUCT_GUIDE_HTML);
  });
});
