"use client";

import type { JSX } from "react";

import { Button } from "@/components/ui/button";
import { filaCopy } from "@/features/panel-fila/copy";
import { proofFilename } from "@/features/panel-fila/proof-filename";
import { useFileDownload } from "@/features/panel-shell/use-file-download";

type Props = {
  caseId: string;
};

/**
 * "Baixar comprovante" (AC 42): the proof handler's PDF through
 * useFileDownload (no redirects followed, blob URL revoked, F12), busy with
 * its label unchanged (G14), fila.proof.error inline on any failure.
 */
export function ProofDownload({ caseId }: Props): JSX.Element {
  const { busy, failed, download } = useFileDownload(
    `/fila/${encodeURIComponent(caseId)}/comprovante`,
    () => proofFilename(new Date()),
  );

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="secondary"
        size="panel"
        busy={busy}
        onClick={() => void download()}
      >
        {filaCopy["fila.action.proof"]}
      </Button>
      {failed && (
        <p role="alert" className="text-secondary text-danger-ink">
          {filaCopy["fila.proof.error"]}
        </p>
      )}
    </div>
  );
}
