import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Token values of record: spec § Design Handoff 6 and plan § 7 (approved, U5).
const LIGHT_COLORS = {
  "--color-surface": "#ffffff",
  "--color-surface-raised": "#f3f3f3",
  "--color-field": "#f0f0f0",
  "--color-field-line": "#8a8a8a",
  "--color-ink": "#141414",
  "--color-ink-muted": "#696969",
  "--color-line": "#e0e0e0",
  "--color-line-soft": "#f0f0f0",
  "--color-accent": "#141414",
  "--color-accent-ink": "#ffffff",
  "--color-focus": "#141414",
  "--color-success": "#1f9d55",
  "--color-success-ink": "#157a45",
  "--color-danger-ink": "#c4302a",
  // The panel's (spec § Design Handoff 6; plan § 2.6)
  "--color-warning": "#b8820f",
  "--color-warning-ink": "#8a6000",
  "--color-danger": "#d6372f",
  "--color-badge-monitor": "#0066ff",
  "--color-badge-monitor-ink": "#ffffff",
  // White on --color-danger in both themes (4.72:1): the late Fila badge.
  "--color-danger-badge-ink": "#ffffff",
} as const;

const DARK_COLORS: Record<keyof typeof LIGHT_COLORS, string> = {
  "--color-surface": "#111111",
  "--color-surface-raised": "#1b1b1b",
  "--color-field": "#1f1f1f",
  "--color-field-line": "#6f6f6f",
  "--color-ink": "#f5f5f5",
  "--color-ink-muted": "#9a9a9a",
  "--color-line": "#2e2e2e",
  "--color-line-soft": "#222222",
  "--color-accent": "#f5f5f5",
  "--color-accent-ink": "#141414",
  "--color-focus": "#f5f5f5",
  "--color-success": "#1f9d55",
  "--color-success-ink": "#1f9d55",
  "--color-danger-ink": "#e5534b",
  "--color-warning": "#d99a1b",
  "--color-warning-ink": "#e9b64a",
  // Same in both themes (spec § Design Handoff 6): not swapped.
  "--color-danger": "#d6372f",
  "--color-badge-monitor": "#0066ff",
  "--color-badge-monitor-ink": "#ffffff",
  "--color-danger-badge-ink": "#ffffff",
};

/** A dark value: the swap's, or the light one when the theme doesn't change it. */
function darkValue(
  swap: Map<string, string>,
  name: string,
): string | undefined {
  return swap.get(name) ?? theme.get(name);
}

const OTHER_TOKENS = {
  "--font-sans": "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
  "--text-body": "0.9375rem",
  "--text-secondary": "0.8125rem",
  "--text-title": "2rem",
  "--text-title--line-height": "1.15",
  "--font-weight-title": "652",
  "--font-weight-body": "456",
  "--font-weight-strong": "600",
  "--font-weight-lead": "300",
  "--radius-sm": "0.25rem",
  "--radius-md": "0.5rem",
  "--radius-lg": "1rem",
  "--radius-xl": "1.5rem",
  "--radius-full": "9999px",
  "--container-link": "30rem",
  // Panel layout (plan § 2.6): the sidebar, the panel's 40 px control, and
  // the auth column (≤ 440 px).
  "--size-sidebar": "15rem",
  "--size-control-panel": "2.5rem",
  "--container-auth": "27.5rem",
  "--ease-out-quart": "cubic-bezier(0.25, 1, 0.5, 1)",
  "--ease-in-out-quart": "cubic-bezier(0.76, 0, 0.24, 1)",
  "--duration-fast": "150ms",
  "--duration-base": "250ms",
  "--duration-slow": "450ms",
  "--duration-loop": "1.4s",
} as const;

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "../app");
const read = (path: string): string =>
  readFileSync(resolve(appDir, path), "utf8");

// ADR-0010 rule 2: the tokens in one partial, two Tailwind entries.
const css = read("tokens.css");
const linkCss = read("(link)/link.css");
const panelCss = read("(panel)/painel/panel.css");

/** The @source paths an entry scans. */
function sources(entry: string): string[] {
  return [...entry.matchAll(/@source\s+"([^"]+)"/g)].map(
    (match) => match[1] ?? "",
  );
}

/** Returns the body of the first `{ … }` block that starts at or after `marker`. */
function blockAfter(source: string, marker: string): string {
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`marker not found: ${marker}`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") depth--;
    if (depth === 0) return source.slice(open + 1, i);
  }
  throw new Error(`unclosed block after: ${marker}`);
}

