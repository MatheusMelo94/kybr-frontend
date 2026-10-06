"use client";

import type { JSX } from "react";

import {
  documentFilename,
  extensionForType,
} from "@/features/panel-fila/document-file";
import { filaCopy } from "@/features/panel-fila/copy";
import { globalCopy } from "@/features/panel-shell/copy/global";
import { PANEL_LINK } from "@/features/panel-shell/components/panel-not-found";
import { useFileDownload } from "@/features/panel-shell/use-file-download";
import type { DocumentoTipo } from "@/lib/panel-api-values";

type Props = {
  href: string;
  tipo: DocumentoTipo;
};

/**
 * "Baixar" in attachment mode (Q19, F4): the handler's checked file as a
 * blob, named from the type the handler set from its magic bytes (any other
 * type is refused). A failure is export.error inline, next to the control.
 */
export function DocumentDownload({ href, tipo }: Props): JSX.Element {
  const { busy, failed, download } = useFileDownload(href, (response) => {
    const ext = extensionForType(response.headers.get("content-type") ?? "");
    return ext === undefined ? undefined : documentFilename(tipo, ext);
  });

  return (
    <span className="flex flex-wrap items-center gap-x-3">
      <button
        type="button"
        aria-busy={busy || undefined}
        aria-disabled={busy || undefined}
        onClick={() => void download()}
        className={`${PANEL_LINK} aria-busy:cursor-progress`}
      >
        {filaCopy["fila.docs.download"]}
      </button>
      {failed && (
        <span role="alert" className="text-secondary text-danger-ink">
          {globalCopy["export.error"]}
        </span>
      )}
    </span>
  );
}
