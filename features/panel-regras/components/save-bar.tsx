"use client";

import type { JSX, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { regrasCopy } from "@/features/panel-regras/copy";

type Props = {
  onDiscard: () => void;
  busy?: boolean;
  /** An inline failure (regras.save.error / .conflict), in the bar. */
  alert?: ReactNode;
};

/**
 * The sticky save bar (spec S11 Dirty): regras.save.note, Descartar and
 * Salvar regras (the form's submit). It flex-wraps at 360 and 200 % text.
 */
export function SaveBar({
  onDiscard,
  busy = false,
  alert,
}: Props): JSX.Element {
  return (
    <section
      aria-label={regrasCopy["regras.save"]}
      className="sticky bottom-0 z-10 flex min-w-0 flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-raised p-4"
    >
      {/* The note takes the row and wraps the buttons under it below 16rem
          (about 256 px: a phone at 200 % text). */}
      <p className="min-w-0 flex-[1_1_16rem] text-secondary text-ink">
        {regrasCopy["regras.save.note"]}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="panel"
          disabled={busy}
          onClick={onDiscard}
        >
          {regrasCopy["regras.discard"]}
        </Button>
        <Button
          type="submit"
          size="panel"
          busy={busy}
          busyLabel={regrasCopy["regras.save.busy"]}
        >
          {regrasCopy["regras.save"]}
        </Button>
      </div>
      {alert}
    </section>
  );
}
