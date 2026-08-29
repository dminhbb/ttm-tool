import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
