import type { Metadata } from "next";
import type { JSX } from "react";

import { PolicyForm } from "@/features/panel-regras/components/policy-form";
import { regrasCopy } from "@/features/panel-regras/copy";
import { AppError } from "@/lib/api/errors";
import { getPolicy } from "@/lib/api/panel/policies";
import { requireSession } from "@/lib/api/panel/session";
import { getCategories } from "@/lib/api/panel/workspace";

export const metadata: Metadata = { title: regrasCopy["regras.h1"] };

/**
 * /regras (S11, AC 59, plan-m8 D8): the policy of the workspace's one
 * category (O-08, from the session, never the URL) and the category's name
 * and description for the copy. A failed read is error.tsx (error.load.*).
 */
export default async function RegrasPage(): Promise<JSX.Element> {
  const me = await requireSession();
  const categoria = me.workspace.categoria;
  // The (app) gate sends a workspace without a category to onboarding.
  if (categoria === null) throw new AppError({ code: "UNAVAILABLE" });
  const [policy, categories] = await Promise.all([
    getPolicy(categoria),
    getCategories(),
  ]);
  const category = categories.find((item) => item.id === categoria);
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <h1 className="text-title font-title text-ink">
        {regrasCopy["regras.h1"]}
      </h1>
      <PolicyForm
        policy={policy}
        categoria={{
          nome: category?.nome ?? categoria,
          descricao: category?.descricao ?? "",
        }}
      />
    </div>
  );
}
