import { act, render, screen } from "@testing-library/react";
import type { JSX } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/panel/toast";
import { CaseActions } from "@/features/panel-fila/components/case-actions";
import { FilaProvider } from "@/features/panel-fila/components/fila-provider";
import { ShellStatusProvider } from "@/features/panel-shell/shell-status-context";

vi.mock("@/features/panel-fila/actions", () => ({
  decideAction: vi.fn(),
  requestDocumentsAction: vi.fn(),
}));
vi.mock("@/features/panel-fila/poll-action", () => ({
  pollNewCasesAction: vi.fn(),
}));
const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

// T112 (AC 43; spec § Responsive Behavior; QA A34-07, OF-08, RF-02, Q18):
// below lg the decisions are a sticky bottom bar; the alert and the
// offline line sit above it, outside it; a bar taller than a third of the
// viewport (200 % text) stops being sticky.

let lg: boolean;
let barHeight: number;
beforeEach(() => {
  lg = false;
  barHeight = 120;
  window.innerHeight = 780;
  window.matchMedia = vi.fn((query: string) => ({
    matches: lg && query.includes("min-width"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
    function (this: HTMLElement) {
      return this.hasAttribute("data-case-actions") ? barHeight : 0;
    },
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.style.scrollPaddingBottom = "";
});

function Actions({
  request = true,
  proof = false,
}: {
  request?: boolean;
  proof?: boolean;
}): JSX.Element {
  return (
    <ShellStatusProvider initial={{ contagens: undefined, plano: undefined }}>
      <ToastProvider closeLabel="Fechar">
        <FilaProvider renderedAt={1}>
          <CaseActions
            caseId="caso-a"
            origem="link"
            razao="Empresa A"
            webhook
            proof={proof}
            request={
              request
                ? { tipos: ["CARTAO_CNPJ"], vendedorTemEmail: true }
                : undefined
            }
          />
        </FilaProvider>
      </ToastProvider>
    </ShellStatusProvider>
  );
}

const bar = () => document.querySelector<HTMLElement>("[data-case-actions]");

describe("the action bar (T112)", () => {
  it("holds the decisions in order: the primary full width, then Pedir documento | Bloquear", () => {
    render(<Actions />);
    const buttons = Array.from(
      bar()?.querySelectorAll(":scope > button") ?? [],
    );
    expect(buttons.map((b) => b.textContent)).toEqual([
      "Aprovar",
      "Pedir documento",
      "Bloquear",
    ]);
    expect(bar()).toHaveClass("max-lg:grid-cols-2");
    expect(buttons[0]).toHaveClass("max-lg:col-span-2");
  });

  it("without Pedir documento, Bloquear takes the whole row", () => {
    render(<Actions request={false} />);
    expect(bar()).not.toHaveClass("max-lg:grid-cols-2");
  });

  it("below lg it sticks to the bottom with the safe-area inset", () => {
    render(<Actions />);
    expect(bar()).toHaveAttribute("data-sticky", "true");
    expect(bar()).toHaveClass("max-lg:sticky", "max-lg:bottom-0");
    expect(bar()?.className).toContain("env(safe-area-inset-bottom)");
  });

  it("the offline line sits above the bar, outside it (OF-08)", () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => false,
    });
    render(<Actions />);
    const line = screen.getByText(
      "As decisões voltam quando a internet voltar.",
    );
    expect(bar()?.contains(line)).toBe(false);
    expect(
      line.compareDocumentPosition(bar() as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => true,
    });
  });

  it("Q18: taller than a third of the viewport, it stops being sticky and sits at the end", () => {
    barHeight = 261; // > 780 / 3
    render(<Actions />);
    expect(bar()).toHaveAttribute("data-sticky", "false");
    expect(bar()).not.toHaveClass("max-lg:sticky");
  });

  it("Q18 re-measures on resize", () => {
    render(<Actions />);
    expect(bar()).toHaveAttribute("data-sticky", "true");
    barHeight = 300;
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(bar()).toHaveAttribute("data-sticky", "false");
  });

  it("while sticky, the page's scroll padding keeps a focused control clear of the bar; removed on unmount", () => {
    const { unmount } = render(<Actions />);
    expect(document.documentElement.style.scrollPaddingBottom).toBe("120px");
    unmount();
    expect(document.documentElement.style.scrollPaddingBottom).toBe("");
  });

  it("at lg there is no scroll padding (the bar isn't sticky there)", () => {
    lg = true;
    render(<Actions />);
    expect(document.documentElement.style.scrollPaddingBottom).toBe("");
  });

  it("T115 (spec J4 tab order): at lg Baixar comprovante is the last action, after Bloquear; below lg it stays in the body", () => {
    render(<Actions proof />);
    const buttons = Array.from(bar()?.querySelectorAll("button") ?? []).filter(
      (button) => button.closest("dialog") === null,
    );
    expect(buttons.map((b) => b.textContent)).toEqual([
      "Aprovar",
      "Pedir documento",
      "Bloquear",
      "Baixar comprovante",
    ]);
    expect(buttons[3]?.parentElement).toHaveClass("max-lg:hidden");
  });

  it("no proof (DADOS_NAO_ENCONTRADOS, D7): no Baixar comprovante among the actions", () => {
    render(<Actions />);
    expect(
      screen.queryByRole("button", { name: "Baixar comprovante" }),
    ).toBeNull();
  });
});
