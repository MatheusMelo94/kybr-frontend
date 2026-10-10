import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { dashboardSchema } from "@/lib/api/schemas/panel/home";
import {
  ownNameResponseSchema,
  sessionGrantSchema,
} from "@/lib/api/schemas/panel/account";

// T128: D-H1 (C-M8-1), D-A6 (C-M8-7) and D-W4 (C-M8-8), Pre-Contract.

const caseItem = {
  id: "case_000000000001",
  razao_social: "Empresa Exemplo Ltda",
  cnpj: "12345678000195",
  veredito: "revisar",
  status: "warn",
  motivos: [],
  origem: "link",
  sla_ate: "2026-10-12T10:00:00-03:00",
  vencido: false,
  criado_em: "2026-10-10T10:00:00-03:00",
};

const alertItem = {
  id: "alert_00000000001",
  tipo: "QSA_MUDOU",
  severidade: "atencao",
  seller: {
    id: "seller_0000000001",
    razao_social: null,
    cnpj: "12345678000195",
  },
  detectado_em: "2026-10-10T06:00:00-03:00",
  dados: {},
};

const semana = Array.from({ length: 7 }, (_, i) => ({
  dia: `2026-10-0${i + 1}`,
  total: i,
}));

const full = {
  kpis: { verificados: 10, auto: 6, revisao: 3, bloqueados: 1 },
  fila: [caseItem],
  alertas: [alertItem],
  semana,
  primeiros_passos: { lote: true, link: false, monitor: false, oculto: false },
};

describe("dashboardSchema (D-H1, C-M8-1)", () => {
  it("accepts the full dashboard", () => {
    expect(dashboardSchema.safeParse(full).success).toBe(true);
  });

  it.each(["kpis", "fila", "alertas", "semana", "primeiros_passos"] as const)(
    "accepts the dashboard without %s (each card is optional)",
    (card) => {
      const rest: Record<string, unknown> = { ...full };
      delete rest[card];
      expect(dashboardSchema.safeParse(rest).success).toBe(true);
    },
  );

  it("accepts an empty object (every card failed)", () => {
    expect(dashboardSchema.safeParse({}).success).toBe(true);
  });

  it.each([
    ["a negative count", { kpis: { ...full.kpis, auto: -1 } }],
    ["a fractional count", { kpis: { ...full.kpis, revisao: 1.5 } }],
    [
      "a negative day total",
      { semana: [{ ...semana[0], total: -1 }, ...semana.slice(1)] },
    ],
    ["a 6-day series", { semana: semana.slice(1) }],
    [
      "an 8-day series",
      { semana: [...semana, { dia: "2026-10-08", total: 0 }] },
    ],
    [
      "a malformed day",
      { semana: [{ dia: "10/01/2026", total: 0 }, ...semana.slice(1)] },
    ],
    ["5 queue items", { fila: Array.from({ length: 5 }, () => caseItem) }],
    ["5 alerts", { alertas: Array.from({ length: 5 }, () => alertItem) }],
    ["an unknown top-level field", { extra: 1 }],
    ["an unknown KPI", { kpis: { ...full.kpis, outro: 1 } }],
    [
      "a missing step flag",
      { primeiros_passos: { lote: true, link: false, monitor: false } },
    ],
  ])("rejects %s", (_, override) => {
    expect(dashboardSchema.safeParse({ ...full, ...override }).success).toBe(
      false,
    );
  });
});

describe("sessionGrantSchema (D-A6 200, C-M8-7; the login's too, O-F3)", () => {
  const ok = {
    sessao: { id: "s".repeat(32), expira_em: "2026-10-17T10:00:00Z" },
  };
  beforeEach(() => {
    vi.useFakeTimers({ now: Date.parse("2026-10-10T10:00:00Z") });
  });
  afterEach(() => vi.useRealTimers());

  it("O-F3: accepts up to 7 days ahead plus the clock-skew allowance", () => {
    expect(
      sessionGrantSchema.safeParse({
        sessao: { ...ok.sessao, expira_em: "2026-10-17T10:04:00Z" },
      }).success,
    ).toBe(true);
  });

  it("accepts a session with an ISO expiry carrying an offset or Z", () => {
    expect(sessionGrantSchema.safeParse(ok).success).toBe(true);
    expect(
      sessionGrantSchema.safeParse({
        sessao: { ...ok.sessao, expira_em: "2026-10-17T07:00:00-03:00" },
      }).success,
    ).toBe(true);
  });

  it.each([
    ["no sessao", {}],
    ["no id", { sessao: { expira_em: ok.sessao.expira_em } }],
    ["a short id", { sessao: { ...ok.sessao, id: "abc" } }],
    ["no expira_em", { sessao: { id: ok.sessao.id } }],
    [
      "an expiry without an offset",
      { sessao: { ...ok.sessao, expira_em: "2026-10-17T10:00:00" } },
    ],
    [
      "a date-only expiry",
      { sessao: { ...ok.sessao, expira_em: "2026-10-17" } },
    ],
    [
      "O-F3: an expiry in the past",
      { sessao: { ...ok.sessao, expira_em: "2026-10-10T09:59:59Z" } },
    ],
    [
      "O-F3: an expiry right now",
      { sessao: { ...ok.sessao, expira_em: "2026-10-10T10:00:00Z" } },
    ],
    [
      "O-F3: an expiry more than 7 days ahead",
      { sessao: { ...ok.sessao, expira_em: "2026-10-17T10:06:00Z" } },
    ],
    [
      "O-F3: an id outside the cookie charset",
      { sessao: { ...ok.sessao, id: `${"s".repeat(20)} ;x` } },
    ],
    ["O-F3: a long id", { sessao: { ...ok.sessao, id: "s".repeat(513) } }],
  ])("rejects %s", (_, body) => {
    expect(sessionGrantSchema.safeParse(body).success).toBe(false);
  });
});

describe("ownNameResponseSchema (D-W4 200 → the D-W1 object, C-M8-8)", () => {
  it("is the /me shape", () => {
    const me = {
      nome: "Pessoa Exemplo",
      email: "pessoa@exemplo.test",
      workspace: {
        nome: "Plataforma Exemplo",
        slug: "exemplo",
        link_url: "https://kybr.example/v/exemplo",
        contato_vendedor: null,
        categoria: null,
        onboarding_concluido: true,
        webhook_configurado: false,
      },
    };
    expect(ownNameResponseSchema.safeParse(me).success).toBe(true);
    expect(ownNameResponseSchema.safeParse({ nome: "x" }).success).toBe(false);
  });
});
