import { render, screen } from "@testing-library/react";
import type { JSX } from "react";
import { describe, expect, it } from "vitest";

import { AnalysisView } from "@/features/seller-link/components/case/analysis-view";
import { ApprovedView } from "@/features/seller-link/components/case/approved-view";
import { BlockedView } from "@/features/seller-link/components/case/blocked-view";
import { PendingView } from "@/features/seller-link/components/case/pending-view";
import { VerifyingView } from "@/features/seller-link/components/case/verifying-view";
import {
  publicCaseSchema,
  type CaseResult,
} from "@/lib/api/schemas/public-link";

const CREATED = "2026-10-01T12:00:00.000Z";

function result(estado: "approved" | "pending" | "blocked"): CaseResult {
  const parsed = publicCaseSchema.parse({
    estado,
    criado_em: CREATED,
    resultado: {
      razao_social: "Comercial Exemplo Ltda.",
      responsavel: "Maria Exemplo Silva",
      consultado_em: CREATED,
      prazo_revisao: CREATED,
      motivo: { codigo: "MEI" },
    },
  });
  if (!parsed.resultado) throw new Error("fixture without resultado");
  return parsed.resultado;
}

const VIEWS: [string, () => JSX.Element][] = [
  ["verificando", () => <VerifyingView />],
  ["em análise", () => <AnalysisView variant="timeout" />],
  [
    "tudo certo",
    () => <ApprovedView resultado={result("approved")} marketplace="Loja" />,
  ],
  ["quase lá", () => <PendingView resultado={result("pending")} />],
  [
    "não aprovado",
    () => (
      <BlockedView
        resultado={result("blocked")}
        marketplace="Loja"
        contact={{ tipo: "email", valor: "contato@loja.test" }}
      />
    ),
  ],
];

describe("case views: focus targets for CaseViewTransition", () => {
  it.each(VIEWS)(
    "%s has exactly one h1, focusable by script but not in the tab order",
    (_name, view) => {
      render(view());

      const headings = screen.getAllByRole("heading", { level: 1 });
      expect(headings).toHaveLength(1);
      expect(headings[0]).toHaveAttribute("tabindex", "-1");
    },
  );
});
