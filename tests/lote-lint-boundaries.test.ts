// @vitest-environment node
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

// ADR-0012 item 5: only features/panel-lote/parser/** may import xlsx.
// Security C8: no console in features/panel-lote/** (SheetJS errors can quote
// the file). Each file below is linted as if it lived at that path.

const eslint = new ESLint({ cwd: process.cwd() });

// Loading the config and its plugins is slow under a busy suite: do it once,
// with room, before the 5 s per-test budget applies.
beforeAll(async () => {
  await eslint.lintText("export {};\n", { filePath: "lib/warm-up.ts" });
}, 60_000);

async function rules(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((message) => message.ruleId ?? "");
}

const IMPORT = 'import { read } from "xlsx";\nexport const r = read;\n';

describe("lint boundaries for Lote's parser", () => {
  it.each([
    "features/panel-lote/components/drop-zone.tsx",
    "features/panel-shell/format.ts",
    "lib/api/panel/batches.ts",
    "app/(panel)/painel/(app)/lote/(inicio)/page.tsx",
  ])("importing xlsx from %s fails", async (filePath) => {
    expect(await rules(IMPORT, filePath)).toContain("no-restricted-imports");
  });

  it("the parser may import it", async () => {
    expect(
      await rules(IMPORT, "features/panel-lote/parser/sheet.ts"),
    ).not.toContain("no-restricted-imports");
  });

  it("console is an error in features/panel-lote/** and fine elsewhere", async () => {
    const code = 'console.error("x");\nexport {};\n';
    expect(await rules(code, "features/panel-lote/parser/sheet.ts")).toContain("no-console");
    expect(await rules(code, "features/panel-lote/use-batch-file.ts")).toContain("no-console");
    expect(await rules(code, "lib/api/client.ts")).not.toContain("no-console");
  });
});
