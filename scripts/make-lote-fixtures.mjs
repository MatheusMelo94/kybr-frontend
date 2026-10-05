#!/usr/bin/env node
// Writes Lote's spreadsheet fixtures to tests/fixtures/files/lote/ (T72: CSV;
// T73: XLSX/XLS through SheetJS, and the malformed zips the guard refuses,
// written by the small ZIP writer below so each declares exactly what it
// should). Synthetic CNPJs only, from the shared
// factories (tests/fixtures/factories/panel.ts). The outputs are committed;
// re-run after a factory change: `node scripts/make-lote-fixtures.mjs`.
// Needs Node >= 22.18 (type stripping, like the mock API).

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";

import * as XLSX from "xlsx";

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
  // QA G2 / Q5: UTF-16LE with a BOM (unreadable); UTF-8 with one invalid
  // byte (read as Windows-1252, so the row survives).
  "utf16le.csv": Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from(csv(ac16.slice(0, 5)), "utf16le"),
  ]),
  "utf8-byte-invalido.csv": Buffer.concat([
    Buffer.from(csv(ac16.slice(0, 5))),
    Buffer.from([0xff]),
  ]),
  // T79: spreadsheet text is React text only.
  "marcacao.csv":
    BOM +
    csv([[ac16[1][0], "<img src=x onerror=alert(1)>", "<b>id</b>"], ...ac16.slice(2, 6)]),
  // AC 15: a PDF picked by mistake.
  "documento.pdf": Buffer.concat([
    Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1"),
    Buffer.alloc(2_000, 0x20),
  ]),
};

// --- XLSX / XLS (T73) -------------------------------------------------------

/** The AC 16 sheet as Excel holds it: unmasked numeric CNPJs are numbers (so a leading 0 is lost). */
function ac16Sheet() {
  return XLSX.utils.aoa_to_sheet([
    HEADER,
    ...ac16.map(([cnpj, nome, id]) =>
      /^\d{14}$/.test(cnpj) ? [Number(cnpj), nome, id] : [cnpj, nome, id],
    ),
  ]);
}

function book(...sheets) {
  const wb = XLSX.utils.book_new();
  for (const [name, sheet] of sheets) XLSX.utils.book_append_sheet(wb, sheet, name);
  return wb;
}

/** Excel compresses its zips; so do the fixtures (realistic ratios, C7). */
function write(wb, bookType) {
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType, compression: true }));
}

const ac16Xlsx = write(book(["Vendedores", ac16Sheet()]), "xlsx");

