'use client';

import { useRef, useState } from 'react';
import { InfoBannerDisplay } from '@/components/layout/InfoBannerDisplay';
import { ModalContentSearch } from '@/components/ui/ModalContentSearch';
import { ensureModalSearchStyles } from '@/lib/modal-content-search';

export default function ProductDocsPage() {
  // The guide is a same-origin document inside an iframe: once it has loaded, its <body> is the search container.
  const guideBodyRef = useRef<HTMLElement | null>(null);
  const [guideReady, setGuideReady] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <InfoBannerDisplay pathname="/docs/product" />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="m-0 text-fb-text-secondary">
          Tài liệu trình bày toàn bộ workflow, chức năng và logic xử lý dữ liệu của TTM Monitor — dùng để đào tạo người dùng mới.
        </p>
        <ModalContentSearch containerRef={guideBodyRef} isOpen={guideReady} />
      </div>
      <iframe
        title="Tài liệu sản phẩm TTM Monitor"
        src="/api/docs/product-guide"
        className="w-full rounded-lg border border-fb-border bg-white"
        style={{ height: 'calc(100dvh - 180px)', minHeight: 480 }}
        onLoad={(event) => {
          const doc = event.currentTarget.contentDocument;
          if (!doc?.body) return;
          ensureModalSearchStyles(doc);
          guideBodyRef.current = doc.body;
          setGuideReady(true);
        }}
      />
    </div>
  );
}
