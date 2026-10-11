import { render, screen, within } from "@testing-library/react";
import type { JSX } from "react";
import { describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/panel/toast";
import { HomeView } from "@/features/panel-home/components/home-view";
import type { Dashboard } from "@/lib/api/schemas/panel/home";
import type { Me } from "@/lib/api/schemas/panel/me";

// T132 (AC 53 greeting half, AC 54): Início's states from one D-H1 read.

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }),
  usePathname: () => "/",
}));

const NOW = new Date("2026-10-10T13:00:00Z"); // 10:00 in São Paulo

const ME: Me = {
  nome: "Renata Exemplo",
  email: "renata@exemplo.test",
  workspace: {
    nome: "Loja Exemplo",
    slug: "loja-exemplo",
    link_url: "https://kybr.com.br/v/loja-exemplo",
    contato_vendedor: { tipo: "email", valor: "ajuda@exemplo.test" },
    categoria: "x",
    onboarding_concluido: true,
    webhook_configurado: false,
    contagens: {
      fila_abertos: 2,
      fila_vencidos: 0,
      alertas_criticos_abertos: 1,
      vendedores: 10,
      lote_em_andamento: false,
    },
  },
};

const CASE = {
  id: "case_000000000001",
  razao_social: "Fulano ***.***.***-** ME",
  cnpj: "12.345.678/0001-95",
  veredito: "revisar" as const,
  status: "warn" as const,
  motivos: [],
  origem: "link" as const,
  sla_ate: "2026-10-11T10:00:00-03:00",
  vencido: false,
  criado_em: "2026-10-09T10:00:00-03:00",
};

const ALERT = {
  id: "alert_00000000001",
  tipo: "QSA_MUDOU" as const,
  severidade: "atencao" as const,
  seller: {
    id: "seller_0000000001",
    razao_social: "Loja Alterada Ltda",
    cnpj: "12.345.678/0001-95",
  },
  detectado_em: "2026-10-10T06:00:00-03:00",
  dados: {},
};

const WEEK = Array.from({ length: 7 }, (_, i) => ({
  dia: `2026-10-0${i + 1}`,
  total: i,
}));

const FULL: Dashboard = {
  kpis: { verificados: 1240, auto: 1102, revisao: 96, bloqueados: 42 },
  fila: [CASE],
  alertas: [ALERT],
  primeiros_passos: { lote: true, link: true, monitor: true, oculto: false },
};

function view(dashboard: Dashboard, me: Me = ME): JSX.Element {
  return (
    <ToastProvider closeLabel="Fechar">
      <HomeView me={me} dashboard={dashboard} now={NOW} />
    </ToastProvider>
  );
}

const card = (name: string) => screen.getByRole("region", { name });

