import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/navigation/soft-navigate", () => ({
  useSoftNavigate: () => vi.fn(),
}));

import { SellersPager } from "@/features/panel-sellers/components/sellers-pager";

// T140 (AC 55): numbered pages of 50; each link keeps q and status.

describe("SellersPager", () => {
  it("nothing with one page or none", () => {
    const { container, rerender } = render(
      <SellersPager search={{ pagina: 1 }} paginas={1} />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(<SellersPager search={{ pagina: 1 }} paginas={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("a nav labelled sellers.pager.label: Voltar ao início, the numbers, Próximos 50, keeping q and status", () => {
    render(
      <SellersPager
        search={{ pagina: 2, status: "mudou", q: "exemplo" }}
        paginas={3}
      />,
    );
    const nav = screen.getByRole("navigation", {
      name: "Páginas de vendedores",
    });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Voltar ao início",
      "1",
      "2",
      "3",
      "Próximos 50",
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/vendedores?status=mudou&q=exemplo",
      "/vendedores?status=mudou&q=exemplo",
      "/vendedores?status=mudou&q=exemplo&pagina=2",
      "/vendedores?status=mudou&q=exemplo&pagina=3",
      "/vendedores?status=mudou&q=exemplo&pagina=3",
    ]);
    expect(links[2]).toHaveAttribute("aria-current", "page");
    expect(links[1]).not.toHaveAttribute("aria-current");
  });

  it("no Voltar ao início on page 1, no Próximos 50 on the last", () => {
    const { rerender } = render(
      <SellersPager search={{ pagina: 1 }} paginas={2} />,
    );
    expect(screen.queryByRole("link", { name: "Voltar ao início" })).toBeNull();
    expect(screen.getByRole("link", { name: "Próximos 50" })).toBeTruthy();
    rerender(<SellersPager search={{ pagina: 2 }} paginas={2} />);
    expect(screen.queryByRole("link", { name: "Próximos 50" })).toBeNull();
    expect(screen.getByRole("link", { name: "Voltar ao início" })).toBeTruthy();
  });
});
