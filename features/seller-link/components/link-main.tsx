import type { JSX, ReactNode } from "react";

type Props = {
  children: ReactNode;
};

/**
 * The link's column, at most 480 px: LinkColumn without the Kybr footer.
 * global-error.tsx uses it alone: it's a client module and stays minimal,
 * so the wordmark never reaches a client chunk.
 */
export function LinkMain({ children }: Props): JSX.Element {
  return (
    <main className="mx-auto w-full max-w-link px-4 pt-8 pb-8 md:pt-16 lg:pt-24">
      {children}
    </main>
  );
}
