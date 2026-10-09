import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Standalone CommonJS tooling script, run directly via `node`, not part of the Next.js app.
    "scripts/**",
  ]),
  {
    // Epic Scoring Service core is pure: "now" is always the caller's asOf, never the system clock
    // (docs/superpowers/specs/2026-09-29-scoring-service-design.md §5).
    files: ["src/lib/scoring/**/*.ts"],
    ignores: ["src/lib/scoring/__tests__/**"],
    rules: {
      "no-restricted-syntax": ["error",
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: "Scoring is pure — use ctx.asOf instead of the system clock." },
        { selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']", message: "Scoring is pure — use ctx.asOf instead of the system clock." },
      ],
      "no-restricted-imports": ["error", { paths: [{ name: "@/lib/db", message: "Scoring core must not touch the database — load data in a *-service.ts file." }] }],
    },
  },
  {
    files: ["src/modules/**/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          { name: "@/lib/db", message: "Module domain code must stay independent from PostgreSQL." },
          { name: "next", message: "Module domain code must stay independent from Next.js." },
          { name: "pg", message: "Module domain code must stay independent from PostgreSQL." },
        ],
        patterns: [{ group: ["next/**", "**/infrastructure/**"], message: "Module domain code must not depend on framework or infrastructure code." }],
      }],
    },
  },
  {
    files: ["src/modules/iam/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: ["@/modules/{project,ttm,integration,audit}/{application,domain,infrastructure}/**"], message: "Import another module through its public API only." }] }],
    },
  },
  {
    files: ["src/modules/ttm/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: ["@/modules/{iam,project,integration,audit}/{application,domain,infrastructure}/**"], message: "Import another module through its public API only." }] }],
    },
  },
  {
    files: ["src/modules/integration/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: ["@/modules/{iam,project,ttm,audit}/{application,domain,infrastructure}/**"], message: "Import another module through its public API only." }] }],
    },
  },
  {
    files: [
      "src/app/api/auth/login/route.ts",
      "src/app/api/ttm-dashboard-2/route.ts",
      "src/app/api/ttm-dashboard-2/rows/route.ts",
      "src/app/api/reports/route.ts",
      "src/app/api/data-source/import/route.ts",
      "src/app/api/data-source/import/auto/route.ts",
    ],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          { name: "@/lib/db", message: "Migrated routes must call a module public API, not the database." },
          { name: "@/lib/auth-service", message: "Use the IAM module public API." },
          { name: "@/lib/master-data-service", message: "Use a module public API." },
          { name: "@/lib/reports-service", message: "Use the TTM module public API." },
          { name: "@/lib/report-access-scope", message: "Use the TTM module public API." },
          { name: "@/lib/import-service", message: "Use the Integration module public API." },
          { name: "@/lib/adapters/index", message: "Use the Integration module public API." },
          { name: "@/lib/ttm-dashboard-2-cache-service", message: "Use the TTM module public API." },
          { name: "@/lib/ttm-index-global-cache-service", message: "Use the TTM module public API." },
          { name: "@/lib/view-as-user-service", message: "Use the IAM module public API." },
        ],
        patterns: [{ group: ["@/modules/*/{application,domain,infrastructure}/**"], message: "HTTP adapters may import module public APIs only." }],
      }],
    },
  },
]);

export default eslintConfig;
