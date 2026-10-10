import { render, screen } from "@testing-library/react";
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

  it("one link per page, the current one marked, keeping q and status", () => {
    render(
      <SellersPager
        search={{ pagina: 2, status: "mudou", q: "exemplo" }}
        paginas={3}
      />,
    );
    // No nav landmark: the spec has no label for it (flagged to UX).
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["1", "2", "3"]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/vendedores?status=mudou&q=exemplo",
      "/vendedores?status=mudou&q=exemplo&pagina=2",
      "/vendedores?status=mudou&q=exemplo&pagina=3",
    ]);
    expect(links[1]).toHaveAttribute("aria-current", "page");
    expect(links[0]).not.toHaveAttribute("aria-current");
  });
});
