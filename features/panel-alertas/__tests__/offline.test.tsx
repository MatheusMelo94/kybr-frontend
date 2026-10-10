import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { act, render, screen } from "@testing-library/react";
import type { JSX } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/panel/toast";
import { AlertList } from "@/features/panel-alertas/components/alert-list";
import { MonOffline } from "@/features/panel-alertas/components/mon-offline";
import type { Alert } from "@/lib/api/schemas/panel/alerts";
import {
  MON_OFFLINE_ACTIONS_ID,
  OfflineAwareLink,
} from "@/features/panel-alertas/components/offline-aware-link";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const RENDERED = Date.parse("2026-10-06T13:05:00.000Z");
const ACTIONS = "As decisões voltam quando a internet voltar.";

let online: boolean;
beforeEach(() => {
  vi.clearAllMocks();
  online = true;
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => online,
  });
  window.history.replaceState(null, "", "/monitoramento");
});
afterEach(() => vi.useRealTimers());

function setOnline(next: boolean): void {
  online = next;
  act(() => {
    window.dispatchEvent(new Event(next ? "online" : "offline"));
  });
}

function Screen({
  renderedAt = RENDERED,
}: {
  renderedAt?: number;
}): JSX.Element {
  return (
    <ToastProvider closeLabel="Fechar">
      <MonOffline renderedAt={renderedAt} />
      <OfflineAwareLink href="/fila/caso-a" note className="x">
        Decidir
      </OfflineAwareLink>
      <OfflineAwareLink href="/fila/caso-b" className="x">
        Decidir
      </OfflineAwareLink>
    </ToastProvider>
  );
}

describe("OfflineAwareLink (G6, AC 51, Q5)", () => {
  it("online: plain links, no note, no description", () => {
    render(<Screen />);
    for (const link of screen.getAllByRole("link", { name: "Decidir" })) {
      expect(link).not.toHaveAttribute("aria-disabled");
      expect(link).not.toHaveAttribute("aria-describedby");
    }
    expect(screen.queryByText(ACTIONS)).toBeNull();
  });

  it("offline: every link aria-disabled, described by the one offline.actions beside the first; a click goes nowhere", () => {
    render(<Screen />);
    setOnline(false);
    const links = screen.getAllByRole("link", { name: "Decidir" });
    const notes = screen.getAllByText(ACTIONS);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toHaveAttribute("id", MON_OFFLINE_ACTIONS_ID);
    for (const link of links) {
      expect(link).toHaveAttribute("aria-disabled", "true");
      expect(link).toHaveAttribute("aria-describedby", MON_OFFLINE_ACTIONS_ID);
      const click = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      });
      link.dispatchEvent(click);
      expect(click.defaultPrevented).toBe(true);
    }
  });
});

describe("MonOffline: the reconnect re-read (AC 51)", () => {
  it("offline.panel while offline; back online → one refresh and offline.back", () => {
    render(<Screen />);
    setOnline(false);
    expect(
      screen.getByText("Sem conexão. Mostrando os dados de 10:05."),
    ).toBeInTheDocument();
    setOnline(true);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText("Conexão de volta. Dados atualizados."),
    ).toBeInTheDocument();
  });

  it("a new server render ends the re-read loop", () => {
    vi.useFakeTimers();
    const { rerender } = render(<Screen />);
    setOnline(false);
    setOnline(true);
    rerender(<Screen renderedAt={RENDERED + 60_000} />);
    act(() => vi.advanceTimersByTime(10_000));
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("the guard: a navigation away while reconnecting stops the refreshes", () => {
    vi.useFakeTimers();
    render(<Screen />);
    setOnline(false);
    setOnline(true);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    window.history.replaceState(null, "", "/fila");
    act(() => vi.advanceTimersByTime(10_000));
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });
});

describe("the list offline (G6, Q5)", () => {
  const open = (id: string): Alert =>
    ({
      id,
      tipo: "SITUACAO_IRREGULAR",
      severidade: "critico",
      seller: {
        id: "s".repeat(16),
        razao_social: "Empresa Exemplo Ltda",
        cnpj: "12.ABC.345/01DE-35",
      },
      dados: { situacao: "inapta" },
      detectado_em: "2026-10-06T12:00:00Z",
      case_id: `${id}-caso`,
    }) as Alert;

  it("one offline.actions, beside the first Decidir; both described by it", () => {
    render(
      <AlertList
        alerts={[open("a".repeat(16)), open("b".repeat(16))]}
        now={new Date(RENDERED)}
      />,
    );
    setOnline(false);
    const [first, second] = screen.getAllByRole("link", { name: "Decidir" });
    expect(screen.getAllByText(ACTIONS)).toHaveLength(1);
    expect(first?.nextElementSibling).toHaveTextContent(ACTIONS);
    expect(second).toHaveAttribute("aria-describedby", MON_OFFLINE_ACTIONS_ID);
  });

  it("F14: no Monitoramento code touches browser storage", () => {
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (name !== "__tests__") walk(path);
        } else if (/\.tsx?$/.test(name)) files.push(path);
      }
    };
    walk(join(process.cwd(), "features/panel-alertas"));
    expect(files.length).toBeGreaterThan(5);
    for (const file of files)
      expect(readFileSync(file, "utf8")).not.toMatch(
        /localStorage|sessionStorage|indexedDB|serviceWorker/,
      );
  });
});
