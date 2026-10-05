import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { LoadError } from "@/features/panel-shell/components/load-error";

describe("LoadError (error.load.*)", () => {
  it("says what failed, takes focus, and retries with a refresh + reset", () => {
    const reset = vi.fn();
    render(<LoadError reset={reset} />);

    expect(screen.getByRole("heading", { name: "Não carregou" })).toHaveFocus();
    expect(document.title).toBe("Não carregou");
    expect(
      screen.getByText("Confira sua conexão e tente de novo."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(router.refresh).toHaveBeenCalledOnce();
    expect(reset).toHaveBeenCalledOnce();
  });
});
