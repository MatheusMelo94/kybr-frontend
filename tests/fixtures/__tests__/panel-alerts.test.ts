// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import {
  alertListSchema,
  monitoringSchema,
  type AlertList,
} from "@/lib/api/schemas/panel/alerts";
import { caseSchema } from "@/lib/api/schemas/panel/cases";
import { meSchema } from "@/lib/api/schemas/panel/me";
import { ALERT_TIPOS } from "@/lib/panel-api-values";
import { ALERT_EMAILS, PANEL_PASSWORD } from "@/tests/fixtures/factories/panel";
import { panelControlHandlers } from "@/tests/fixtures/msw/handlers/panel-auth";
import { panelAlertControlHandlers } from "@/tests/fixtures/msw/handlers/panel-alerts";
import { panelCaseControlHandlers } from "@/tests/fixtures/msw/handlers/panel-cases";
import { server } from "@/tests/fixtures/msw/server";

// QA-owned shared fixtures (T120): the alerts mock answers M7's scenarios
// PM1–PM9 (contract-request.md § M7 additions) and QA's fixture gaps G1–G8
// (test plan 2026-10-10). Each response is parsed with the frontend's own
// schemas (T119), so the mock and the client can't drift apart silently.

const API = "http://api.kybr.test";
const BFF = { "x-kybr-bff-key": "test-only-bff-key-0123456789abcdef" };
const KEY = "0b7f3c1e-2a4d-4e5f-8a6b-9c0d1e2f3a4b";
const NOW = "2026-10-07T15:00:00.000Z"; // a Wednesday, 12:00 in São Paulo

beforeEach(() => {
  server.use(
    ...panelControlHandlers,
    ...panelCaseControlHandlers,
    ...panelAlertControlHandlers,
  );
});

