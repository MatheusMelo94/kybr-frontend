import Link from "next/link";
import type { JSX } from "react";

import { globalCopy } from "@/features/panel-shell/copy/global";

export const PANEL_LINK =
  "inline-flex min-h-11 items-center text-body font-strong text-ink underline underline-offset-4 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/** S16 unknown route (AC 13): notfound.* and the way to the Fila, with or without a session. */
export function PanelNotFound(): JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-title font-title text-ink">
        {globalCopy["notfound.h1"]}
      </h1>
      <p className="text-body text-ink-muted">{globalCopy["notfound.body"]}</p>
      <Link href="/fila" className={PANEL_LINK}>
        {globalCopy["notfound.cta"]}
      </Link>
    </div>
  );
}
