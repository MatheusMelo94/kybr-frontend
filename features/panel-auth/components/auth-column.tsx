import type { JSX, ReactNode } from "react";

import { Wordmark } from "@/components/ui/wordmark";
import { globalCopy } from "@/features/panel-shell/copy/global";

type Props = {
  children: ReactNode;
};

/**
 * The auth and onboarding screens' single centered column, at most 440 px
 * (spec S1–S4: a single-task screen, so centered on purpose), under the Kybr
 * wordmark (80 px wide, named "Kybr"; panel AC 75, brand v1).
 */
export function AuthColumn({ children }: Props): JSX.Element {
  return (
    <main className="mx-auto flex w-full max-w-auth flex-col gap-8 px-4 pt-8 pb-12 md:pt-16">
      <div className="text-ink">
        <Wordmark
          variant="lockup"
          width={80}
          alignGlyphs
          aria-label={globalCopy.brand}
        />
      </div>
      {children}
    </main>
  );
}
