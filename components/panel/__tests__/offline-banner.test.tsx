import { act, render, screen } from "@testing-library/react";
import { useState, type JSX } from "react";
import { describe, expect, it, vi } from "vitest";

import { OfflineBanner } from "@/components/panel/offline-banner";
import { ToastProvider } from "@/components/panel/toast";

// 13:05 UTC = 10:05 in Brasília.
const RENDERED = Date.parse("2026-10-06T13:05:00.000Z");

function Harness({ onReconnect }: { onReconnect: () => void }): JSX.Element {
  const [online, setOnline] = useState(true);
  return (
    <ToastProvider closeLabel="Fechar">
      <button type="button" onClick={() => setOnline((v) => !v)}>
        toggle
      </button>
      <OfflineBanner
        online={online}
        renderedAt={RENDERED}
        onReconnect={onReconnect}
      />
    </ToastProvider>
  );
}

describe("OfflineBanner (promoted from the Fila, T125)", () => {
  it("a status region from first paint; offline.panel with the render's time while offline", () => {
    const onReconnect = vi.fn();
    const { container } = render(<Harness onReconnect={onReconnect} />);
    const region = container.querySelector("[data-offline-banner]");
    expect(region).toHaveAttribute("role", "status");
    expect(region).toBeEmptyDOMElement();

    act(() => screen.getByText("toggle").click());
    expect(
      screen.getByText("Sem conexão. Mostrando os dados de 10:05."),
    ).toBeInTheDocument();
    expect(container.querySelector("[data-offline-banner]")).toBe(region);
    expect(onReconnect).not.toHaveBeenCalled();
  });

  it("back online: onReconnect once and offline.back", () => {
    const onReconnect = vi.fn();
    render(<Harness onReconnect={onReconnect} />);
    act(() => screen.getByText("toggle").click());
    act(() => screen.getByText("toggle").click());
    expect(onReconnect).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText("Conexão de volta. Dados atualizados."),
    ).toBeInTheDocument();
  });

  it("never online → offline: no reconnect at mount", () => {
    const onReconnect = vi.fn();
    render(<Harness onReconnect={onReconnect} />);
    expect(onReconnect).not.toHaveBeenCalled();
  });
});
