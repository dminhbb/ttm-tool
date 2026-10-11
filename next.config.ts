import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The MCP tools search_product_docs/get_product_doc_section (src/lib/product-doc-service.ts)
  // read the "Tài liệu sản phẩm" HTML from disk at runtime; public/ isn't traced into serverless
  // function bundles by default, so ship it explicitly with the /api/mcp route.
  outputFileTracingIncludes: {
    '/api/mcp': ['./public/docs/product-guide.html'],
  },
  // Màn hình đã gỡ (2026-10-11) — giữ bookmark / liên kết cũ chạy được. Query string của request gốc
  // được Next chuyển tiếp sang đích; quyền xem vẫn do proxy.ts kiểm tra ở màn hình đích.
  async redirects() {
    return [
      { source: '/dashboard', destination: '/ttm-dashboard-2', permanent: false },
      { source: '/dashboard-new', destination: '/ttm-dashboard-2', permanent: false },
      { source: '/epic-alerts', destination: '/epic-alerts-15', permanent: false },
      // Quick filter "Epics in PO" của Quản trị Epic = đúng 3 status này (raw currentStatus).
      { source: '/epic-in-po', destination: '/epic-alerts-15?status=To%20Do,IN%20PO,Released', permanent: false },
    ];
  },
  experimental: {
    // Next 16's proxy.ts (renamed middleware.ts) buffers every request body to let both proxy
    // and the route handler read it, capped at a default 10MB — past that it silently truncates
    // the body with no error to the client (see node_modules/next/dist/docs/.../proxyClientMaxBodySize.md).
    // This app runs a session-cookie check in proxy.ts for every route, so every upload is subject
    // to it — confirmed directly: a real ~17MB SQL restore export silently corrupted above ~10MB,
    // surfacing as an unrelated-looking parse/FormData error deep in db-backup-service.ts, not as
    // a size-limit error. Raised to sit just above this app's own upload caps (CSV import has no
    // explicit cap of its own; SQL export/import caps at 50MB — see MAX_UPLOAD_BYTES/MAX_IMPORT_BYTES
    // in src/app/api/admin/db-backup/import/route.ts and src/lib/db-backup-service.ts).
    proxyClientMaxBodySize: '60mb',
  },
};

export default nextConfig;
