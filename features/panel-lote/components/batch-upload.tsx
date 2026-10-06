"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type JSX } from "react";

import { LiveRegion } from "@/components/ui/live-region";
import { startBatchAction } from "@/features/panel-lote/actions";
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
import { globalCopy } from "@/features/panel-shell/copy/global";
import { fill, formatNumber } from "@/features/panel-shell/format";
import { planGate } from "@/features/panel-shell/plan-variant";
import { useShellStatus } from "@/features/panel-shell/shell-status-context";
import { useSessionExpiry } from "@/features/panel-shell/use-session-expiry";
import type { BatchLinha } from "@/lib/panel-api-values";

type Props = {
  /** A mailto: from COMMERCIAL_CONTACT_EMAIL; unset hides "Contratar" (P-U4). */
  contratarHref: string | undefined;
};

/**
 * S7's upload (T79): pick or drop → reading → an error in the zone, or the
 * preview. The sheet is parsed in the worker (ADR-0012); nothing is sent and
 * nothing is spent before the CTA. The plan comes from the shell's live
 * status. The CTA (T80) builds the rows in the worker and posts them with the
 * preview's Idempotency-Key (one per file and column, reused on a retry, so
 * a double click or a retry starts one batch, A-X7), then opens /lote/{id}.
 */
export function BatchUpload({ contratarHref }: Props): JSX.Element {
  const { state, parse, build, reset } = useBatchFile();
  const { plano, contagens, update } = useShellStatus();
  const router = useRouter();
  const expire = useSessionExpiry();
  const [busy, setBusy] = useState(false);
  const [startError, setStartError] = useState(false);
  const [serverLeft, setServerLeft] = useState<number | undefined>(undefined);
  // The rows and key for this file + column (dropped after the start, C8).
  const attempt = useRef<
    | {
        preview: Preview;
        column: number;
        key: string;
        linhas?: BatchLinha[] | undefined;
      }
    | undefined
  >(undefined);
  // P5-002: the preview whose rows are built. The worker ends after the
  // build (ADR-0012 item 1), so its column is locked; "Trocar arquivo"
  // re-parses to choose another.
  const [builtFor, setBuiltFor] = useState<Preview | undefined>(undefined);
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
    serverLeft ??
    (plano === undefined
      ? undefined
      : Math.max(0, plano.limite - plano.usadas));

  async function onStart(): Promise<void> {
    if (busy || preview === undefined || column === undefined) return;
    if (
      attempt.current?.preview !== preview ||
      attempt.current.column !== column
    )
      attempt.current = { preview, column, key: crypto.randomUUID() };
    const current = attempt.current;
    setBusy(true);
    setStartError(false);
    try {
      current.linhas ??= await build(column);
      if (current.linhas === undefined) return;
      setBuiltFor(preview);
      const result = await startBatchAction({
        idempotencyKey: current.key,
        linhas: current.linhas,
      });
      if (result.ok) {
        attempt.current = undefined;
        // The nav says "Verificando" now, not at the next 60 s poll (S5).
        if (contagens !== undefined)
          update({
            contagens: { ...contagens, lote_em_andamento: true },
            plano,
          });
        router.push(`/lote/${result.id}`);
        return;
      }
      if (result.code === "SESSAO_EXPIRADA") expire();
      else if (result.code === "SEM_SALDO") setServerLeft(result.disponiveis);
      else setStartError(true);
    } catch {
      // P5-001: the action itself rejected (offline, a dropped connection, a
      // new deploy's action id, middleware's 411/413): the same error.network,
      // and the key and rows stay for the retry (A-X7).
      setStartError(true);
    } finally {
      setBusy(false);
    }
  }

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
          // P5-014: also while the rows are being built (busy).
          columnLocked={busy || builtFor === preview}
          left={left}
          gate={planGate(plano)}
          contratarHref={contratarHref}
          busy={busy}
          onStart={() => void onStart()}
          onChangeFile={() => {
            attempt.current = undefined;
            setBuiltFor(undefined);
            setServerLeft(undefined);
            setStartError(false);
            reset();
            setAnnouncement("");
            // Back to the empty zone, focus on its button.
            requestAnimationFrame(() => dropButton.current?.focus());
          }}
        />
      )}
      {startError && (
        <p role="alert" className="text-secondary text-danger-ink">
          {globalCopy["error.network"]}
        </p>
      )}
    </div>
  );
}
