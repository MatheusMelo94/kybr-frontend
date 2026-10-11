import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/navigation/soft-navigate", () => ({
  useSoftNavigate: () => navigate,
}));

import { SearchForm } from "@/features/panel-sellers/components/search-form";
import { StatusFilter } from "@/features/panel-sellers/components/status-filter";

// T140 (plan-m8 D5, G8): the search submits with Enter and soft-navigates;
// the filter resets the page. Both keep the other's value.

beforeEach(() => navigate.mockClear());

describe("SearchForm", () => {
  it("is a search landmark with a labelled type=search input (≤ 100, enterkeyhint=search)", () => {
    render(<SearchForm search={{ pagina: 1 }} />);
    expect(screen.getByRole("search")).toBeInTheDocument();
    const input = screen.getByRole("searchbox", {
      name: "Buscar por nome ou CNPJ",
    });
    expect(input).toHaveAttribute("maxlength", "100");
    expect(input).toHaveAttribute("enterkeyhint", "search");
  });

  it("submitting (Enter) navigates with q and the status, back to page 1", async () => {
    render(<SearchForm search={{ pagina: 3, status: "mudou" }} />);
    const input = screen.getByRole("searchbox");
    await userEvent.type(input, "12.345.678");
    fireEvent.submit(input);
    expect(navigate).toHaveBeenCalledWith(
      "/vendedores?status=mudou&q=12.345.678",
    );
  });

  it("an emptied search drops q", () => {
    render(<SearchForm search={{ pagina: 1, q: "exemplo" }} />);
    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "  " } });
    fireEvent.submit(input);
    expect(navigate).toHaveBeenCalledWith("/vendedores");
  });
});

describe("StatusFilter", () => {
  it("offers Todos and the four statuses", () => {
    render(<StatusFilter search={{ pagina: 1 }} />);
    const select = screen.getByRole("combobox", { name: "Status" });
    expect(
      Array.from((select as HTMLSelectElement).options).map(
        (option) => option.textContent,
      ),
    ).toEqual([
      "Todos",
      "Aprovado",
      "Em revisão",
      "Bloqueado",
      "Mudou desde a aprovação",
    ]);
  });

  it("a change keeps q and resets the page", () => {
    render(<StatusFilter search={{ pagina: 2, q: "exemplo" }} />);
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "bloqueado" },
    });
    expect(navigate).toHaveBeenCalledWith(
      "/vendedores?status=bloqueado&q=exemplo",
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "" } });
    expect(navigate).toHaveBeenLastCalledWith("/vendedores?q=exemplo");
  });
});
