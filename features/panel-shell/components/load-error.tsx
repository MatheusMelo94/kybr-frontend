"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect, useRef, type JSX } from "react";

import { Button } from "@/components/ui/button";
import { globalCopy } from "@/features/panel-shell/copy/global";

type Props = {
  /** The error boundary's reset(), re-rendering the segment. */
  reset: () => void;
};

/** A data read failed: error.load.* with a working retry (DC § Screen States Matrix). */
export function LoadError({ reset }: Props): JSX.Element {
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <div role="alert" className="flex flex-col gap-3">
      {/* An error boundary can't export metadata: React 19 hoists this title. */}
      <title>{globalCopy["error.load.title"]}</title>
      <h2 ref={heading} tabIndex={-1} className="text-h2 font-title text-ink">
        {globalCopy["error.load.title"]}
      </h2>
      <p className="text-body text-ink-muted">
        {globalCopy["error.load.body"]}
      </p>
      <Button
        variant="secondary"
        size="panel"
        onClick={() =>
          startTransition(() => {
            router.refresh();
            reset();
          })
        }
        className="self-start"
      >
        {globalCopy["error.load.cta"]}
      </Button>
    </div>
  );
}
