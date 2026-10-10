"use client";

import type { JSX } from "react";

import { Button } from "@/components/ui/button";
import { loteCopy } from "@/features/panel-lote/copy";
import { csvFilename } from "@/features/panel-lote/csv-filename";
import { globalCopy } from "@/features/panel-shell/copy/global";
import { useFileDownload } from "@/features/panel-shell/use-file-download";

type Props = {
  batchId: string;
  kind: "result" | "errors";
  /** The batch's end: the file's date (Security C9). */
  concluidoEm: string | undefined;
};

const ROUTE = { result: "resultado.csv", errors: "erros.csv" } as const;
const LABEL = {
  result: loteCopy["lote.result.download"],
  errors: loteCopy["lote.result.errors.cta"],
} as const;

/**
 * "Baixar resultado (CSV)" / "Baixar erros (CSV)" (AC 21, T86): the
 * re-escaping route handler's file through useFileDownload, under a name
 * built here (C9); a failure is export.error inline.
 */
export function CsvDownload({
  batchId,
  kind,
  concluidoEm,
}: Props): JSX.Element {
  const { busy, failed, download } = useFileDownload(
    `/lote/${batchId}/${ROUTE[kind]}`,
    () =>
      csvFilename(
        kind,
        concluidoEm === undefined ? new Date() : new Date(concluidoEm),
      ),
  );

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="secondary"
        size="panel"
        busy={busy}
        onClick={() => void download()}
      >
        {LABEL[kind]}
      </Button>
      {failed && (
        <p role="alert" className="text-secondary text-danger-ink">
          {globalCopy["export.error"]}
        </p>
      )}
    </div>
  );
}
