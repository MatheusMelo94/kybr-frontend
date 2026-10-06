import type { JSX } from "react";

import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { DocumentDownload } from "@/features/panel-fila/components/document-download";
import { filaCopy } from "@/features/panel-fila/copy";
import { formatDataHora } from "@/features/panel-fila/format";
import { globalCopy } from "@/features/panel-shell/copy/global";
import { PANEL_LINK } from "@/features/panel-shell/components/panel-not-found";
import { fill } from "@/features/panel-shell/format";
import type { CaseDocumentView } from "@/lib/api/panel/cases";

const documentHref = (caseId: string, docId: string): string =>
  `/fila/${encodeURIComponent(caseId)}/documentos/${encodeURIComponent(docId)}`;

type Props = {
  caseId: string;
  documentos: readonly CaseDocumentView[];
  /** PANEL_DOCUMENTS_MODE (Q1): what the route answers, so what the control says (Q19). */
  mode?: "redirect" | "attachment" | undefined;
};

/**
 * The seller's documents (spec AC 29). Both controls go to the panel's own
 * route, so the page never holds a document URL (F1): "Abrir" opens its 303
 * to a fresh signed URL in a new tab (D6); in attachment mode, "Baixar"
 * saves the F4 stream (Q19).
 */
export function DocumentList({
  caseId,
  documentos,
  mode = "redirect",
}: Props): JSX.Element {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-body font-strong text-ink">
        {filaCopy["fila.docs.h"]}
      </h3>
      {documentos.length === 0 ? (
        <p className="text-body text-ink-muted">
          {filaCopy["fila.docs.empty"]}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {documentos.map((doc) => (
            <li
              key={doc.id}
              className="flex flex-wrap items-center justify-between gap-x-4"
            >
              <span className="text-body text-ink tabular-nums">
                {fill(filaCopy["fila.docs.item"], {
                  documento: filaCopy[`documento.${doc.tipo}`],
                  data_hora: formatDataHora(doc.enviadoEm),
                })}
              </span>
              {mode === "attachment" ? (
                <DocumentDownload
                  href={documentHref(caseId, doc.id)}
                  tipo={doc.tipo}
                />
              ) : (
                // A route handler, not a page: a plain link (FA § Routing).
                <a
                  href={documentHref(caseId, doc.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={PANEL_LINK}
                >
                  {filaCopy["fila.docs.open"]}{" "}
                  <VisuallyHidden>
                    {globalCopy["common.new_tab"]}
                  </VisuallyHidden>
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
