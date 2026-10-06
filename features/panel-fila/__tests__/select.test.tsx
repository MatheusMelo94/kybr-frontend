import { act, fireEvent, render, screen } from "@testing-library/react";
import type { JSX } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AutoSelectOldest } from "@/features/panel-fila/components/auto-select-oldest";
import { CaseListbox } from "@/features/panel-fila/components/case-listbox";
import { DetailPane } from "@/features/panel-fila/components/detail-pane";
import { FilaProvider } from "@/features/panel-fila/components/fila-provider";
import { FILA_TAB_ACTIVE_ID } from "@/features/panel-fila/components/fila-tabs";

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

let wide = true;
const scrollTo = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  wide = true;
  Element.prototype.scrollIntoView = vi.fn();
  window.matchMedia = vi.fn((query: string) => ({
    matches: query === "(min-width: 64rem)" ? wide : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
});

afterEach(() => {
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
});

const OPTIONS = ["caso-a", "caso-b", "caso-c"].map((id) => ({
  id,
  content: <span>{id}</span>,
}));

function Detail({ caseId }: { caseId: string | null }): JSX.Element {
  return (
    <DetailPane caseId={caseId}>
      <h2 data-detail-heading tabIndex={-1}>
        Caso {caseId ?? "nenhum"}
      </h2>
    </DetailPane>
  );
}

function Screen({
  caseId,
  list = true,
}: {
  caseId: string | null;
  list?: boolean;
}): JSX.Element {
  return (
    <FilaProvider renderedAt={1}>
      <span id={FILA_TAB_ACTIVE_ID}>Para decidir (3)</span>
      {list && (
        <CaseListbox
          aba="aberto"
          options={OPTIONS}
          query="?ate=50"
          selectedId={caseId}
        />
      )}
      <Detail caseId={caseId} />
    </FilaProvider>
  );
}

describe("opening a case (AC 27, AC 45)", () => {
  it("Enter on the third option → /fila/{third} with aba/ate kept; the detail shows the skeleton meanwhile, the list stays", () => {
    const { rerender } = render(<Screen caseId="caso-a" />);
    const listbox = screen.getByRole("listbox", { name: "Para decidir (3)" });
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    fireEvent.keyDown(listbox, { key: "Enter" });
    expect(router.push).toHaveBeenCalledWith("/fila/caso-c?ate=50", {
      scroll: false,
    });
    expect(screen.getByTestId("fila-detail-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("Caso caso-a")).toBeNull();
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    rerender(<Screen caseId="caso-c" />);
    expect(screen.queryByTestId("fila-detail-skeleton")).toBeNull();
    expect(screen.getByRole("heading", { name: "Caso caso-c" })).toHaveFocus();
  });

  it("a click opens the case too; below lg the page scrolls to the top", () => {
    wide = false;
    render(<Screen caseId="caso-a" />);
    fireEvent.click(screen.getByText("caso-b"));
    expect(router.push).toHaveBeenCalledWith("/fila/caso-b?ate=50", {
      scroll: true,
    });
  });

  it("a deep link moves no focus", () => {
    render(<Screen caseId="caso-b" />);
    expect(
      screen.getByRole("heading", { name: "Caso caso-b" }),
    ).not.toHaveFocus();
    expect(screen.getByRole("option", { name: "caso-b" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("opening the case already open only moves focus to its heading", () => {
    render(<Screen caseId="caso-a" />);
    fireEvent.click(screen.getByText("caso-a"));
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.queryByTestId("fila-detail-skeleton")).toBeNull();
    expect(screen.getByRole("heading", { name: "Caso caso-a" })).toHaveFocus();
  });

  it("at lg the list scrolls inside itself, and its position comes back once when the list remounts", () => {
    const { rerender } = render(<Screen caseId="caso-a" />);
    const scroller = (): HTMLElement => {
      const element = document.querySelector<HTMLElement>(
        "[data-fila-list-scroller]",
      );
      if (!element) throw new Error("no scroller");
      return element;
    };
    expect(scroller()).toHaveClass("lg:overflow-y-auto");
    scroller().scrollTop = 1460;
    fireEvent.click(screen.getByText("caso-c"));
    rerender(<Screen caseId="caso-c" list={false} />);
    rerender(<Screen caseId="caso-c" />);
    expect(scroller().scrollTop).toBe(1460);
    // Only once: a later remount (a tab switch) starts at the top.
    rerender(<Screen caseId="caso-c" list={false} />);
    rerender(<Screen caseId="caso-c" />);
    expect(scroller().scrollTop).toBe(0);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("below lg the page scrolls: its position comes back when /fila's list remounts", () => {
    wide = false;
    const { rerender } = render(<Screen caseId={null} />);
    Object.defineProperty(window, "scrollY", {
      value: 900,
      configurable: true,
    });
    fireEvent.click(screen.getByText("caso-b"));
    // /fila/{id} below lg: the list is hidden, the position is kept.
    rerender(<Screen caseId="caso-b" list={false} />);
    rerender(<Screen caseId="caso-b" />);
    expect(scrollTo).not.toHaveBeenCalled();
    // Back on /fila.
    rerender(<Screen caseId={null} list={false} />);
    rerender(<Screen caseId={null} />);
    expect(scrollTo).toHaveBeenCalledWith(0, 900);
  });
});

describe("AutoSelectOldest (D4)", () => {
  it("at lg: replaces /fila with /fila/{oldest}, keeping the query", () => {
    render(
      <FilaProvider renderedAt={1}>
        <AutoSelectOldest oldestId="caso-a" query="?aba=aguardando" />
      </FilaProvider>,
    );
    expect(router.replace).toHaveBeenCalledWith("/fila/caso-a?aba=aguardando", {
      scroll: false,
    });
  });

  it("below lg: no navigation", () => {
    wide = false;
    render(
      <FilaProvider renderedAt={1}>
        <AutoSelectOldest oldestId="caso-a" query="" />
      </FilaProvider>,
    );
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("navigates once, even if it renders again", () => {
    const { rerender } = render(
      <FilaProvider renderedAt={1}>
        <AutoSelectOldest oldestId="caso-a" query="" />
      </FilaProvider>,
    );
    act(() =>
      rerender(
        <FilaProvider renderedAt={1}>
          <AutoSelectOldest oldestId="caso-a" query="" />
        </FilaProvider>,
      ),
    );
    expect(router.replace).toHaveBeenCalledTimes(1);
  });
});
