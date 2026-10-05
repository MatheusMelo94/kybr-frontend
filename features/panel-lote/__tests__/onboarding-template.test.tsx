import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CostCard } from "@/features/panel-lote/components/cost-card";
import { OnboardingStep2Banner } from "@/features/panel-lote/components/onboarding-step2-banner";
import {
  TEMPLATE_CSV,
  TEMPLATE_FILENAME,
} from "@/features/panel-lote/template";

describe("OnboardingStep2Banner (J1.5, AC 4 Lote half)", () => {
  it("Passo 2 de 2, lote.onb.title, lote.onb.body and Fazer depois → PANEL_HOME", () => {
    render(<OnboardingStep2Banner />);
    expect(screen.getByText("Passo 2 de 2")).toBeVisible();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Último passo: verifique a base que você já tem",
      }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Suba a planilha com os CNPJs dos seus vendedores. Leva poucos minutos.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Fazer depois" })).toHaveAttribute(
      "href",
      "/fila",
    );
  });

  it("is not a live region and takes no focus", () => {
    const { container } = render(<OnboardingStep2Banner />);
    expect(
      container.querySelector("[role=status],[role=alert],[aria-live]"),
    ).toBeNull();
  });
});

describe("the template (D-B8, AC 14)", () => {
  it("is the BOM and exactly the three headers + CRLF", () => {
    expect(TEMPLATE_CSV).toBe("﻿CNPJ;Responsável;ID na plataforma\r\n");
    expect(TEMPLATE_FILENAME).toBe("kybr-modelo-lote.csv");
  });

  it("the cost card links to it with download, the hint beside it", () => {
    render(<CostCard plano={undefined} />);
    const link = screen.getByRole("link", { name: "Baixar modelo" });
    expect(link).toHaveAttribute("href", "/lote/modelo.csv");
    expect(link).toHaveAttribute("download");
    expect(
      screen.getByText(
        "Colunas: CNPJ (obrigatória), Responsável e ID na plataforma (opcionais).",
      ),
    ).toBeVisible();
  });
});
