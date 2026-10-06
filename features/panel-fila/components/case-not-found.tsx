import Link from "next/link";
import type { JSX } from "react";

import { filaCopy } from "@/features/panel-fila/copy";
import { PANEL_LINK } from "@/features/panel-shell/components/panel-not-found";

/** An unknown or foreign case: the same words and markup for both (AC 41, 73; P05). */
export function CaseNotFound(): JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-title font-title text-ink">
        {filaCopy["fila.notfound.h"]}
      </h1>
      <p className="text-body text-ink-muted">
        {filaCopy["fila.notfound.body"]}
      </p>
      <Link href="/fila" className={PANEL_LINK}>
        {filaCopy["fila.back"]}
      </Link>
    </div>
  );
}
