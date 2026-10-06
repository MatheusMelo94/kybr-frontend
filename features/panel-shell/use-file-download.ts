"use client";

import { useRef, useState } from "react";

import { useSessionExpiry } from "@/features/panel-shell/use-session-expiry";

/**
 * A panel route handler's file, saved as a blob (Lote's CSVs, the Fila's
 * documents and proof). The fetch never follows redirects: an opaque
 * redirect is the session ending (the handler's requireSession()). A
 * non-2xx, a network failure or a response `filename` refuses is `failed`.
 * The name comes from `filename`, never the response's header (C9, F4), and
 * the blob URL is revoked after the click (F12).
 */
export function useFileDownload(
  href: string,
  filename: (response: Response) => string | undefined,
): { busy: boolean; failed: boolean; download: () => Promise<void> } {
  const expire = useSessionExpiry();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef(false);

  async function download(): Promise<void> {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch(href, {
        redirect: "manual",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (response.type === "opaqueredirect") {
        expire();
        return;
      }
      const name = response.ok ? filename(response) : undefined;
      if (name === undefined) {
        setFailed(true);
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
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

  return { busy, failed, download };
}