async function call(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${API}${path}`, {
    method,
    headers: {
      ...BFF,
      "content-type": "application/json",
      ...(token !== undefined && { authorization: `Bearer ${token}` }),
      ...headers,
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
}

function control(method: string, path: string, body?: unknown) {
  return fetch(`${API}/__mock/panel${path}`, {
    method,
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
}

async function login(email: string): Promise<string> {
  const response = await call("POST", "/v1/auth/login", undefined, {
    email,
    senha: PANEL_PASSWORD,
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { sessao: { id: string } }).sessao.id;
}

/** A fresh account with an alerts preset (QA G1), logged in. */
async function seeded(preset: string, now?: string) {
  const email = `${preset}-${crypto.randomUUID().slice(0, 8)}@exemplo.test`;
  if (now !== undefined)
    expect((await control("POST", "/case-clock", { email, now })).status).toBe(
      204,
    );
  const response = await control("POST", "/alerts/seed", { email, preset });
  expect(response.status).toBe(201);
  return { email, token: await login(email) };
}

async function alerts(token: string): Promise<AlertList> {
  const response = await call("GET", "/v1/alerts?limit=50", token);
  expect(response.status).toBe(200);
  return alertListSchema.parse(await response.json());
}

async function monitoring(token: string) {
  const response = await call("GET", "/v1/monitoring", token);
  expect(response.status).toBe(200);
  return monitoringSchema.parse(await response.json());
}

async function criticos(token: string): Promise<number | undefined> {
  const me = meSchema.parse(await (await call("GET", "/v1/me", token)).json());
  return me.workspace.contagens?.alertas_criticos_abertos;
}

describe("D-M1 list (PM1, PM8)", () => {
  it("the default account has all seven types, newest first", async () => {
    const list = await alerts(await login(ALERT_EMAILS.alertas));
    expect(new Set(list.map((alert) => alert.tipo))).toEqual(
      new Set(ALERT_TIPOS),
    );
    const dates = list.map((alert) => Date.parse(alert.detectado_em));
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });

  it("covers an open critical case, a blocked one, pedido_aberto and a null razão social", async () => {
    const token = await login(ALERT_EMAILS.alertas);
    const list = await alerts(token);
    const critical = list.filter((alert) => alert.severidade === "critico");
    expect(critical.every((alert) => alert.case_id !== undefined)).toBe(true);
    const open = critical.find((alert) => alert.case_decisao === undefined);
    expect(open?.case_id).toBeDefined();
    const kase = caseSchema.parse(
      await (await call("GET", `/v1/cases/${open?.case_id}`, token)).json(),
    );
    expect(kase.origem).toBe("monitoramento");
    expect(kase.estado).toBe("aberto");
    expect(critical.some((alert) => alert.case_decisao === "bloquear")).toBe(
      true,
    );
    expect(list.some((alert) => alert.pedido_aberto === true)).toBe(true);
    expect(list.some((alert) => alert.seller.razao_social === null)).toBe(true);
    const webhook = list.find((alert) => alert.tipo === "WEBHOOK_FALHOU");
    expect(webhook?.severidade).toBe("atencao");
    expect(webhook?.case_id).toBeUndefined();
    // C-M7-4: the count is the undecided critical alerts.
    expect(await criticos(token)).toBe(1);
  });

  it("caps the list at the requested limit (G8 sessenta)", async () => {
    const { token } = await seeded("sessenta");
    expect(await alerts(token)).toHaveLength(50);
  });

  it("no bearer → 401", async () => {
    const response = await call("GET", "/v1/alerts?limit=50");
    expect(response.status).toBe(401);
  });

  it("logs each read with the account (G5)", async () => {
    const { email, token } = await seeded("pm1");
    await alerts(token);
    await monitoring(token);
    const calls = (await (await control("GET", "/calls")).json()) as {
      path: string;
      email?: string;
    }[];
    const own = calls.filter((entry) => entry.email === email);
    expect(own.map((entry) => entry.path)).toEqual(
      expect.arrayContaining(["/v1/alerts?limit=50", "/v1/monitoring"]),
    );
  });
});

describe("D-M2 monitoring (PM2–PM5)", () => {
  it("PM2: the default account is monitored, swept, with the next sweep ahead", async () => {
    const { token } = await seeded("pm1", NOW);
    const status = await monitoring(token);
    expect(status).toMatchObject({ ativo: true });
    expect(status.monitorados).toBeGreaterThan(0);
    // G3: next Monday 06:00 in São Paulo, last sweep a week before.
    expect(status.proxima_varredura).toBe("2026-10-12T09:00:00.000Z");
    expect(status.ultima_varredura).toBe("2026-10-05T09:00:00.000Z");
  });

  it("PM3: semmonitor@ monitors nothing", async () => {
    const token = await login(ALERT_EMAILS.semmonitor);
    expect((await monitoring(token)).monitorados).toBe(0);
    expect(await alerts(token)).toEqual([]);
  });

  it("PM4: semvarredura@ is monitored with no sweep yet", async () => {
    const token = await login(ALERT_EMAILS.semvarredura);
    const status = await monitoring(token);
    expect(status.monitorados).toBeGreaterThan(0);
    expect(status.ultima_varredura).toBeUndefined();
    expect(status.proxima_varredura).toBeDefined();
    expect(await alerts(token)).toEqual([]);
  });

  it("PM5: semalertas@ is swept with no alerts", async () => {
    const token = await login(ALERT_EMAILS.semalertas);
    expect((await monitoring(token)).ultima_varredura).toBeDefined();
    expect(await alerts(token)).toEqual([]);
    expect(await criticos(token)).toBe(0);
  });
});

describe("PM6 the sweep control (D-M3) and the decision", () => {
  it("a critical alert opens a case, bumps the count and mails the link; deciding closes it", async () => {
    const { email, token } = await seeded("semalertas");
    const response = await control("POST", "/sweep", {
      email,
      cnpj: "12ABC34501DE35",
      tipo: "SITUACAO_IRREGULAR",
    });
    expect(response.status).toBe(201);
    const { id, case_id: caseId } = (await response.json()) as {
      id: string;
      case_id: string;
    };
    const [alert] = await alerts(token);
    expect(alert).toMatchObject({
      id,
      tipo: "SITUACAO_IRREGULAR",
      severidade: "critico",
      case_id: caseId,
      dados: { situacao: "inapta" },
    });
    expect(alert?.seller.cnpj).toBe("12ABC34501DE35");
    expect(await criticos(token)).toBe(1);

    const kase = caseSchema.parse(
      await (await call("GET", `/v1/cases/${caseId}`, token)).json(),
    );
    expect(kase.origem).toBe("monitoramento");
    expect(kase.mudanca).toBeDefined();

    const mail = (await (
      await control("GET", `/outbox?email=${encodeURIComponent(email)}`)
    ).json()) as { alerta?: { assunto: string; link: string } };
    expect(mail.alerta?.assunto).toMatch(/^Alerta crítico: /);
    expect(mail.alerta?.link).toBe(`https://app.kybr.com.br/fila/${caseId}`);

    const decided = await call(
      "POST",
      `/v1/cases/${caseId}/decide`,
      token,
      { decisao: "bloquear", motivo_codigo: "SITUACAO_IRREGULAR" },
      { "idempotency-key": KEY },
    );
    expect(decided.status).toBe(200);
    expect((await alerts(token))[0]?.case_decisao).toBe("bloquear");
    expect(await criticos(token)).toBe(0);
  });

  it("a non-critical alert opens no case and sends no mail", async () => {
    const { email, token } = await seeded("semalertas");
    const response = await control("POST", "/sweep", {
      email,
      cnpj: "12ABC34501DE35",
      tipo: "QSA_MUDOU",
    });
    expect(response.status).toBe(201);
    const [alert] = await alerts(token);
    expect(alert?.case_id).toBeUndefined();
    expect(await criticos(token)).toBe(0);
    const mail = await control(
      "GET",
      `/outbox?email=${encodeURIComponent(email)}`,
    );
    expect(mail.status).toBe(404);
  });

  it("refuses an unknown tipo or a bad CNPJ", async () => {
    const { email } = await seeded("semalertas");
    for (const body of [
      { email, cnpj: "12ABC34501DE35", tipo: "NOVO" },
      { email, cnpj: "12.345", tipo: "QSA_MUDOU" },
    ])
      expect((await control("POST", "/sweep", body)).status).toBe(400);
  });
});

