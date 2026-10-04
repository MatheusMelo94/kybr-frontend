"use client";

import { useId, useRef, useState, type ChangeEvent, type JSX } from "react";

import { Button } from "@/components/ui/button";
import { LiveRegion } from "@/components/ui/live-region";
import { useCommittedRefresh } from "@/features/seller-link/components/case/use-committed-refresh";
import { uploadCopy } from "@/features/seller-link/copy/upload";
import { fill } from "@/features/seller-link/format";
import { uploadResponseSchema } from "@/features/seller-link/upload-schemas";

/** What the picker offers: no `capture`, so the phone offers camera and files. */
const ACCEPT = "application/pdf,image/jpeg,image/png";

type Status = { kind: "idle" } | { kind: "busy" } | { kind: "error" };

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
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // Files received as this page counted them; the server's count wins once higher.
  const [uploaded, setUploaded] = useState(0);
  // What this page sent last: after a PDF, nothing more can be added.
  const [lastFormat, setLastFormat] = useState<"pdf" | "photos" | null>(null);

  const received = Math.max(enviados, uploaded);
  // The counts and pending.allreceived are the server's (AC 23).
  const refresh = useCommittedRefresh(enviados >= uploaded);

  async function send(files: File[]): Promise<void> {
    setStatus({ kind: "busy" });
    const body = new FormData();
    body.set("tipo", tipo);
    for (const file of files) body.append("arquivos", file);

    let response: Response;
    try {
      response = await fetch(uploadUrl, {
        method: "POST",
        body,
        credentials: "omit",
      });
    } catch {
      setStatus({ kind: "error" });
      return;
    }
    if (response.status !== 201) {
      setStatus({ kind: "error" });
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
      files.some((file) => file.type === "application/pdf") ? "pdf" : "photos",
    );
    setStatus({ kind: "idle" });
    refresh();
  }

  function picked(event: ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(event.target.files ?? []);
    // Cleared, so picking the same file again still fires `change`.
    event.target.value = "";
    if (files.length > 0) void send(files);
  }

  const canAdd = received > 0 && lastFormat !== "pdf";
  const statusText =
    status.kind === "error"
      ? uploadCopy["upload.error.network"]
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
        className={
          status.kind === "error"
            ? "text-secondary text-danger-ink"
            : "text-secondary text-ink"
        }
      >
        {statusText}
      </LiveRegion>
      {(received === 0 || canAdd) && (
        <Button
          variant="secondary"
          busy={status.kind === "busy"}
          busyLabel={uploadCopy["upload.busy"]}
          onClick={() => input.current?.click()}
          aria-describedby={
            received === 0 ? `${describedBy} ${hintId}` : describedBy
          }
          className="self-start"
        >
          {received === 0 ? uploadCopy["upload.cta"] : uploadCopy["upload.add"]}
        </Button>
      )}
      {received === 0 && (
        <p id={hintId} className="text-secondary text-ink-muted">
          {uploadCopy["upload.hint"]}
        </p>
      )}
    </div>
  );
}