/** The entries of a zip SheetJS wrote: [name, content][], files only. */
function entriesOf(zip) {
  const cfb = XLSX.CFB.read(zip, { type: "buffer" });
  return cfb.FileIndex.map((file, index) => [
    cfb.FullPaths[index].replace(/^[^/]*\//, ""),
    file,
  ])
    .filter(([, file]) => file.type === 2)
    .map(([name, file]) => [name, Buffer.from(file.content)]);
}

/**
 * A minimal ZIP writer (deflate), so a fixture can declare exactly the sizes,
 * flags, offsets and end records the zip guard must refuse.
 * entry: { name, data, flags?, usize?, csize?, offsetOf? (reuse another
 * entry's local header offset: an overlap) }
 * options: { disk?: number, zip64?: boolean }
 */
function zip(entries, options = {}) {
  const locals = [];
  const offsets = [];
  let offset = 0;
  const prepared = entries.map((entry) => {
    const data = deflateRawSync(entry.data);
    return { ...entry, raw: entry.data, data };
  });
  for (const entry of prepared) {
    const name = Buffer.from(entry.name);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(entry.flags ?? 0, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(0x21, 12);
    header.writeUInt32LE(crc32(entry.raw), 14);
    header.writeUInt32LE(entry.csize ?? entry.data.length, 18);
    header.writeUInt32LE(entry.usize ?? entry.raw.length, 22);
    header.writeUInt16LE(name.length, 26);
    offsets.push(offset);
    locals.push(header, name, entry.data);
    offset += 30 + name.length + entry.data.length;
  }
  const central = [];
  const cdStart = offset;
  prepared.forEach((entry, index) => {
    const name = Buffer.from(entry.name);
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(entry.flags ?? 0, 8);
    header.writeUInt16LE(8, 10);
    header.writeUInt16LE(0x21, 14);
    header.writeUInt32LE(crc32(entry.raw), 16);
    header.writeUInt32LE(entry.csize ?? entry.data.length, 20);
    header.writeUInt32LE(entry.usize ?? entry.raw.length, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE(
      offsets[entry.offsetOf ?? index] ?? 0,
      42,
    );
    central.push(header, name);
  });
  const cdSize = central.reduce((sum, part) => sum + part.length, 0);
  const tail = [];
  if (options.zip64) {
    const record = Buffer.alloc(56);
    record.writeUInt32LE(0x06064b50, 0);
    record.writeBigUInt64LE(44n, 4);
    record.writeBigUInt64LE(BigInt(prepared.length), 24);
    record.writeBigUInt64LE(BigInt(prepared.length), 32);
    record.writeBigUInt64LE(BigInt(cdSize), 40);
    record.writeBigUInt64LE(BigInt(cdStart), 48);
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07064b50, 0);
    locator.writeBigUInt64LE(BigInt(cdStart + cdSize), 8);
    locator.writeUInt32LE(1, 16);
    tail.push(record, locator);
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(options.disk ?? 0, 4);
  end.writeUInt16LE(options.disk ?? 0, 6);
  end.writeUInt16LE(options.zip64 ? 0xffff : prepared.length, 8);
  end.writeUInt16LE(options.zip64 ? 0xffff : prepared.length, 10);
  end.writeUInt32LE(options.zip64 ? 0xffffffff : cdSize, 12);
  end.writeUInt32LE(options.zip64 ? 0xffffffff : cdStart, 16);
  return Buffer.concat([...locals, ...central, ...tail, end]);
}

const base = entriesOf(ac16Xlsx);
const withEntries = (list, extra = {}) =>
  list.map(([name, data]) => ({ name, data, ...(extra[name] ?? {}) }));
const MiB = 1024 * 1024;
const sheetName = "xl/worksheets/sheet1.xml";

// A hidden first sheet, then the data (only the first VISIBLE sheet is read).
const hiddenFirst = book(
  ["Notas", XLSX.utils.aoa_to_sheet([["CNPJ"], ["isto não é lido"]])],
  ["Vendedores", ac16Sheet()],
);
hiddenFirst.Workbook = { Sheets: [{ Hidden: 1 }, { Hidden: 0 }] };

// A formula with a cached value, and one without (written by another tool).
const formulas = XLSX.utils.aoa_to_sheet([["CNPJ", "Responsável"], [ac16[1][0], "Ana Exemplo"]]);
formulas.A3 = { t: "s", f: 'CONCATENATE("12ABC34501","DE35")', v: "12ABC34501DE35" };
formulas.B3 = { t: "s", f: 'UPPER("joão")' };
formulas["!ref"] = "A1:B3";

// A numeric CNPJ shown in scientific format (the value is the number).
const scientific = XLSX.utils.aoa_to_sheet([["CNPJ"], [Number(ac16[1][0])]]);
scientific.A2.z = "0.00E+00";

const xlsxFiles = {
  "ac16.xlsx": ac16Xlsx,
  "ac16.xls": write(book(["Vendedores", ac16Sheet()]), "biff8"),
  // BIFF5 needs codepage tables the worker doesn't load (ADR-0012 item 4).
  "biff5.xls": write(book(["Vendedores", XLSX.utils.aoa_to_sheet([["CNPJ"], [ac16[1][0]]])]), "biff5"),
  "aba-oculta.xlsx": write(hiddenFirst, "xlsx"),
  "formulas.xlsx": write(book(["Vendedores", formulas]), "xlsx"),
  "cientifico.xlsx": write(book(["Vendedores", scientific]), "xlsx"),
  // QA G2 / Q5: a password-protected XLSX (OOXML encryption is a CFB file).
  "protegido.xlsx": write(book(["Vendedores", XLSX.utils.aoa_to_sheet([["CNPJ"]])]), "biff8"),
  // A truncated download.
  "corrupt.xlsx": ac16Xlsx.subarray(0, Math.floor(ac16Xlsx.length / 2)),
  // A macro-enabled workbook named .xlsx (its content type says so) → type.
  "macro.xlsx": zip([
    ...withEntries(base).map((entry) =>
      entry.name === "[Content_Types].xml"
        ? {
            ...entry,
            data: Buffer.from(
              entry.data
                .toString("utf8")
                .replace(
                  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
                  "application/vnd.ms-excel.sheet.macroEnabled.main+xml",
                ),
            ),
          }
        : entry,
    ),
    { name: "xl/vbaProject.bin", data: Buffer.from("macro") },
  ]),
  // C7 zip guard v1.1 (ADR-0012 Amendment 2): each is refused before SheetJS.
  "zip-bomb.xlsx": zip([
    ...withEntries(base).filter((entry) => entry.name !== sheetName),
    { name: sheetName, data: Buffer.alloc(101 * MiB, 0x20) },
  ]),
  "zip-razao.xlsx": zip(withEntries(base, { [sheetName]: { usize: 2 * MiB, csize: 1024 } }).map((entry) =>
    entry.name === sheetName ? { ...entry, data: Buffer.alloc(1024, 0x20) } : entry,
  )),
  "zip-tamanho-falso.xlsx": zip(
    withEntries(base, {
      [sheetName]: { usize: 80 * MiB },
      "xl/styles.xml": { usize: 80 * MiB },
    }),
  ),
  "zip-sobreposto.xlsx": zip([
    ...withEntries(base),
    { name: "xl/outro.xml", data: Buffer.from("<x/>"), offsetOf: 0 },
  ]),
  "zip64.xlsx": zip(withEntries(base), { zip64: true }),
  "zip-multidisco.xlsx": zip(withEntries(base), { disk: 1 }),
  "zip-criptografado.xlsx": zip(withEntries(base, { [sheetName]: { flags: 1 } })),
  "zip-duplicado.xlsx": zip([
    ...withEntries(base),
    { name: sheetName, data: Buffer.from("<worksheet/>") },
  ]),
  "zip-2001-entradas.xlsx": zip([
    ...withEntries(base),
    ...Array.from({ length: 2001 - base.length }, (_, i) => ({
      name: `xl/extra/${i}.xml`,
      data: Buffer.from("<x/>"),
    })),
  ]),
  "sem-workbook.xlsx": zip(
    withEntries(base).filter((entry) => entry.name !== "xl/workbook.xml"),
  ),
};
Object.assign(files, xlsxFiles);

for (const [name, body] of Object.entries(files)) {
  writeFileSync(join(out, name), body);
  console.log(`wrote tests/fixtures/files/lote/${name}`);
}
