import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import jsxA11y from "eslint-plugin-jsx-a11y";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const XLSX = "Only features/panel-lote/parser/** may import xlsx (ADR-0012).";

// T113 (Q2, the user's decision 2026-10-06; plan-m6 D12): the Fila's
// collapse is a WAAPI FLIP. GSAP is not a dependency, anywhere.
const NO_GSAP = "No GSAP: motion is CSS or WAAPI (plan-m6 D12, T113).";
const GSAP_PATHS = [
  { name: "gsap", message: NO_GSAP },
  { name: "@gsap/react", message: NO_GSAP },
];
const GSAP_PATTERN = { group: ["gsap/*", "@gsap/*"], message: NO_GSAP };
const GSAP_SYNTAX = [
  {
    selector: "ImportExpression[source.value=/^(@gsap\\/|gsap(\\/|$))/]",
    message: NO_GSAP,
  },
  {
    selector:
      "ImportExpression > TemplateLiteral.source > TemplateElement:first-child[value.raw=/^(@gsap\\/|gsap(\\/|$))/]",
    message: NO_GSAP,
  },
];

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
    ignores: [
      "features/panel-lote/parser/**",
      "scripts/make-lote-fixtures.mjs",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "xlsx", message: XLSX }, ...GSAP_PATHS],
          // Security M5C-02: the package's subpath exports too (xlsx.mjs, dist/*).
          patterns: [{ group: ["xlsx/*"], message: XLSX }, GSAP_PATTERN],
        },
      ],
      // Security M5C-05: dynamic import("xlsx") / import("xlsx/…") too,
      // as a string or a template literal.
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportExpression[source.value=/^xlsx(\\/|$)/]",
          message: XLSX,
        },
        {
          selector:
            "ImportExpression > TemplateLiteral.source > TemplateElement:first-child[value.raw=/^xlsx(\\/|$)/]",
          message: XLSX,
        },
        ...GSAP_SYNTAX,
      ],
    },
  },
  // T113: the GSAP fence holds where the xlsx block doesn't apply too (a
  // later block's rule replaces an earlier one's, so these files get it alone).
  {
    files: ["features/panel-lote/parser/**", "scripts/make-lote-fixtures.mjs"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: GSAP_PATHS, patterns: [GSAP_PATTERN] },
      ],
      "no-restricted-syntax": ["error", ...GSAP_SYNTAX],
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
