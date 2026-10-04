"use client";

import { useId, useRef, useState, type ChangeEvent, type JSX } from "react";

import { Button } from "@/components/ui/button";
import { LiveRegion } from "@/components/ui/live-region";
import { useCommittedRefresh } from "@/features/seller-link/components/case/use-committed-refresh";
import { uploadCopy } from "@/features/seller-link/copy/upload";
import { fill } from "@/features/seller-link/format";
import {
  checkUpload,
  uploadResponseSchema,
  uploadType,
  type UploadIssue,
} from "@/features/seller-link/upload-schemas";

/** What the picker offers: no `capture`, so the phone offers camera and files. */
const ACCEPT = "application/pdf,image/jpeg,image/png";

type UploadError = UploadIssue | "network";

type Status =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "error"; error: UploadError }
  /** 409: the case was decided; nothing more can be sent. */
  | { kind: "closed" };

const ERROR_COPY: Record<UploadError, string> = {
  size: uploadCopy["upload.error.size"],
  type: uploadCopy["upload.error.type"],
  mixed: uploadCopy["upload.error.mixed"],
  network: uploadCopy["upload.error.network"],
};

type Props = {
  /** D6, built on the server from API_PUBLIC_BASE_URL (ADR-0004b; F01 paths). */
  uploadUrl: string;
  /** The requested document's type, sent as `tipo`. */
  tipo: string;
  /** D4's documentos_enviados for this item. */
  enviados: number;
  /** The id of the item's title, so the button's description names it (WCAG 2.5.3). */
  describedBy: string;
};

/**
 * One requested document's upload (spec § Upload, AC 21, AC 23). The visible
 * button opens a hidden file input; the pick goes as one multipart POST from
 * the browser straight to the Kybr API (ADR-0004b), never through a Server
 * Action, so it doesn't hold up the status checks or the e-mail save. After a
 * 201 the page refreshes, so the counts and pending.allreceived come from the
 * server.
 */
export function DocumentUpload({
  uploadUrl,
  tipo,
  enviados,
  describedBy,
}: Props): JSX.Element {
  const hintId = useId();
  const statusId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // Files received as this page counted them; the server's count wins once higher.
  const [uploaded, setUploaded] = useState(0);
  // What this page sent last: after a PDF, nothing more can be added.
  const [lastFormat, setLastFormat] = useState<"pdf" | "photos" | null>(null);
  // Bytes this page sent for the document (the 10 MB limit is per document).
  const [sentBytes, setSentBytes] = useState(0);
  // The pick that failed on the network: tapping again resends it (AC 22).
  const [retry, setRetry] = useState<File[] | null>(null);

  const received = Math.max(enviados, uploaded);
  // The counts and pending.allreceived are the server's (AC 23).
  const refresh = useCommittedRefresh(enviados >= uploaded);

  /** The error for a non-201 answer (D7 codes, mapped by status; ADR-0004b). */
  function errorFor(status: number): UploadError {
    switch (status) {
      case 413: // ARQUIVO_GRANDE (10 MB) or LIMITE_ARQUIVOS (30 files, F05): one copy (Q7)
        return "size";
      case 415:
        // On an added page the photos are valid on their own: the API refused
        // the mix with what's already there (which may be a PDF).
        return received > 0 ? "mixed" : "type";
      default: // 429 and 5xx: nothing the seller did; tapping again retries
        return "network";
    }
  }

  async function send(files: File[]): Promise<void> {
    setStatus({ kind: "busy" });
    setRetry(null);
    const body = new FormData();
    body.set("tipo", tipo);
    for (const file of files) body.append("arquivos", file);

    let response: Response;
    try {
      response = await fetch(uploadUrl, {
        method: "POST",
        body,
        credentials: "omit",
        // The page path carries the case token: never send it (M3-09).
        referrerPolicy: "no-referrer",
      });
    } catch {
      setRetry(files);
      setStatus({ kind: "error", error: "network" });
      return;
    }
    if (response.status === 409) {
      setStatus({ kind: "closed" });
      return;
    }
    if (response.status === 404) {
      // The case is gone: the page re-renders as Case not found.
      setStatus({ kind: "idle" });
      refresh();
      return;
    }
    if (response.status !== 201) {
      const error = errorFor(response.status);
      if (error === "network") setRetry(files);
      setStatus({ kind: "error", error });
      return;
    }
    const parsed = uploadResponseSchema.safeParse(
      await response.json().catch(() => undefined),
    );
    setUploaded(
      parsed.success
        ? parsed.data.documentos_enviados
        : received + files.length,
    );
    setLastFormat(
      files.some((file) => uploadType(file) === "application/pdf")
        ? "pdf"
        : "photos",
    );
    setSentBytes(
      (bytes) => bytes + files.reduce((total, file) => total + file.size, 0),
    );
    setStatus({ kind: "idle" });
    refresh();
  }

  function picked(event: ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(event.target.files ?? []);
    // Cleared, so picking the same file again still fires `change`.
    event.target.value = "";
    if (files.length === 0) return;
    // Nothing from a pick that fails a check is sent; files received stay.
    const issue = checkUpload(files, { received, sentBytes });
    if (issue !== null) {
      setRetry(null);
      setStatus({ kind: "error", error: issue });
      return;
    }
    void send(files);
  }

  const canAdd = received > 0 && lastFormat !== "pdf";
  const statusText =
    status.kind === "error"
      ? ERROR_COPY[status.error]
      : status.kind === "closed"
        ? uploadCopy["upload.error.closed"]
        : received === 1
          ? uploadCopy["upload.received.one"]
          : received > 1
            ? fill(uploadCopy["upload.received.many"], { n: received })
            : "";

  return (
    <div className="mt-2 flex flex-col gap-2">
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={picked}
      />
      <LiveRegion
        id={statusId}
        className={
          status.kind === "error" || status.kind === "closed"
            ? "text-secondary text-danger-ink"
            : "text-secondary text-ink"
        }
      >
        {statusText}
      </LiveRegion>
      {status.kind !== "closed" && (received === 0 || canAdd) && (
        <Button
          variant="secondary"
          busy={status.kind === "busy"}
          busyLabel={uploadCopy["upload.busy"]}
          onClick={() => {
            if (retry) void send(retry);
            else input.current?.click();
          }}
          aria-describedby={[
            describedBy,
            received === 0 && hintId,
            // While a pick failed, the button says why (review 0015).
            status.kind === "error" && statusId,
          ]
            .filter(Boolean)
            .join(" ")}
          className="self-start"
        >
          {received === 0 ? uploadCopy["upload.cta"] : uploadCopy["upload.add"]}
        </Button>
      )}
      {status.kind !== "closed" && received === 0 && (
        <p id={hintId} className="text-secondary text-ink-muted">
          {uploadCopy["upload.hint"]}
        </p>
      )}
    </div>
  );
}
