#!/usr/bin/env node
// Writes Lote's spreadsheet fixtures to tests/fixtures/files/lote/ (T72; T73
// adds the XLSX and XLS files). Synthetic CNPJs only, from the shared
// factories (tests/fixtures/factories/panel.ts). The outputs are committed;
// re-run after a factory change: `node scripts/make-lote-fixtures.mjs`.
// Needs Node >= 22.18 (type stripping, like the mock API).

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { AC16, cnpjWithRoot } from "../tests/fixtures/factories/panel.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "tests/fixtures/files/lote");
mkdirSync(out, { recursive: true });

const HEADER = ["CNPJ", "Responsável", "ID na plataforma"];
const BOM = "﻿";

/** RFC 4180 with `;`: a field is quoted only when it has to be, as Excel writes. */
function line(cells, delimiter = ";") {
  return cells
    .map((cell) =>
      /["\r\n;,\t]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell,
    )
    .join(delimiter);
}

function csv(rows, { header = HEADER, delimiter = ";", eol = "\r\n" } = {}) {
  const lines = header ? [header, ...rows] : rows;
  return lines.map((cells) => line(cells, delimiter)).join(eol) + eol;
}

/** Windows-1252 for text in Latin-1's range (every fixture's text is). */
function windows1252(text) {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code > 0xff) throw new Error(`not Latin-1: ${text[i]}`);
    bytes[i] = code;
  }
  return bytes;
}

const ac16 = AC16.rows.map((row) => [row.cnpj, row.responsavel, row.ext_id]);

/** `n` distinct valid CNPJs (synthetic roots 5xxxxxxx0001). */
function many(n) {
  return Array.from({ length: n }, (_, i) => [
    cnpjWithRoot(`5${String(i).padStart(7, "0")}0001`),
    "Pessoa Exemplo",
    `id-${i + 1}`,
  ]);
}

const files = {
  // The AC 16 set: UTF-8 with a BOM, `;`, CRLF (Excel's "CSV UTF-8").
  "ac16.csv": BOM + csv(ac16),
  // The same in Windows-1252, no BOM (Excel's plain "CSV" in pt-BR).
  "ac16-windows-1252.csv": windows1252(csv(ac16)),
  // No header row: the first row is data (T74's header rule).
  "sem-cabecalho.csv": BOM + csv(ac16.slice(0, 20), { header: null }),
  // No column says "CNPJ" and none is ≥ 80 % CNPJ-shaped (AC 17): the
  // "Documento" holds only the 8-character root.
  "sem-coluna-cnpj.csv":
    BOM +
    csv(
      ac16.slice(0, 20).map(([cnpj, nome, id]) => [nome, id, cnpj.slice(0, 8)]),
      { header: ["Nome", "Código", "Documento"] },
    ),
  // The row cap: exactly 5,000 data rows, then one more (AC 15).
  "5000-linhas.csv": BOM + csv(many(5000)),
  "5001-linhas.csv": BOM + csv(many(5001)),
  // AC 15: empty, and a header with no data.
  "vazio.csv": "",
  "so-cabecalho.csv": BOM + csv([]),
  // AC 15: a PDF picked by mistake.
  "documento.pdf": Buffer.concat([
    Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1"),
    Buffer.alloc(2_000, 0x20),
  ]),
};

for (const [name, body] of Object.entries(files)) {
  writeFileSync(join(out, name), body);
  console.log(`wrote tests/fixtures/files/lote/${name}`);
}