describe("HomeView", () => {
  it("greets by the São Paulo hour and summarizes the /me counts", () => {
    render(view(FULL));
    expect(
      screen.getByRole("heading", { level: 1, name: "Bom dia, Renata." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "2 vendedores esperando decisão e 1 alerta crítico novo.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the two header actions", () => {
    render(view(FULL));
    expect(
      screen.getByRole("button", { name: "Copiar link de cadastro" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Verificar em lote" }),
    ).toHaveAttribute("href", "/lote");
  });

  it("success: KPIs with tabular figures, the queue linking each case, the feed with the M7 sentences", () => {
    render(view(FULL));
    expect(screen.getByText("1.240")).toBeInTheDocument();
    expect(screen.getByText("vendedores verificados")).toBeInTheDocument();
    const queue = card("Precisa da sua atenção");
    expect(
      within(queue).getByRole("link", { name: /Fulano \*\*\*/ }),
    ).toHaveAttribute("href", "/fila/case_000000000001");
    expect(
      within(queue).getByRole("link", { name: "Abrir fila" }),
    ).toHaveAttribute("href", "/fila");
    const feed = card("Mudanças na base");
    expect(
      within(feed).getByText("Loja Alterada Ltda mudou o quadro de sócios."),
    ).toBeInTheDocument();
    expect(
      within(feed).getByRole("link", { name: "Ver monitoramento" }),
    ).toHaveAttribute("href", "/monitoramento");
  });

  it("G10: KPIs at 0 show as 0 outside the new-workspace state; empty cards say so", () => {
    render(
      view({
        kpis: { verificados: 3, auto: 3, revisao: 0, bloqueados: 0 },
        fila: [],
        alertas: [],
      }),
    );
    expect(screen.getAllByText("0")).toHaveLength(2);
    expect(
      within(card("Precisa da sua atenção")).getByText(
        "Nada esperando decisão.",
      ),
    ).toBeInTheDocument();
    expect(
      within(card("Mudanças na base")).getByText(
        "Nenhuma mudança na última varredura.",
      ),
    ).toBeInTheDocument();
  });

  it("new workspace: home.summary.none; no KPIs, queue or feed", () => {
    render(
      view({
        kpis: { verificados: 0, auto: 0, revisao: 0, bloqueados: 0 },
        fila: [],
        alertas: [],
      }),
    );
    expect(
      screen.getByText("Comece verificando a base que você já tem."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("vendedores verificados"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Precisa da sua atenção" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Mudanças na base" }),
    ).not.toBeInTheDocument();
  });

  it("T134: Semana follows the queue and feed; a new workspace has none", () => {
    const { unmount } = render(view({ ...FULL, semana: WEEK }));
    expect(within(card("Semana")).getAllByRole("row")).toHaveLength(7);
    unmount();
    render(
      view({
        kpis: { verificados: 0, auto: 0, revisao: 0, bloqueados: 0 },
        semana: WEEK,
      }),
    );
    expect(
      screen.queryByRole("region", { name: "Semana" }),
    ).not.toBeInTheDocument();
  });

  it("T133: new workspace: Primeiros passos is the first card", () => {
    render(
      view({
        kpis: { verificados: 0, auto: 0, revisao: 0, bloqueados: 0 },
        fila: [],
        alertas: [],
        primeiros_passos: {
          lote: false,
          link: false,
          monitor: false,
          oculto: false,
        },
      }),
    );
    const regions = screen.getAllByRole("region");
    expect(regions[0]).toHaveAccessibleName("Primeiros passos");
  });

  it("T133: an incomplete checklist shows after the cards; complete or hidden, none", () => {
    const steps = { lote: true, link: false, monitor: true, oculto: false };
    const { unmount } = render(view({ ...FULL, primeiros_passos: steps }));
    const names = screen
      .getAllByRole("region")
      .map((region) => region.getAttribute("aria-labelledby"));
    expect(names.at(-1)).toBe("home-steps-h");
    unmount();

    for (const done of [
      { ...steps, link: true },
      { ...steps, oculto: true },
    ]) {
      const { unmount: off } = render(
        view({ ...FULL, primeiros_passos: done }),
      );
      expect(
        screen.queryByRole("region", { name: "Primeiros passos" }),
      ).not.toBeInTheDocument();
      off();
    }
  });

  it("PH3: each missing card fails alone with home.card.error and a retry", () => {
    render(view({ kpis: FULL.kpis }));
    for (const name of ["Precisa da sua atenção", "Mudanças na base"]) {
      const region = card(name);
      expect(
        within(region).getByText("Esta parte não carregou."),
      ).toBeInTheDocument();
      expect(
        within(region).getByRole("button", { name: "Tentar de novo" }),
      ).toBeInTheDocument();
    }
    expect(screen.getByText("vendedores verificados")).toBeInTheDocument();
  });

  it("P8-006: each card's Tentar de novo is described by its heading", () => {
    render(view({ kpis: FULL.kpis }));
    const retries = screen.getAllByRole("button", { name: "Tentar de novo" });
    expect(
      retries.map((button) => button.getAttribute("aria-describedby")),
    ).toEqual(["home-queue-h", "home-feed-h", "home-week-h"]);
    expect(retries[0]).toHaveAccessibleDescription("Precisa da sua atenção");
    expect(retries[1]).toHaveAccessibleDescription("Mudanças na base");
    expect(retries[2]).toHaveAccessibleDescription("Semana");
  });

  it("PH3: missing KPIs show the card error in their place", () => {
    render(view({ fila: [], alertas: [], semana: WEEK }));
    expect(
      screen.queryByText("vendedores verificados"),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Esta parte não carregou.")).toHaveLength(1);
  });

  it("no counts in /me: no summary line", () => {
    const workspace = { ...ME.workspace };
    delete workspace.contagens;
    render(view(FULL, { ...ME, workspace }));
    expect(screen.queryByText(/esperando decisão|alerta/)).toBeNull();
  });
});
