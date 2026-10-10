import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { act, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, type JSX } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/panel/toast";
import { CaseActions } from "@/features/panel-fila/components/case-actions";
import { CaseListbox } from "@/features/panel-fila/components/case-listbox";
import {
  FilaProvider,
  useFila,
} from "@/features/panel-fila/components/fila-provider";
import { FilaSoftLink } from "@/features/panel-fila/components/fila-soft-link";
import { FILA_TAB_ACTIVE_ID } from "@/features/panel-fila/components/fila-tabs";
import { NewCasesNotice } from "@/features/panel-fila/components/new-cases-notice";
import { FilaOfflineBanner } from "@/features/panel-fila/components/offline-banner";
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

// 13:05 UTC = 10:05 in Brasília.
const RENDERED = Date.parse("2026-10-06T13:05:00.000Z");
const OFFLINE_ACTIONS = "As decisões voltam quando a internet voltar.";

let online: boolean;
beforeEach(() => {
  vi.clearAllMocks();
  online = true;
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => online,
  });
  window.history.replaceState(null, "", "/fila/caso-a?ate=25");
  window.matchMedia = vi.fn((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => vi.useRealTimers());

function setOnline(next: boolean): void {
  online = next;
  act(() => {
    window.dispatchEvent(new Event(next ? "online" : "offline"));
  });
}

/** A decision's NETWORK result (T106's hint), or a poll that got through. */
let fila: ReturnType<typeof useFila> | undefined;
function Probe(): null {
  const value = useFila();
  useEffect(() => {
    fila = value;
  });
  return null;
}

function Screen({
  renderedAt = RENDERED,
}: {
  renderedAt?: number;
}): JSX.Element {
  return (
    <ShellStatusProvider initial={{ contagens: undefined, plano: undefined }}>
      <ToastProvider closeLabel="Fechar">
        <FilaProvider renderedAt={renderedAt}>
          <Probe />
          <FilaOfflineBanner />
          <nav>
            <FilaSoftLink href="/fila?aba=aguardando" className="x">
              Aguardando vendedor
            </FilaSoftLink>
          </nav>
          <span id={FILA_TAB_ACTIVE_ID}>Para decidir</span>
          <NewCasesNotice aba="aberto" />
          <CaseListbox
            aba="aberto"
            options={["caso-a", "caso-b"].map((id) => ({
              id,
              content: <span>{id}</span>,
            }))}
            query="?ate=25"
            selectedId="caso-a"
          />
          <CaseActions
            caseId="caso-a"
            origem="link"
            razao="Empresa A"
            webhook
            request={{ tipos: ["CARTAO_CNPJ"], vendedorTemEmail: true }}
          />
        </FilaProvider>
      </ToastProvider>
    </ShellStatusProvider>
  );
}

const banner = () => screen.queryByText(/^Sem conexão\./);
const decisions = () =>
  ["Aprovar", "Pedir documento", "Bloquear"].map((name) =>
    screen.getByRole("button", { name }),
  );

describe("offline (T111; AC 44; D8; ADR-0011 rule 8; F14)", () => {
  it("online: no banner, everything enabled; the banner's status region is mounted, empty (P6-004)", () => {
    const { container } = render(<Screen />);
    expect(banner()).toBeNull();
    const region = container.querySelector("[data-offline-banner]");
    expect(region).toHaveAttribute("role", "status");
    expect(region).toHaveTextContent("");
    setOnline(false);
    // The same node: only its content switches, so going offline is announced.
    expect(container.querySelector("[data-offline-banner]")).toBe(region);
    expect(region).toHaveTextContent(/^Sem conexão\./);
    setOnline(true);
    for (const button of decisions()) expect(button).toBeEnabled();
    expect(screen.getByRole("listbox")).not.toHaveAttribute("aria-disabled");
  });

  it("offline: offline.panel with the last render's hh:mm (Brasília); decisions disabled and described by offline.actions; list and tabs aria-disabled and inert", () => {
    render(<Screen />);
    setOnline(false);
    expect(banner()).toHaveTextContent(
      "Sem conexão. Mostrando os dados de 10:05.",
    );
    // AC 76 (T115): the time in tabular figures.
    expect(banner()).toHaveClass("tabular-nums");
    for (const button of decisions()) {
      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleDescription(OFFLINE_ACTIONS);
    }
    expect(screen.getByText(OFFLINE_ACTIONS)).toBeVisible();
    expect(screen.getByRole("listbox")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    fireEvent.click(screen.getByRole("option", { name: "caso-b" }));
    const tab = screen.getByRole("link", { name: "Aguardando vendedor" });
    expect(tab).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(tab);
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("Mostrar is disabled offline", () => {
    render(<Screen />);
    act(() => fila?.reportNovos(1, 0));
    setOnline(false);
    expect(screen.getByRole("button", { name: "Mostrar" })).toBeDisabled();
  });

  it("reconnect: one refresh, offline.back (polite), the banner clears; nothing is retried", () => {
    render(<Screen />);
    setOnline(false);
    setOnline(true);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText("Conexão de volta. Dados atualizados."),
    ).toBeInTheDocument();
    expect(banner()).toBeNull();
    for (const button of decisions()) expect(button).toBeEnabled();
  });

  it("D8: a re-read asked for while offline doesn't refresh (a failed RSC fetch would load the browser's offline page); the reconnect re-reads once", () => {
    render(<Screen />);
    setOnline(false);
    act(() => fila?.reread());
    expect(router.refresh).not.toHaveBeenCalled();
    setOnline(true);
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("a NETWORK result while navigator.onLine is true: offline until the next successful poll", () => {
    render(<Screen />);
    act(() => fila?.hintOffline());
    expect(banner()).not.toBeNull();
    expect(decisions()[0]).toBeDisabled();
    act(() => fila?.reachable());
    expect(banner()).toBeNull();
    expect(decisions()[0]).toBeEnabled();
  });

  it("F14: no Fila code touches localStorage, sessionStorage or IndexedDB", () => {
    const root = join(process.cwd(), "features/panel-fila");
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (name !== "__tests__") walk(path);
        } else if (/\.tsx?$/.test(name)) files.push(path);
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThan(10);
    for (const file of files)
      expect(readFileSync(file, "utf8")).not.toMatch(
        /localStorage|sessionStorage|indexedDB|serviceWorker/,
      );
  });
});
