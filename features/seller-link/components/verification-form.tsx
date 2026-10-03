"use client";

import { useRef, useState, type JSX } from "react";

import { Button } from "@/components/ui/button";
import { LiveRegion } from "@/components/ui/live-region";
import { lookupCompanyAction } from "@/features/seller-link/actions";
import { CnpjField } from "@/features/seller-link/components/cnpj-field";
import {
  CompanyBlock,
  type CompanyBlockState,
} from "@/features/seller-link/components/company-block";
import { formCopy } from "@/features/seller-link/copy/form";
import { fill } from "@/features/seller-link/format";
import { razaoSocialText } from "@/features/seller-link/razao-social";

type Lookup = CompanyBlockState & { cnpj?: string };

type Props = {
  slug: string;
};

/**
 * The verification form (client leaf). This task covers the CNPJ field and its
 * autofill. The name field (T17) and the submit (T18) follow. The form's
 * function action keeps a pre-hydration submit inert, so it never falls back
 * to a GET with the CNPJ in the query string.
 */
export function VerificationForm({ slug }: Props): JSX.Element {
  const [cnpj, setCnpj] = useState("");
  const [lookup, setLookup] = useState<Lookup>({ status: "idle" });
  const [announcement, setAnnouncement] = useState("");
  // The CNPJ whose lookup is in flight; a response for any other is stale.
  const current = useRef<string | null>(null);

  function changeCnpj(next: string): void {
    setCnpj(next);
    if (current.current !== null && next !== current.current) {
      current.current = null;
      setLookup({ status: "idle" });
    }
  }

  async function lookUp(target: string): Promise<void> {
    current.current = target;
    setLookup({ status: "loading", cnpj: target });
    setAnnouncement(formCopy["form.lookup.loading"]);

    let next: Lookup;
    try {
      const result = await lookupCompanyAction(slug, target);
      next = result.ok
        ? { status: "found", cnpj: target, company: result.company }
        : { status: result.reason, cnpj: target };
    } catch {
      // The action itself couldn't be reached (offline): the same note, no retry.
      next = { status: "failed", cnpj: target };
    }
    if (current.current !== target) return;

    setLookup(next);
    setAnnouncement(
      next.status === "found"
        ? fill(formCopy["form.lookup.found"], {
            razao_social: razaoSocialText(next.company.razaoSocial),
          })
        : formCopy[
            next.status === "not_found"
              ? "form.lookup.notfound"
              : "form.lookup.failed"
          ],
    );
  }

  return (
    <form action={() => {}} noValidate className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <CnpjField
          value={cnpj}
          onValueChange={changeCnpj}
          onValidCnpj={(target) => void lookUp(target)}
        />
        <CompanyBlock state={lookup} />
      </div>
      <LiveRegion className="sr-only">{announcement}</LiveRegion>
      <Button type="submit" className="w-full">
        {formCopy["form.submit"]}
      </Button>
    </form>
  );
}
