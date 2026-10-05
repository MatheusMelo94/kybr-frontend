// Lote's spreadsheet template (D-B8, frontend-owned): the BOM (so Excel reads
// UTF-8) and exactly the three headers the reader detects, as `;` CSV.

export const TEMPLATE_CSV = "﻿CNPJ;Responsável;ID na plataforma\r\n";

/** Server-chosen, fixed (never from input). */
export const TEMPLATE_FILENAME = "kybr-modelo-lote.csv";

/** The template's external path (a GET route handler, T78). */
export const TEMPLATE_PATH = "/lote/modelo.csv";
