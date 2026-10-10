// @vitest-environment node
import { describe, expect, it } from "vitest";

import { csvAttachment } from "@/lib/api/panel/csv-attachment";
import { CSV_MAX_BYTES } from "@/lib/api/panel/csv-limits";
import { writeCsv } from "@/lib/csv-escape";

// M8C-01 (O-F4 backstop) and M8C-02 (the cap after re-escaping) on the
// shared CSV download tail.

const stream = (text: string): ReadableStream<Uint8Array> =>
  new Response(text).body as ReadableStream<Uint8Array>;
const MASK = "***.***.***-**";

describe("csvAttachment", () => {
  it("M8C-01: masks CPF runs in the named columns only, idempotently", async () => {
    const csv = writeCsv([
      ["CNPJ", "Razão social", "Responsável", "Código"],
      [
        "11.222.333/0001-81",
        "JOAO SILVA 12345678909",
        "Ana 123.456.789-09",
        "12345678909",
      ],
      ["11222333000181", `MARIA ${MASK}`, "Beto", "x"],
    ]);
    const response = await csvAttachment(stream(csv), "f.csv", {
      maskCpfIn: ["Razão social", "Responsável"],
    });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain(`"JOAO SILVA ${MASK}";"Ana ${MASK}";"12345678909"`);
    expect(text).toContain(`"11222333000181";"MARIA ${MASK}"`);
    expect(text).not.toContain("123.456.789-09");
  });

  it("M8C-01: a missing column name is ignored; headers are never masked", async () => {
    const csv = writeCsv([["12345678909"], ["12345678909"]]);
    const response = await csvAttachment(stream(csv), "f.csv", {
      maskCpfIn: ["Detalhe"],
    });
    // text() drops the BOM.
    expect(await response.text()).toBe(csv.replace(/^\uFEFF/, ""));
  });

  it("M8C-02: exactly CSV_MAX_BYTES after re-escaping passes", async () => {
    const header = writeCsv([["Detalhe"]]);
    const overhead = new TextEncoder().encode(header).byteLength;
    const cell = "a".repeat(CSV_MAX_BYTES - overhead - 4);
    const csv = writeCsv([["Detalhe"], [cell]]);
    expect(new TextEncoder().encode(csv).byteLength).toBe(CSV_MAX_BYTES);
    expect((await csvAttachment(stream(csv), "f.csv")).status).toBe(200);
  });

  it("M8C-02: a file the re-escape grows past CSV_MAX_BYTES → 502 with no body", async () => {
    // Bare, formula-like cells: under the cap as sent, over it once quoted
    // and prefixed.
    const rows = Math.floor(CSV_MAX_BYTES / 4) - 10;
    const csv = `X\n${"=1\n".repeat(rows)}`;
    expect(new TextEncoder().encode(csv).byteLength).toBeLessThan(
      CSV_MAX_BYTES,
    );
    const response = await csvAttachment(stream(csv), "f.csv");
    expect(response.status).toBe(502);
    expect(await response.text()).toBe("");
  });
});
