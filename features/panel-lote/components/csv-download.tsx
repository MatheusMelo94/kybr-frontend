"use client";

import { useRef, useState, type JSX } from "react";

import { Button } from "@/components/ui/button";
import { loteCopy } from "@/features/panel-lote/copy";
import { csvFilename } from "@/features/panel-lote/csv-filename";
import { globalCopy } from "@/features/panel-shell/copy/global";
import { useSessionExpiry } from "@/features/panel-shell/use-session-expiry";

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
 * "Baixar resultado (CSV)" / "Baixar erros (CSV)" (AC 21, T86): fetches the
 * re-escaping route handler without following redirects. An opaque redirect
 * is the session ending (the handler's requireSession()); any other non-2xx
 * or a network failure, export.error inline. A 2xx becomes a blob download
 * under a name built here, never the response's header (C9), and the blob
 * URL is revoked after the click.
 */
export function CsvDownload({
  batchId,
  kind,
  concluidoEm,
}: Props): JSX.Element {
  const expire = useSessionExpiry();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef(false);

  async function onDownload(): Promise<void> {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch(`/lote/${batchId}/${ROUTE[kind]}`, {
        redirect: "manual",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (response.type === "opaqueredirect") {
        expire();
        return;
      }
      if (!response.ok) {
        setFailed(true);
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = csvFilename(
        kind,
        concluidoEm === undefined ? new Date() : new Date(concluidoEm),
      );
      // In the document for the click (older Firefox); revoked on the next
      // task, once the download has its own reference.
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      setFailed(true);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="secondary"
        size="panel"
        busy={busy}
        onClick={() => void onDownload()}
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
