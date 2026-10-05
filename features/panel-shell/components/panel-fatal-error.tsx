"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useRef, type JSX } from "react";

import { Button } from "@/components/ui/button";
import { PANEL_LINK } from "@/features/panel-shell/components/panel-not-found";
import { globalCopy } from "@/features/panel-shell/copy/global";

type Props = {
  reset: () => void;
  /** Logged on the server already; never shown (FA § Error Handling). */
  digest?: string | undefined;
};

/** S16 unexpected error: fatal.*, "Tentar de novo" (reset + refresh) and "Ir para a fila". No detail. */
export function PanelFatalError({ reset }: Props): JSX.Element {
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <div className="flex flex-col gap-3">
      {/* An error boundary can't export metadata: React 19 hoists this title. */}
      <title>{globalCopy["fatal.h1"]}</title>
      <h1
        ref={heading}
        tabIndex={-1}
        className="text-title font-title text-ink"
      >
        {globalCopy["fatal.h1"]}
      </h1>
      <p className="text-body text-ink-muted">{globalCopy["fatal.body"]}</p>
      <div className="flex flex-wrap items-center gap-4">
        <Button
          size="panel"
          onClick={() =>
            startTransition(() => {
              router.refresh();
              reset();
            })
          }
        >
          {globalCopy["fatal.cta"]}
        </Button>
        <Link href="/fila" className={PANEL_LINK}>
          {globalCopy["notfound.cta"]}
        </Link>
      </div>
    </div>
  );
}
