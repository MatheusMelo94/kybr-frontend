import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnalysisView } from "@/features/seller-link/components/case/analysis-view";
import { CaseLiveStatus } from "@/features/seller-link/components/case/case-live-status";
import { VerifyingView } from "@/features/seller-link/components/case/verifying-view";

describe("VerifyingView", () => {
  it("AC 15: verifying.h1 and verifying.status", () => {
    render(<VerifyingView />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Verificando sua empresa",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Consultando Receita Federal, Simples Nacional e SINTEGRA…",
      ),
    ).toBeInTheDocument();
  });
});

describe("AnalysisView", () => {
  it("AC 17: the timeout variant: h1, analysis.body.timeout, then analysis.resume", () => {
    render(<AnalysisView variant="timeout" />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Sua empresa está em análise",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "A consulta está demorando mais que o normal. Você não precisa esperar aqui: avisamos o resultado por e-mail.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Este endereço também mostra o andamento. Guarde o link se quiser voltar.",
      ),
    ).toBeInTheDocument();
  });

  it("AC 18: the not-found variant uses analysis.body.notfound, with no company data or query date", () => {
    const { container } = render(<AnalysisView variant="notfound" />);

    expect(
      screen.getByText(
        "Ainda não encontramos os dados da sua empresa. Vamos conferir e avisar o resultado por e-mail.",
      ),
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(
      /demorando|Dados consultados|A empresa/,
    );
  });

  it("puts the e-mail block slot between the body and analysis.resume", () => {
    render(
      <AnalysisView
        variant="timeout"
        emailBlock={<section aria-label="e-mail" />}
      />,
    );

    const email = screen.getByRole("region", { name: "e-mail" });
    expect(
      screen
        .getByText(/^A consulta está demorando/)
        .compareDocumentPosition(email) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      email.compareDocumentPosition(screen.getByText(/^Este endereço/)) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("CaseLiveStatus: the 10 s switch (tech-design § 3 rule 3)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderSwitch(msUntilTimeout: number): ReturnType<typeof render> {
    return render(
      <CaseLiveStatus
        msUntilTimeout={msUntilTimeout}
        verifying={<h1>verificando</h1>}
        analysis={<h1>em análise</h1>}
      />,
    );
  }

  it("shows the verifying node until msUntilTimeout, then swaps to the analysis node", () => {
    renderSwitch(7_500);

    expect(
      screen.getByRole("heading", { name: "verificando" }),
    ).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(7_499);
    });
    expect(
      screen.getByRole("heading", { name: "verificando" }),
    ).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(
      screen.getByRole("heading", { name: "em análise" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "verificando" })).toBeNull();
  });

  it("shows the analysis node at once when no time is left", () => {
    renderSwitch(0);

    expect(
      screen.getByRole("heading", { name: "em análise" }),
    ).toBeInTheDocument();
  });

  it("stops its timer on unmount", () => {
    const { unmount } = renderSwitch(5_000);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
