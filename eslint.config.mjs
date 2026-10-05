import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import jsxA11y from "eslint-plugin-jsx-a11y";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "dist/**",
      "coverage/**",
      "playwright-report/**",
      "blob-report/**",
      "test-results/**",
      "next-env.d.ts",
      // Agent worktrees: other branches' checkouts, linted on their own branch.
      ".claude/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // eslint-config-next registers jsx-a11y but enables only a few of its rules.
  // Turn on the plugin's full recommended set (§ Accessibility (engineering rules)).
  { rules: jsxA11y.flatConfigs.recommended.rules },
  // ADR-0012 item 5: the vendored SheetJS is imported only by Lote's parser,
  // which runs in its worker (never in First Load JS).
  {
    files: ["**/*.{ts,tsx,js,mjs}"],
    ignores: ["features/panel-lote/parser/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "xlsx",
              message:
                "Only features/panel-lote/parser/** may import xlsx (ADR-0012).",
            },
          ],
        },
      ],
    },
  },
  // Security C8: nothing from a spreadsheet is logged (SheetJS errors can
  // quote the file's content).
  {
    files: ["features/panel-lote/**/*.{ts,tsx}"],
    rules: { "no-console": "error" },
  },
];

export default eslintConfig;