function declarations(block: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of block.matchAll(
    /(--[\w-]+|--[\w-]+-\*)\s*:\s*([^;]+);/g,
  )) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined)
      found.set(name, value.trim());
  }
  return found;
}

const theme = declarations(blockAfter(css, "@theme {"));
const base = blockAfter(css, "@layer base {");
const darkBySystem = declarations(
  blockAfter(
    blockAfter(base, "@media (prefers-color-scheme: dark) {"),
    ':root:not([data-theme="light"]) {',
  ),
);
const darkByAttribute = declarations(blockAfter(base, '[data-theme="dark"] {'));

describe("the per-surface entries (ADR-0010 rule 2)", () => {
  it.each([
    ["link", linkCss],
    ["panel", panelCss],
  ])(
    "the %s entry imports Tailwind with no automatic sources, then the tokens",
    (_, entry) => {
      const imports = [...entry.matchAll(/^@import\s+"([^"]+)"[^;]*;/gm)].map(
        (match) => match[0],
      );
      expect(imports).toEqual([
        '@import "tailwindcss" source(none);',
        expect.stringMatching(/^@import "(\.\.\/)+tokens\.css";$/),
      ]);
    },
  );

  it("the link entry scans only the link's files", () => {
    expect(sources(linkCss).sort()).toEqual(
      [
        ".",
        "../../features/seller-link",
        "../../components/ui",
        "../layout.tsx",
        "../not-found.tsx",
        "../global-error.tsx",
      ].sort(),
    );
  });

  it("the panel entry scans only the panel's files", () => {
    expect(sources(panelCss).sort()).toEqual(
      [
        ".",
        "../../../features/panel-*/**/*.{ts,tsx}",
        "../../../components/ui",
        "../../../components/panel",
        "../../layout.tsx",
      ].sort(),
    );
  });
});

describe("app/tokens.css", () => {
  it("is a partial: no Tailwind import, no sources, no utilities", () => {
    expect(css).not.toMatch(/@import\s+"tailwindcss/);
    expect(css).not.toContain("@source");
    expect(css).not.toContain("@utility");
  });

  it.each(["--color-*", "--radius-*", "--shadow-*", "--font-*"])(
    "resets the %s namespace so only brand tokens exist",
    (namespace) => {
      expect(theme.get(namespace)).toBe("initial");
    },
  );

  it.each(Object.entries(LIGHT_COLORS))(
    "declares %s = %s (light)",
    (name, value) => {
      expect(theme.get(name)).toBe(value);
    },
  );

  it.each(Object.entries(DARK_COLORS))(
    "swaps %s to %s under the dark system setting",
    (name, value) => {
      expect(darkValue(darkBySystem, name)).toBe(value);
    },
  );

  it.each(Object.entries(DARK_COLORS))(
    'swaps %s to %s under [data-theme="dark"]',
    (name, value) => {
      expect(darkValue(darkByAttribute, name)).toBe(value);
    },
  );

  it.each(Object.entries(OTHER_TOKENS))("declares %s = %s", (name, value) => {
    expect(theme.get(name)).toBe(value);
  });

  it("never declares --faint or the prototype's raw --warn / --bad (AC 69)", () => {
    expect(css).not.toMatch(/--faint\b/);
    expect(css).not.toMatch(/--(warn|bad)\b/);
  });

  it("declares no shadow tokens (no shadows, per the brand)", () => {
    expect(
      [...theme.keys()].filter(
        (name) => name.startsWith("--shadow-") && name !== "--shadow-*",
      ),
    ).toEqual([]);
  });

  it("defines the dark variant for both the system setting and the data-theme hook", () => {
    const variant = blockAfter(css, "@custom-variant dark {");

    expect(variant).toContain('[data-theme="dark"]');
    expect(variant).toContain("@media (prefers-color-scheme: dark)");
    expect(variant).toContain(':not([data-theme="light"])');
  });

  it("T33: the indeterminate bar animates transform only, on --duration-loop, forever (ADR-0003: CSS only)", () => {
    expect(theme.get("--animate-indeterminate")?.replace(/\s+/g, " ")).toBe(
      "indeterminate var(--duration-loop) var(--ease-in-out-quart) infinite",
    );
    const keyframes = blockAfter(css, "@keyframes indeterminate {");
    const properties = [...keyframes.matchAll(/([a-z-]+)\s*:/g)].map(
      (match) => match[1],
    );
    expect(properties.length).toBeGreaterThan(0);
    expect(new Set(properties)).toEqual(new Set(["transform"]));
  });
});
