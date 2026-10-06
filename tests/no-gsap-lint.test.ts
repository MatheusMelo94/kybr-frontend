// @vitest-environment node
import { readFileSync } from "node:fs";

import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

// T113 (Q2, the user's decision 2026-10-06; plan-m6 D12): the Fila's
// collapse is a hand-rolled WAAPI FLIP. No GSAP anywhere in the repo, not
// even in Lote's parser (which has its own xlsx exemption).

const eslint = new ESLint({ cwd: process.cwd() });

beforeAll(async () => {
  await eslint.lintText("export {};\n", { filePath: "lib/warm-up.ts" });
}, 60_000);

async function rules(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((message) => message.ruleId ?? "");
}

const PATHS = [
  "features/panel-fila/use-collapse.ts",
  "features/panel-lote/parser/sheet.ts",
  "components/ui/button.tsx",
  "app/(link)/v/[slug]/page.tsx",
  "lib/utils.ts",
];

describe("the no-GSAP fence (T113)", () => {
  it.each(
    PATHS.flatMap((path) =>
      ["gsap", "gsap/ScrollTrigger", "@gsap/react"].map((spec) => [spec, path]),
    ),
  )("importing %s from %s fails", async (specifier, filePath) => {
    const code = `import x from "${specifier}";\nexport const y = x;\n`;
    expect(await rules(code, filePath)).toContain("no-restricted-imports");
  });

  it.each(PATHS)("a dynamic import of gsap from %s fails", async (filePath) => {
    for (const code of [
      'export const load = () => import("gsap");\n',
      "export const load = () => import(`gsap/${'Flip'}`);\n",
      'export const load = () => import("@gsap/react");\n',
    ])
      expect(await rules(code, filePath)).toContain("no-restricted-syntax");
  });

  it("Lote's parser keeps its xlsx exemption, and xlsx stays fenced elsewhere", async () => {
    const code = 'import { read } from "xlsx";\nexport const r = read;\n';
    expect(
      await rules(code, "features/panel-lote/parser/sheet.ts"),
    ).not.toContain("no-restricted-imports");
    expect(await rules(code, "lib/api/panel/batches.ts")).toContain(
      "no-restricted-imports",
    );
  });

  it("no gsap dependency (SEC § Supply Chain)", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as Record<
      string,
      Record<string, string> | undefined
    >;
    for (const field of ["dependencies", "devDependencies"])
      expect(Object.keys(pkg[field] ?? {}).join(" ")).not.toMatch(/gsap/);
  });
});