describe("PM7 faults (G2) and invalid data (G4)", () => {
  it("alertas-falha and monitoramento-falha are per account", async () => {
    const { email, token } = await seeded("pm1");
    const other = await login(ALERT_EMAILS.alertas);
    for (const scenario of ["alertas-falha", "monitoramento-falha"])
      expect((await control("POST", "/seed", { scenario, email })).status).toBe(
        204,
      );
    expect((await call("GET", "/v1/alerts?limit=50", token)).status).toBe(503);
    expect((await call("GET", "/v1/monitoring", token)).status).toBe(503);
    expect((await call("GET", "/v1/alerts?limit=50", other)).status).toBe(200);
    expect(
      (await control("POST", "/seed", { scenario: "alertas-falha" })).status,
    ).toBe(400);
  });

  it("a counted fault recovers after n requests", async () => {
    const { email, token } = await seeded("pm1");
    expect(
      (
        await control("POST", "/alert-fault", {
          email,
          endpoint: "monitoring",
          kind: "503",
          times: 1,
        })
      ).status,
    ).toBe(204);
    expect((await call("GET", "/v1/monitoring", token)).status).toBe(503);
    expect((await call("GET", "/v1/monitoring", token)).status).toBe(200);
  });

  it.each(["invalido-tipo", "invalido-dados", "invalido-case"])(
    "%s fails the frontend's schema",
    async (preset) => {
      const { token } = await seeded(preset);
      const response = await call("GET", "/v1/alerts?limit=50", token);
      expect(response.status).toBe(200);
      expect(alertListSchema.safeParse(await response.json()).success).toBe(
        false,
      );
    },
  );

  it("hostil carries markup at the caps and a null razão social (G6)", async () => {
    const { token } = await seeded("hostil");
    const list = await alerts(token);
    const responsavel = list.find(
      (alert) => alert.tipo === "RESPONSAVEL_SAIU_QSA",
    );
    expect(responsavel?.dados).toMatchObject({
      responsavel: expect.stringContaining("<"),
    });
    expect(
      (responsavel?.dados as { responsavel: string }).responsavel,
    ).toHaveLength(120);
    expect(list.some((alert) => alert.seller.razao_social === null)).toBe(true);
  });
});

describe("PM9 isolation", () => {
  it("an account sees only its own alerts and cases", async () => {
    const a = await seeded("pm1");
    const b = await seeded("pm1");
    const idsA = (await alerts(a.token)).map((alert) => alert.id);
    const listB = await alerts(b.token);
    expect(listB.some((alert) => idsA.includes(alert.id))).toBe(false);
    const foreignCase = (await alerts(a.token)).find(
      (alert) => alert.case_id !== undefined,
    )?.case_id;
    expect(
      (await call("GET", `/v1/cases/${foreignCase}`, b.token)).status,
    ).toBe(404);
  });
});
