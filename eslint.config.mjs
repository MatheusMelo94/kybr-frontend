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
    // The fixture generator writes XLSX/XLS with SheetJS (Node only).
    ignores: ["features/panel-lote/parser/**", "scripts/make-lote-fixtures.mjs"],
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
          // Security M5C-02: the package's subpath exports too (xlsx.mjs, dist/*).
          patterns: [
            {
              group: ["xlsx/*"],
              message:
                "Only features/panel-lote/parser/** may import xlsx (ADR-0012).",
            },
          ],
        },
      ],
      // Security M5C-05: dynamic import("xlsx") / import("xlsx/…") too,
      // as a string or a template literal.
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportExpression[source.value=/^xlsx(\\/|$)/]",
          message:
            "Only features/panel-lote/parser/** may import xlsx (ADR-0012).",
        },
        {
          selector:
            "ImportExpression > TemplateLiteral.source > TemplateElement:first-child[value.raw=/^xlsx(\\/|$)/]",
          message:
            "Only features/panel-lote/parser/** may import xlsx (ADR-0012).",
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
