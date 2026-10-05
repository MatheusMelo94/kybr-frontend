import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LinkColumn } from "@/features/seller-link/components/link-column";

// Link AC 40 (brand v1, DDR-0002): every /v/* screen ends with the Kybr
// footer. LinkColumn wraps them all (the (link) layout, the root not-found).

describe("LinkColumn", () => {
  it("renders the screen in main, then the footer 'Verificação por Kybr'", () => {
    render(
      <LinkColumn>
        <h1>Cadastro de vendedor</h1>
      </LinkColumn>,
    );

    const main = screen.getByRole("main");
    const footer = screen.getByRole("contentinfo");
    expect(within(main).getByRole("heading", { level: 1 })).toBeVisible();
    expect(
      main.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(footer).toHaveTextContent("Verificação por");
    expect(within(footer).getByRole("img", { name: "Kybr" })).toBeVisible();
  });

  it("the footer is not a link and holds nothing focusable", () => {
    render(<LinkColumn>x</LinkColumn>);

    const footer = screen.getByRole("contentinfo");
    expect(within(footer).queryByRole("link")).toBeNull();
    expect(footer.querySelector("[tabindex], a, button")).toBeNull();
  });
});
