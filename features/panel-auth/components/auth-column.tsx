import type { JSX, ReactNode } from "react";

import { globalCopy } from "@/features/panel-shell/copy/global";

type Props = {
  children: ReactNode;
};

/**
 * The auth and onboarding screens' single centered column, at most 440 px
 * (spec S1–S4: a single-task screen, so centered on purpose), under the
 * brand text.
 */
export function AuthColumn({ children }: Props): JSX.Element {
  return (
    <main className="mx-auto flex w-full max-w-auth flex-col gap-8 px-4 pt-8 pb-12 md:pt-16">
      <p className="text-body font-title text-ink">{globalCopy.brand}</p>
      {children}
    </main>
  );
}
