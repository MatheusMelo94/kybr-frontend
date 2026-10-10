"use client";

import type { JSX } from "react";

import { Switch } from "@/components/panel/switch";
import { filaCopy } from "@/features/panel-fila/copy";
import { regrasCopy } from "@/features/panel-regras/copy";
import { DOCUMENTO_TIPOS, type DocumentoTipo } from "@/lib/panel-api-values";

type Props = {
  enabled: readonly DocumentoTipo[];
  onToggle: (tipo: DocumentoTipo, on: boolean) => void;
  /** regras.error.nodocs: shown in the card and describing each switch. */
  error?: { id: string; text: string } | undefined;
};

/** "Documentos que o link pode pedir" (spec S11): one Switch per type. */
export function DocToggles({ enabled, onToggle, error }: Props): JSX.Element {
  return (
    <section
      aria-labelledby="regras-docs-h"
      className="flex min-w-0 flex-col gap-3 rounded-lg border border-line p-4"
    >
      <h2 id="regras-docs-h" className="text-h2 font-title text-ink">
        {regrasCopy["regras.docs.h"]}
      </h2>
      <p className="text-secondary text-ink-muted">
        {regrasCopy["regras.docs.sub"]}
      </p>
      <ul className="flex flex-col gap-1">
        {DOCUMENTO_TIPOS.map((tipo) => (
          <li key={tipo}>
            <Switch
              label={filaCopy[`documento.${tipo}`]}
              checked={enabled.includes(tipo)}
              onChange={(on) => onToggle(tipo, on)}
              describedBy={error?.id}
            />
          </li>
        ))}
      </ul>
      {error && (
        <p id={error.id} className="text-secondary text-danger-ink">
          {error.text}
        </p>
      )}
    </section>
  );
}
