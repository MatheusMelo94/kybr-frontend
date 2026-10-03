import { act, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useState, type JSX } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CaseViewTransition,
  useAnnounceViewChange,
} from "@/features/seller-link/components/case/case-view-transition";

function View({ title }: { title: string }): JSX.Element {
  return (
    <div>
      <h1 tabIndex={-1}>{title}</h1>
      <button type="button">ação</button>
    </div>
  );
}

/** Stands in for CaseLiveStatus: swaps to analysis on the client and reports it. */
function ClientSwitch(): JSX.Element {
  const announceViewChange = useAnnounceViewChange();
  const [timedOut, setTimedOut] = useState(false);
  if (timedOut) return <View title="Sua empresa está em análise" />;
  return (
    <button
      type="button"
      onClick={() => {
        setTimedOut(true);
        announceViewChange("analysis-timeout", "Sua empresa está em análise");
      }}
    >
      dez segundos
    </button>
  );
}

function region(): HTMLElement {
  return screen.getByRole("status");
}

/** Lets the one-frame delay pass. */
function nextFrame(): void {
  act(() => {
    vi.advanceTimersByTime(20);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "setTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CaseViewTransition", () => {
  it("focuses the view's h1 on mount (arriving from the form, or a reload)", () => {
    render(
      <CaseViewTransition viewKey="verifying" announcement="Consultando…">
        <View title="Verificando sua empresa" />
      </CaseViewTransition>,
    );

    expect(
      screen.getByRole("heading", { name: "Verificando sua empresa" }),
    ).toHaveFocus();
  });

  it("fills the polite region one frame after mount, never during the initial render", () => {
    const html = renderToString(
      <CaseViewTransition viewKey="verifying" announcement="Consultando…">
        <View title="Verificando sua empresa" />
      </CaseViewTransition>,
    );
    expect(html).not.toContain("Consultando…");

    render(
      <CaseViewTransition viewKey="verifying" announcement="Consultando…">
        <View title="Verificando sua empresa" />
      </CaseViewTransition>,
    );
    expect(region()).toHaveAttribute("aria-live", "polite");
    expect(region()).toHaveTextContent("");

    nextFrame();
    expect(region()).toHaveTextContent("Consultando…");
  });

  it("AC 16: a new viewKey from the server moves focus to the new h1 and announces it", () => {
    const { rerender } = render(
      <CaseViewTransition viewKey="verifying" announcement="Consultando…">
        <View title="Verificando sua empresa" />
      </CaseViewTransition>,
    );
    nextFrame();
    screen.getByRole("button", { name: "ação" }).focus();

    rerender(
      <CaseViewTransition viewKey="approved" announcement="Tudo certo, Maria.">
        <View title="Tudo certo, Maria." />
      </CaseViewTransition>,
    );
    nextFrame();

    expect(
      screen.getByRole("heading", { name: "Tudo certo, Maria." }),
    ).toHaveFocus();
    expect(region()).toHaveTextContent("Tudo certo, Maria.");
  });

  it("the same viewKey doesn't re-focus (a refresh with nothing new)", () => {
    const { rerender } = render(
      <CaseViewTransition viewKey="pending" announcement="Quase lá">
        <View title="Quase lá" />
      </CaseViewTransition>,
    );
    nextFrame();
    const action = screen.getByRole("button", { name: "ação" });
    action.focus();

    rerender(
      <CaseViewTransition viewKey="pending" announcement="Quase lá">
        <View title="Quase lá" />
      </CaseViewTransition>,
    );
    nextFrame();

    expect(action).toHaveFocus();
  });

  it("the client switch announces em análise and focuses its h1; the server catching up with that key restores focus to the new h1 without announcing again", () => {
    const { rerender } = render(
      <CaseViewTransition viewKey="verifying" announcement="Consultando…">
        <ClientSwitch />
      </CaseViewTransition>,
    );
    nextFrame();

    fireEvent.click(screen.getByRole("button", { name: "dez segundos" }));
    nextFrame();

    expect(
      screen.getByRole("heading", { name: "Sua empresa está em análise" }),
    ).toHaveFocus();
    expect(region()).toHaveTextContent("Sua empresa está em análise");

    // The server's em análise replaces the client's node (keyed remount), so
    // the focused element is gone: focus goes back to the h1, silently.
    screen.getByRole("button", { name: "ação" }).focus();
    rerender(
      <CaseViewTransition
        viewKey="analysis-timeout"
        announcement="Outra frase que não deve ser anunciada"
      >
        <View title="Sua empresa está em análise" />
      </CaseViewTransition>,
    );
    nextFrame();

    expect(
      screen.getByRole("heading", { name: "Sua empresa está em análise" }),
    ).toHaveFocus();
    expect(region()).toHaveTextContent("Sua empresa está em análise");
  });

  it("remounts the view's islands on every server view change, and only then (tech-design § 2, § 3 rule 11)", () => {
    const mounts = vi.fn();
    function Island(): JSX.Element {
      useEffect(() => {
        mounts();
      }, []);
      return <h1 tabIndex={-1}>ilha</h1>;
    }
    const { rerender } = render(
      <CaseViewTransition viewKey="verifying" announcement="Consultando…">
        <Island />
      </CaseViewTransition>,
    );

    rerender(
      <CaseViewTransition viewKey="verifying" announcement="Consultando…">
        <Island />
      </CaseViewTransition>,
    );
    expect(mounts).toHaveBeenCalledTimes(1);

    rerender(
      <CaseViewTransition
        viewKey="analysis-timeout"
        announcement="Sua empresa está em análise"
      >
        <Island />
      </CaseViewTransition>,
    );
    expect(mounts).toHaveBeenCalledTimes(2);
  });

  it("keeps the region mounted across view changes, so screen readers hear each change", () => {
    const { rerender } = render(
      <CaseViewTransition viewKey="verifying" announcement="Consultando…">
        <View title="Verificando sua empresa" />
      </CaseViewTransition>,
    );
    const before = region();

    rerender(
      <CaseViewTransition
        viewKey="blocked"
        announcement="Não conseguimos aprovar seu cadastro"
      >
        <View title="Não conseguimos aprovar seu cadastro" />
      </CaseViewTransition>,
    );

    expect(region()).toBe(before);
  });
});
