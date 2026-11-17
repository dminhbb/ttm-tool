# TTM Monitor — image chạy trên OCP (OpenShift) UAT của MB.
#
# Thay cho Vercel: `output: 'standalone'` trong next.config.ts sinh .next/standalone/server.js kèm
# node_modules đã rút gọn, nên stage runtime chỉ cần Node + output đó, không cần toàn bộ node_modules.
#
# Hai điểm riêng của OCP, cả hai đã xử lý ở stage runner bên dưới:
#   1. Pod chạy bằng UID tuỳ ý (SCC restricted-v2), KHÔNG phải UID trong `USER`. Vì vậy mọi file/thư
#      mục ứng dụng cần thuộc group 0 (root) và group có quyền như owner (chmod g=u) để UID lạ vẫn
#      đọc/ghi được. Xem https://docs.openshift.com/container-platform/latest/openshift_images/create-images.html
#   2. Không bind port < 1024 (UID lạ không có CAP_NET_BIND_SERVICE) → mặc định PORT=8080.
#
# Build (cần .npmrc trỏ Nexus nội bộ đặt cạnh Dockerfile — xem .gitlab-ci.yml):
#   cp ~/.npmrc .npmrc && docker build -t ttm-monitor:<tag> .

# Node base image. Mạng nội bộ không ra được Docker Hub → trỏ ARG này vào registry mirror của MB,
# ví dụ: --build-arg NODE_IMAGE=harbor.mbbank.com.vn/library/node:22-alpine
ARG NODE_IMAGE=node:22-alpine

# ---------------------------------------------------------------------------
# Stage 1 — deps: cài dependency một lần, cache riêng khỏi source code
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app

# Nexus nội bộ của MB thay cho registry.npmjs.org (xem ~/.npmrc trên máy dev).
ARG NPM_REGISTRY=""
ARG NPM_STRICT_SSL="false"

# `.npmrc*` có dấu * để COPY không fail khi file không tồn tại (build từ máy dev không cần nó).
# CI ghi .npmrc vào build context từ biến bí mật của GitLab — xem .gitlab-ci.yml. Credential chỉ
# nằm trong stage `deps` này; image cuối là stage `runner` riêng nên không mang theo.
COPY package.json package-lock.json .npmrc* ./

# --ignore-scripts: script `prepare` của package.json chạy `git config core.hooksPath` — trong
# container không có git/.git nên sẽ fail; lifecycle script của dependency cũng không cần thiết.
RUN set -eux; \
    if [ -n "$NPM_REGISTRY" ]; then npm config set registry "$NPM_REGISTRY"; fi; \
    npm config set strict-ssl "$NPM_STRICT_SSL"; \
    npm ci --no-audit --no-fund --ignore-scripts; \
    rm -f /app/.npmrc

# ---------------------------------------------------------------------------
# Stage 2 — builder: next build → .next/standalone
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Telemetry gọi ra Internet, mạng nội bộ không ra được → tắt hẳn cho khỏi treo build.
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build không cần kết nối CSDL: mọi route đọc DB đều là dynamic (force-dynamic / có cookies()),
# không route nào prerender bằng dữ liệu thật. db.ts với DB_CONNECTION rỗng rơi về profile 'local'
# và chỉ lỗi lúc query, nên không chặn build.
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 3 — runner: image cuối, chỉ chứa standalone output
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# server.js của standalone đọc PORT và HOSTNAME. 8080 để UID tuỳ ý bind được (xem ghi chú đầu file).
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

# standalone/ đã gồm server.js + node_modules rút gọn. public/ và version.json được copy tường minh:
# src/lib/product-doc-service.ts đọc public/docs/product-guide.html và src/lib/version.ts đọc
# version.json, cả hai qua process.cwd() — thiếu thì MCP doc tool lỗi và footer hiện "unknown".
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/version.json ./version.json

# db/ + scripts/migrate-db.js: để chạy migration bằng chính image này qua một OCP Job
# (xem openshift/job-migrate.yaml) thay vì phải dựng image riêng.
COPY --from=builder /app/db ./db
COPY --from=builder /app/scripts/migrate-db.js ./scripts/migrate-db.js
# migrate-db.js nạp biến môi trường qua loadEnvConfig của @next/env; standalone/node_modules không
# chắc giữ package này nên copy kèm.
COPY --from=builder /app/node_modules/@next/env ./node_modules/@next/env

# OCP chạy bằng UID tuỳ ý thuộc group 0 → cho group quyền như owner.
RUN chgrp -R 0 /app && chmod -R g=u /app

# Không bắt buộc (OCP ghi đè bằng UID riêng) nhưng để image cũng chạy đúng trên Docker/podman thường.
USER 1001

EXPOSE 8080

# Healthcheck dùng /api/system/status (public, không cần session). LƯU Ý: endpoint này có query DB,
# nên DB chập là readiness fail. Trên OCP hãy đặt liveness vào TCP port, readiness vào endpoint này
# (xem openshift/deployment.yaml).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/system/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
