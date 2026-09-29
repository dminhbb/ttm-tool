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
]);

export default eslintConfig;
