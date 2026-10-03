import type { JSX } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { formCopy } from "@/features/seller-link/copy/form";
import { fill } from "@/features/seller-link/format";
import { RazaoSocial } from "@/features/seller-link/razao-social";
import { cn } from "@/lib/utils";

/** The company block's projection: never a street address (U-E, spec v3). */
export type CompanySummary = {
  razaoSocial: string;
  atividade: string;
  municipio: string;
  uf: string;
};

export type CompanyBlockState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "found"; company: CompanySummary }
  | { status: "not_found" }
  | { status: "failed" };

// One minimum height for every state, so a result never shifts the form
// (design-conventions.md § Screen States Matrix; review M1 v1 finding 0001).
// Sized to the filled block of the common case, without truncating anything:
// a two-line razão social, the activity and the city.
// - Phone (328 px column): the activity wraps to three lines → 164 px.
// - sm and up (the 480 px column): the activity fits two lines → 144 px.
// Guarded by geometry in tests/e2e/seller-link/company-block-layout.spec.ts.
const BOX = "min-h-41 sm:min-h-36 rounded-lg bg-surface-raised p-4";

/** The grey autofill block under the CNPJ field (spec AC 7–9). */
export function CompanyBlock({
  state,
}: {
  state: CompanyBlockState;
}): JSX.Element | null {
  switch (state.status) {
    case "idle":
      return null;
    case "loading":
      return (
        <div
          data-testid="company-block"
          aria-busy="true"
          className={cn(BOX, "flex flex-col gap-2")}
        >
          <Skeleton className="h-5 w-3/4 bg-line" />
          <Skeleton className="h-4 w-full bg-line" />
          <Skeleton className="h-4 w-1/2 bg-line" />
        </div>
      );
    case "found": {
      const { razaoSocial, atividade, municipio, uf } = state.company;
      return (
        <div
          data-testid="company-block"
          className={cn(BOX, "flex flex-col gap-1")}
        >
          <p className="text-body font-strong break-words text-ink">
            <RazaoSocial value={razaoSocial} />
          </p>
          <p className="text-secondary break-words text-ink-muted">
            {fill(formCopy["form.lookup.activity"], { atividade })}
          </p>
          <p className="text-secondary text-ink-muted">
            {fill(formCopy["form.lookup.location"], { municipio, uf })}
          </p>
        </div>
      );
    }
    case "not_found":
    case "failed":
      return (
        <div data-testid="company-block" className={BOX}>
          <p className="text-secondary text-ink-muted">
            {
              formCopy[
                state.status === "not_found"
                  ? "form.lookup.notfound"
                  : "form.lookup.failed"
              ]
            }
          </p>
        </div>
      );
  }
}
