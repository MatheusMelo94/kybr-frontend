"use client";

import { useEffect, useId, useRef, type JSX } from "react";

import { Select } from "@/components/panel/select";
import { Table, Td, Th } from "@/components/panel/table";
import { Button } from "@/components/ui/button";
import { StartButton } from "@/features/panel-lote/components/start-button";
import { loteCopy } from "@/features/panel-lote/copy";
import type { Preview } from "@/features/panel-lote/parser/protocol";
import { CONTRATAR_LINK } from "@/features/panel-shell/components/plan-block";
import { shellCopy } from "@/features/panel-shell/copy/shell";
import { fill, formatNumber } from "@/features/panel-shell/format";
import type { PlanGate } from "@/features/panel-shell/plan-variant";
import { plural } from "@/features/panel-shell/plural";

type Props = {
  preview: Preview;
  /** The chosen CNPJ column; undefined until one is detected or picked (AC 17). */
  column: number | undefined;
  onColumn: (column: number) => void;
  /** The rows are built and the worker has ended (P5-002): the column is fixed. */
  columnLocked?: boolean;
  /** Checks left (limite − usadas); undefined when /me lacks the plano. */
  left: number | undefined;
  gate: PlanGate | undefined;
  contratarHref: string | undefined;
  busy?: boolean;
  onStart: () => void;
  onChangeFile: () => void;
};

/**
 * S7 preview (AC 16–18, AC 12 Lote half): the file's first 5 rows, the counts,
 * the "Coluna do CNPJ" select and the CTA, with every reason it can't start.
 * Spreadsheet text is React text only.
 */
export function BatchPreview({
  preview,
  column,
  onColumn,
  columnLocked = false,
  left,
  gate,
  contratarHref,
  busy = false,
  onStart,
  onChangeFile,
}: Props): JSX.Element {
  const heading = useRef<HTMLHeadingElement>(null);
  const select = useRef<HTMLSelectElement>(null);
  const reasonId = useId();
  const stats = column === undefined ? undefined : preview.stats[column];
  const valid = stats?.valid ?? 0;

  // QA Q6b: focus to the preview's heading, or to the select with no column.
  useEffect(() => {
    if (column === undefined) select.current?.focus();
    else heading.current?.focus();
    // Once, when the preview arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columnError =
    column === undefined
      ? loteCopy["lote.preview.nocolumn"]
      : valid === 0
        ? loteCopy["lote.preview.novalid"]
        : undefined;

  // Why the CTA can't start, in order (AC 12, 17, 18).
  let reason: "plan" | "column" | "allowance" | undefined;
  if (gate !== undefined) reason = "plan";
  else if (columnError !== undefined) reason = "column";
  else if (left !== undefined && valid > left) reason = "allowance";

  const contratar = contratarHref !== undefined && (
    <a href={contratarHref} className={CONTRATAR_LINK}>
      {shellCopy["plan.trial.cta"]}
    </a>
  );

  return (
    <section
      aria-labelledby="lote-preview-h"
      className="flex flex-col gap-4 rounded-lg border border-line p-4"
    >
      <h2
        id="lote-preview-h"
        ref={heading}
        tabIndex={-1}
        className="text-h2 font-title text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {loteCopy["lote.preview.h"]}
      </h2>

      <Table label={loteCopy["lote.preview.h"]}>
        <thead>
          <tr>
            {preview.headers.map((header, index) => (
              <Th key={index}>{header}</Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {preview.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {preview.headers.map((_, index) => (
                <Td key={index}>{row[index] ?? ""}</Td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>

      <div className="flex flex-col gap-1 text-body text-ink tabular-nums">
        {column !== undefined && valid > 0 && (
          <p>
            {fill(loteCopy["lote.preview.found"], {
              validos: formatNumber(valid),
              coluna: preview.headers[column] ?? "",
            })}
          </p>
        )}
        {stats !== undefined && stats.duplicates > 0 && (
          <p className="text-secondary text-ink-muted">
            {fill(plural(loteCopy, "lote.preview.dupes", stats.duplicates), {
              n: formatNumber(stats.duplicates),
            })}
          </p>
        )}
        {stats !== undefined && stats.invalid > 0 && (
          <p className="text-secondary text-ink-muted">
            {fill(plural(loteCopy, "lote.preview.invalid", stats.invalid), {
              n: formatNumber(stats.invalid),
            })}
          </p>
        )}
      </div>

      <Select
        ref={select}
        label={loteCopy["lote.preview.column.label"]}
        value={column === undefined ? "" : String(column)}
        onChange={(value) => onColumn(Number(value))}
        disabled={columnLocked}
        {...(columnLocked && {
          hint: loteCopy["lote.preview.column.locked"],
        })}
        error={columnError}
        className="max-w-sm"
      >
        {column === undefined && <option value="" disabled hidden />}
        {preview.headers.map((header, index) => (
          <option key={index} value={String(index)}>
            {header}
          </option>
        ))}
      </Select>

      <div className="flex flex-wrap items-center gap-3">
        <StartButton
          unavailable={reason !== undefined}
          busy={busy}
          onClick={onStart}
          aria-describedby={reason === undefined ? undefined : reasonId}
        >
          {busy
            ? loteCopy["lote.start.busy"]
            : fill(plural(loteCopy, "lote.start", valid), {
                n: formatNumber(valid),
              })}
        </StartButton>
        <Button variant="secondary" size="panel" onClick={onChangeFile}>
          {loteCopy["lote.change_file"]}
        </Button>
      </div>
      {reason === "plan" && (
        <p id={reasonId} className="text-secondary text-ink">
          {shellCopy[gate === "none" ? "plan.none" : "plan.exhausted"]}
        </p>
      )}
      {reason === "column" && (
        <p id={reasonId} className="sr-only">
          {columnError}
        </p>
      )}
      {reason === "allowance" && (
        <div id={reasonId} className="flex flex-col gap-1">
          <p className="text-secondary text-ink tabular-nums">
            {fill(loteCopy["lote.preview.over_allowance"], {
              validos: formatNumber(valid),
              n: formatNumber(left ?? 0),
            })}
          </p>
          {contratar}
        </div>
      )}
    </section>
  );
}
