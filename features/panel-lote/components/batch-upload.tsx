"use client";

import { useEffect, useRef, useState, type JSX } from "react";

import { LiveRegion } from "@/components/ui/live-region";
import { BatchPreview } from "@/features/panel-lote/components/batch-preview";
import {
  DropZone,
  FILE_ERROR_COPY,
} from "@/features/panel-lote/components/drop-zone";
import { loteCopy } from "@/features/panel-lote/copy";
import type {
  ParseError,
  Preview,
} from "@/features/panel-lote/parser/protocol";
import { useBatchFile } from "@/features/panel-lote/use-batch-file";
import { fill, formatNumber } from "@/features/panel-shell/format";
import { planGate } from "@/features/panel-shell/plan-variant";
import { useShellStatus } from "@/features/panel-shell/shell-status-context";

type Props = {
  /** A mailto: from COMMERCIAL_CONTACT_EMAIL; unset hides "Contratar" (P-U4). */
  contratarHref: string | undefined;
};

/**
 * S7's upload (T79): pick or drop → reading → an error in the zone, or the
 * preview. The sheet is parsed in the worker (ADR-0012); nothing is sent and
 * nothing is spent before the CTA. The plan comes from the shell's live
 * status. T80 wires the CTA to startBatchAction.
 */
export function BatchUpload({ contratarHref }: Props): JSX.Element {
  const { state, parse, reset } = useBatchFile();
  const { plano } = useShellStatus();
  const [folderError, setFolderError] = useState(false);
  // Renata's pick, for the preview it was made on; otherwise the detected column.
  const [choice, setChoice] = useState<
    { preview: Preview; column: number } | undefined
  >(undefined);
  const dropButton = useRef<HTMLButtonElement>(null);
  const [announcement, setAnnouncement] = useState("");

  const preview = state.status === "preview" ? state.preview : undefined;
  const column =
    preview === undefined
      ? undefined
      : choice?.preview === preview
        ? choice.column
        : preview.detected.cnpj;

  const error: ParseError | undefined = folderError
    ? "type"
    : state.status === "error"
      ? state.error
      : undefined;

  // One polite region for the reading, the error and the preview's counts.
  useEffect(() => {
    if (state.status === "reading") setAnnouncement(loteCopy["lote.reading"]);
    else if (error !== undefined) setAnnouncement(FILE_ERROR_COPY[error]);
    else if (preview !== undefined) {
      const detected = preview.detected.cnpj;
      const valid =
        detected === undefined ? 0 : (preview.stats[detected]?.valid ?? 0);
      setAnnouncement(
        detected === undefined || valid === 0
          ? loteCopy[
              detected === undefined
                ? "lote.preview.nocolumn"
                : "lote.preview.novalid"
            ]
          : fill(loteCopy["lote.preview.found"], {
              validos: formatNumber(valid),
              coluna: preview.headers[detected] ?? "",
            }),
      );
    }
  }, [state.status, error, preview]);

  const left =
    plano === undefined ? undefined : Math.max(0, plano.limite - plano.usadas);

  return (
    <div className="flex flex-col gap-3">
      <LiveRegion className="sr-only">{announcement}</LiveRegion>
      {preview === undefined ? (
        <DropZone
          reading={state.status === "reading"}
          error={error}
          buttonRef={dropButton}
          onFile={(file) => {
            setFolderError(false);
            parse(file);
          }}
          onFolder={() => {
            reset();
            setFolderError(true);
          }}
        />
      ) : (
        <BatchPreview
          preview={preview}
          column={column}
          onColumn={(picked) => setChoice({ preview, column: picked })}
          left={left}
          gate={planGate(plano)}
          contratarHref={contratarHref}
          onStart={() => undefined}
          onChangeFile={() => {
            reset();
            setAnnouncement("");
            // Back to the empty zone, focus on its button.
            requestAnimationFrame(() => dropButton.current?.focus());
          }}
        />
      )}
    </div>
  );
}
