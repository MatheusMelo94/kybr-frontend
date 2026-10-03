import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CaseError } from "@/features/seller-link/components/case/case-error";
import { CaseNotFound } from "@/features/seller-link/components/case/case-not-found";
import { CaseSkeleton } from "@/features/seller-link/components/case/case-skeleton";

const params = vi.hoisted(() => ({ value: { slug: "loja-exemplo" } }));
vi.mock("next/navigation", () => ({ useParams: () => params.value }));

describe("CaseNotFound", () => {
  it("explains with casenotfound.* and one h1, revealing nothing about the CNPJ", () => {
    const { container } = render(<CaseNotFound />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Cadastro não encontrado",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Não encontramos este cadastro. Comece de novo pelo link de cadastro.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading")).toHaveLength(1);
    expect(container.textContent).not.toMatch(/cnpj|kybr/i);
  });

  it("Começar de novo goes back to this link's form", () => {
    render(<CaseNotFound />);

    expect(
      screen.getByRole("link", { name: "Começar de novo" }),
    ).toHaveAttribute("href", "/v/loja-exemplo");
  });
});

describe("CaseError", () => {
  it("shows caseerror.* and retries with Tentar de novo", () => {
    const onRetry = vi.fn();
    render(<CaseError onRetry={onRetry} />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Não conseguimos carregar seu cadastro",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Confira sua conexão e tente de novo."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("CaseSkeleton", () => {
  it("is hidden from assistive technology and marks the region busy", () => {
    const { container } = render(<CaseSkeleton />);

    expect(container.firstElementChild).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("sketches the result layout: step indicator, title and three rows (spec § States Matrix)", () => {
    const { container } = render(<CaseSkeleton />);

    expect(
      [...container.querySelectorAll("[data-skeleton]")].map((element) =>
        element.getAttribute("data-skeleton"),
      ),
    ).toEqual(["steps", "title", "row", "row", "row"]);
  });
});
