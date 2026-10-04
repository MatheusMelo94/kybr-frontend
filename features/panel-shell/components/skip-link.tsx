import type { JSX } from "react";

import { shellCopy } from "@/features/panel-shell/copy/shell";

/** The first Tab stop in the shell: past the nav to main#conteudo (WCAG 2.4.1). */
export function SkipLink(): JSX.Element {
  return (
    <a
      href="#conteudo"
      className="sr-only rounded-md bg-surface px-3 py-2 text-body font-strong text-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      {shellCopy["shell.skip"]}
    </a>
  );
}
