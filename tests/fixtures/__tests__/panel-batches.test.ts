// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AC16,
  BATCH_SETS,
  FOREIGN_BATCH_ID,
  HOSTILE_RAZAO,
  ERROR_SENTINEL,
  PANEL_EMAILS,
  PANEL_PASSWORD,
  batchOutcomeFor,
} from "@/tests/fixtures/factories/panel";
import { panelControlHandlers } from "@/tests/fixtures/msw/handlers/panel-auth";
import { panelBatchControlHandlers } from "@/tests/fixtures/msw/handlers/panel-batches";
import { setBatchClock } from "@/tests/fixtures/msw/panel-store";
import { server } from "@/tests/fixtures/msw/server";
import { normalizeCnpj, validateCnpj } from "@/lib/cnpj";

// QA-owned shared fixtures (T69): the batches mock answers every M5 scenario
// of contract-request.md (PB1–PB18) by its documented key.

const API = "http://api.kybr.test";
const BFF = { "x-kybr-bff-key": "test-only-bff-key-0123456789abcdef" };
const KEY = "0b7f3c1e-2a4d-4e5f-8a6b-9c0d1e2f3a4b";
const OTHER_KEY = "1c8a4d2f-3b5e-4f60-9b7c-0d1e2f3a4b5c";
// Action keys: A-X7 scopes a key per workspace, so a start's key can't be reused.
const ACTION_KEY = "2d9b5e3a-4c6f-4a71-8c8d-1e2f3a4b5c6d";
const ACTION_KEY_2 = "3eac6f4b-5d7a-4b82-9d9e-2f3a4b5c6d7e";
const MONITOR_KEY = "4fbd7a5c-6e8b-4c93-8eaf-3a4b5c6d7e8f";
const MONITOR_KEY_2 = "5ace8b6d-7f9c-4da4-9fb0-4b5c6d7e8f90";

beforeEach(() => {
  server.use(...panelControlHandlers, ...panelBatchControlHandlers);
});

type Linha = { cnpj: string; responsavel?: string; ext_id?: string };

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

async function control(
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  return fetch(`${API}/__mock/panel${path}`, {
    method,
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
}

async function json<T = Record<string, unknown>>(
  response: Response,
): Promise<T> {
  return (await response.json()) as T;
}

/** Asserts the A-X2 envelope (sentinel message, request id) and returns the code. */
async function errorCode(response: Response): Promise<string> {
  const body = await json(response);
  expect(body.message).toBe(ERROR_SENTINEL);
  expect(response.headers.get("x-request-id")).toBeTruthy();
  return String(body.code);
}

async function login(email: string = PANEL_EMAILS.pago): Promise<string> {
  const response = await call("POST", "/v1/auth/login", undefined, {
    email,
    senha: PANEL_PASSWORD,
  });
  expect(response.status).toBe(200);
  return (await json<{ sessao: { id: string } }>(response)).sessao.id;
}

async function start(
  token: string,
  linhas: Linha[],
  key = KEY,
): Promise<Response> {
  return call(
    "POST",
    "/v1/batches",
    token,
    { linhas },
    {
      "idempotency-key": key,
    },
  );
}

async function startOk(
  token: string,
  linhas: Linha[],
  key = KEY,
): Promise<string> {
  const response = await start(token, linhas, key);
  expect(response.status).toBe(201);
  return (await json<{ id: string }>(response)).id;
}

type BatchView = {
  id: string;
  estado: string;
  total: number;
  processados: number;
  contagens: { ok: number; warn: number; bad: number; erro: number };
  iniciado_em: string;
  concluido_em?: string;
  monitorado: boolean;
  enviado_para_fila: boolean;
  casos_criados?: number;
  motivos_contagem?: {
    inapta_baixada: number;
    sem_ie: number;
    cnae_fora: number;
  };
};

async function status(token: string, id: string): Promise<BatchView> {
  const response = await call("GET", `/v1/batches/${id}`, token);
  expect(response.status).toBe(200);
  return json<BatchView>(response);
}

async function runToEnd(token: string, id: string): Promise<BatchView> {
  let view = await status(token, id);
  for (let i = 0; i < 10 && view.estado === "processando"; i++)
    view = await status(token, id);
  return view;
}

async function plano(
  token: string,
): Promise<{ usadas: number; limite: number }> {
  const me = await json<{
    workspace: { plano: { usadas: number; limite: number } };
  }>(await call("GET", "/v1/me", token));
  return me.workspace.plano;
}

const few = (cnpjs: readonly string[]): Linha[] =>
  cnpjs.map((cnpj) => ({ cnpj }));

describe("the AC 16 set and the outcome table (factories)", () => {
  it("190 rows: 184 valid (numeric and alphanumeric), 4 duplicates, 2 invalid (one empty CNPJ cell)", () => {
    expect(AC16.rows).toHaveLength(190);
    const seen = new Set<string>();
    let duplicates = 0;
    let invalid = 0;
    for (const row of AC16.rows) {
      const cnpj = normalizeCnpj(row.cnpj);
      if (validateCnpj(cnpj) !== "ok") invalid++;
      else if (seen.has(cnpj)) duplicates++;
      else seen.add(cnpj);
    }
    expect(seen.size).toBe(184);
    expect(duplicates).toBe(4);
    expect(invalid).toBe(2);
    expect(AC16.rows.some((row) => row.cnpj === "" && row.responsavel)).toBe(
      true,
    );
    expect([...seen].some((cnpj) => /[A-Z]/.test(cnpj))).toBe(true);
    expect([...seen].some((cnpj) => /^0\d{13}$/.test(cnpj))).toBe(true);
    expect(AC16.linhas.map((linha) => linha.cnpj)).toEqual([...seen]);
  });

  it("outcomes are fixed per CNPJ (default ok); the AC 16 set has 3 erro rows", () => {
    expect(batchOutcomeFor("11222333000181").status).toBe("ok");
    const statuses = AC16.linhas.map(
      (linha) => batchOutcomeFor(linha.cnpj).status,
    );
    expect(statuses.filter((s) => s === "erro")).toHaveLength(3);
    expect(statuses.filter((s) => s === "warn").length).toBeGreaterThan(0);
    expect(statuses.filter((s) => s === "bad").length).toBeGreaterThan(0);
    for (const cnpj of [
      BATCH_SETS.falha,
      ...BATCH_SETS.tudoOk,
      ...BATCH_SETS.tudoErro,
    ])
      expect(validateCnpj(cnpj)).toBe("ok");
    expect(BATCH_SETS.falha.startsWith("FALHA")).toBe(true);
  });
});

describe("PB1: start → processando → concluido in four reads", () => {
  it("advances ceil(total / 4) per status read; the clock makes {duracao} stable", async () => {
    setBatchClock(() => Date.parse("2026-10-05T13:00:00Z"));
    const token = await login();
    const linhas = few(BATCH_SETS.tudoOk);
    const id = await startOk(token, linhas);

    const seen: number[] = [];
    let view: BatchView;
    do {
      view = await status(token, id);
      seen.push(view.processados);
    } while (view.estado === "processando");

    const step = Math.ceil(linhas.length / 4);
    expect(seen[0]).toBe(Math.min(step, linhas.length));
    expect(view.estado).toBe("concluido");
    expect(view.processados).toBe(linhas.length);
    expect(view.iniciado_em).toBe("2026-10-05T13:00:00.000Z");
    expect(view.concluido_em).toBe("2026-10-05T13:00:41.000Z");
  });

  it("hold freezes it; advance moves it explicitly", async () => {
    const token = await login();
    const id = await startOk(token, AC16.linhas);
    expect((await control("POST", `/batches/${id}/hold`)).status).toBe(204);
    expect((await status(token, id)).processados).toBe(0);
    expect((await status(token, id)).processados).toBe(0);

    await control("POST", `/batches/${id}/advance`, { processados: 60 });
    expect((await status(token, id)).processados).toBe(60);
    await control("POST", `/batches/${id}/advance`);
    expect((await status(token, id)).processados).toBe(60 + 46);
    await control("POST", `/batches/${id}/hold`, { hold: false });
    expect((await runToEnd(token, id)).processados).toBe(184);
  });

  it("PB17: /me shows lote_em_andamento while a batch runs", async () => {
    const token = await login();
    const me = async () =>
      (
        await json<{
          workspace: { contagens: { lote_em_andamento: boolean } };
        }>(await call("GET", "/v1/me", token))
      ).workspace.contagens.lote_em_andamento;
    expect(await me()).toBe(false);
    const id = await startOk(token, few(BATCH_SETS.tudoOk));
    await control("POST", `/batches/${id}/hold`);
    expect(await me()).toBe(true);
    await control("POST", `/batches/${id}/hold`, { hold: false });
    await runToEnd(token, id);
    expect(await me()).toBe(false);
  });
});

describe("PB2 / PB15 / PB16: the allowance", () => {
  it("402 SEM_SALDO { disponiveis } when valid rows exceed limite − usadas (cem: 100 left)", async () => {
    const token = await login("cem@exemplo.test");
    const response = await start(token, AC16.linhas);
    expect(response.status).toBe(402);
    const body = await json(response);
    expect(body.code).toBe("SEM_SALDO");
    expect(body.disponiveis).toBe(100);
    expect(body.message).toBe(ERROR_SENTINEL);
    expect((await plano(token)).usadas).toBe((await plano(token)).limite - 100);
  });

  it.each([
    [PANEL_EMAILS.esgotado, 0],
    ["semverificacoes@exemplo.test", 0],
  ])("%s: 402 with disponiveis %s", async (email, disponiveis) => {
    const token = await login(email);
    const response = await start(token, few(BATCH_SETS.tudoOk));
    expect(response.status).toBe(402);
    expect((await json(response)).disponiveis).toBe(disponiveis);
  });

  it("start reserves the rows atomically", async () => {
    const token = await login();
    const before = (await plano(token)).usadas;
    const id = await startOk(token, AC16.linhas);
    await control("POST", `/batches/${id}/hold`);
    expect((await plano(token)).usadas).toBe(before + 184);
  });
});

describe("PB3: concluido_com_erros with the AC 16 set", () => {
  it("3 erro rows; usage rises by the successes only; motivos_contagem from the outcomes", async () => {
    const token = await login();
    const before = (await plano(token)).usadas;
    const view = await runToEnd(token, await startOk(token, AC16.linhas));

    expect(view.estado).toBe("concluido_com_erros");
    expect(view.contagens.erro).toBe(3);
    expect(
      view.contagens.ok +
        view.contagens.warn +
        view.contagens.bad +
        view.contagens.erro,
    ).toBe(184);
    expect((await plano(token)).usadas).toBe(before + 181);
    const tags = AC16.linhas.map((linha) => batchOutcomeFor(linha.cnpj).tags);
    expect(view.motivos_contagem).toEqual({
      inapta_baixada: tags.filter((t) => t.includes("inapta_baixada")).length,
      sem_ie: tags.filter((t) => t.includes("sem_ie")).length,
      cnae_fora: tags.filter((t) => t.includes("cnae_fora")).length,
    });
  });
});

describe("PB4: falhou halfway, then resume", () => {
  const linhas = few([
    ...BATCH_SETS.tudoOk,
    BATCH_SETS.falha,
    ...BATCH_SETS.tudoErro,
  ]);

  it("stops at falhou halfway, refunding the rest; resume → 202 → concluido", async () => {
    const token = await login();
    const before = (await plano(token)).usadas;
    const id = await startOk(token, linhas);
    const failed = await runToEnd(token, id);
    expect(failed.estado).toBe("falhou");
    expect(failed.processados).toBe(Math.ceil(linhas.length / 2));
    expect((await plano(token)).usadas).toBe(before + failed.processados);

    const resumed = await call("POST", `/v1/batches/${id}/resume`, token);
    expect(resumed.status).toBe(202);
    const done = await runToEnd(token, id);
    expect(done.estado).toBe("concluido_com_erros");
    expect(done.processados).toBe(linhas.length);
    expect((await plano(token)).usadas).toBe(
      before + linhas.length - BATCH_SETS.tudoErro.length,
    );
  });

  it("resume without allowance → 402; resume when not failed → 202, a no-op", async () => {
    const token = await login();
    const id = await startOk(token, linhas);
    await runToEnd(token, id);
    const account = await json<{
      workspace: { plano: { usadas: number; limite: number } };
    }>(await control("GET", `/account?email=${PANEL_EMAILS.pago}`));
    await control("POST", "/plano", {
      email: PANEL_EMAILS.pago,
      usadas: account.workspace.plano.limite,
    });
    const refused = await call("POST", `/v1/batches/${id}/resume`, token);
    expect(refused.status).toBe(402);
    expect(await errorCode(refused)).toBe("SEM_SALDO");

    const outro = await login(PANEL_EMAILS.outro);
    const other = await startOk(outro, few(BATCH_SETS.tudoOk));
    await runToEnd(outro, other);
    const noop = await call("POST", `/v1/batches/${other}/resume`, outro);
    expect(noop.status).toBe(202);
    expect((await status(outro, other)).estado).toBe("concluido");
  });
});

describe("PB5: idempotent start", () => {
  it("same key + body → the same id and one reservation; a different body → 422", async () => {
    const token = await login();
    const before = (await plano(token)).usadas;
    const first = await startOk(token, few(BATCH_SETS.tudoOk));
    const again = await startOk(token, few(BATCH_SETS.tudoOk));
    expect(again).toBe(first);
    await control("POST", `/batches/${first}/hold`);
    expect((await plano(token)).usadas).toBe(before + BATCH_SETS.tudoOk.length);

    const changed = await start(token, few(BATCH_SETS.tudoOk.slice(1)));
    expect(changed.status).toBe(422);
    expect(await errorCode(changed)).toBe("VALOR_INVALIDO");
  });

  it("the call log keeps each start's row count and key, never the rows", async () => {
    const token = await login();
    await startOk(token, AC16.linhas);
    const calls = await json<Record<string, unknown>[]>(
      await control("GET", `/calls?email=${PANEL_EMAILS.pago}`),
    );
    const startCall = calls.find(
      (c) => c.method === "POST" && c.path === "/v1/batches",
    );
    expect(startCall).toMatchObject({ rows: 184, idempotencyKey: KEY });
    expect(JSON.stringify(calls)).not.toContain(AC16.linhas[0]?.cnpj);
  });
});

describe("PB6: to-queue and monitor", () => {
  it("idempotent per key and per batch; criados = warn + bad, monitorados = successes", async () => {
    const token = await login();
    const id = await startOk(token, AC16.linhas);
    const view = await runToEnd(token, id);

    const send = (key: string) =>
      call(
        "POST",
        `/v1/batches/${id}/to-queue`,
        token,
        {},
        { "idempotency-key": key },
      );
    const firstResponse = await send(ACTION_KEY);
    expect(firstResponse.status).toBe(200);
    const first = await json<{ criados: number }>(firstResponse);
    expect(first.criados).toBe(view.contagens.warn + view.contagens.bad);
    expect(await json(await send(ACTION_KEY))).toEqual(first);
    expect(await json(await send(ACTION_KEY_2))).toEqual(first);
    const after = await status(token, id);
    expect(after.enviado_para_fila).toBe(true);
    expect(after.casos_criados).toBe(first.criados);

    const monitor = (key: string) =>
      call(
        "POST",
        `/v1/batches/${id}/monitor`,
        token,
        {},
        { "idempotency-key": key },
      );
    const on = await json<{ monitorados: number }>(await monitor(MONITOR_KEY));
    expect(on.monitorados).toBe(184 - 3);
    expect(await json(await monitor(MONITOR_KEY_2))).toEqual(on);
    expect((await status(token, id)).monitorado).toBe(true);
  });

  it("to-queue raises the shell's Fila count", async () => {
    const token = await login();
    const fila = async () =>
      (
        await json<{ workspace: { contagens: { fila_abertos: number } } }>(
          await call("GET", "/v1/me", token),
        )
      ).workspace.contagens.fila_abertos;
    const before = await fila();
    const id = await startOk(token, AC16.linhas);
    const view = await runToEnd(token, id);
    const queued = await call(
      "POST",
      `/v1/batches/${id}/to-queue`,
      token,
      {},
      { "idempotency-key": ACTION_KEY },
    );
    expect(queued.status).toBe(200);
    expect(await fila()).toBe(
      before + view.contagens.warn + view.contagens.bad,
    );
  });

  it("409 LOTE_EM_ANDAMENTO while processing", async () => {
    const token = await login();
    const id = await startOk(token, AC16.linhas);
    await control("POST", `/batches/${id}/hold`);
    for (const action of ["to-queue", "monitor"]) {
      const response = await call(
        "POST",
        `/v1/batches/${id}/${action}`,
        token,
        {},
        {
          "idempotency-key": KEY,
        },
      );
      expect(response.status).toBe(409);
      expect(await errorCode(response)).toBe("LOTE_EM_ANDAMENTO");
    }
  });
});

describe("PB7: rows", () => {
  it("file order, 25 per page by cursor, filter by status; bad status / cursor → 422", async () => {
    const token = await login();
    const id = await startOk(token, AC16.linhas);
    await runToEnd(token, id);

    type Page = {
      itens: {
        cnpj: string;
        status: string;
        motivos: string[];
        razao_social?: string;
      }[];
      proximo_cursor: string | null;
      total: number;
    };
    const first = await json<Page>(
      await call("GET", `/v1/batches/${id}/rows?limit=25`, token),
    );
    expect(first.total).toBe(184);
    expect(first.itens.map((row) => row.cnpj)).toEqual(
      AC16.linhas.slice(0, 25).map((linha) => linha.cnpj),
    );
    expect(first.proximo_cursor).not.toBeNull();
    const second = await json<Page>(
      await call(
        "GET",
        `/v1/batches/${id}/rows?limit=25&cursor=${encodeURIComponent(first.proximo_cursor ?? "")}`,
        token,
      ),
    );
    expect(second.itens[0]?.cnpj).toBe(AC16.linhas[25]?.cnpj);

    const erros = await json<Page>(
      await call("GET", `/v1/batches/${id}/rows?limit=25&status=erro`, token),
    );
    expect(erros.total).toBe(3);
    expect(erros.itens.every((row) => row.status === "erro")).toBe(true);
    expect(erros.proximo_cursor).toBeNull();

    for (const query of [
      "status=todos",
      "cursor=nao-e-um-cursor",
      "limit=26",
    ]) {
      const response = await call(
        "GET",
        `/v1/batches/${id}/rows?${query}`,
        token,
      );
      expect(response.status).toBe(422);
      expect(await errorCode(response)).toBe("VALOR_INVALIDO");
    }
  });
});

describe("PB8: CSVs", () => {
  async function csv(
    token: string,
    id: string,
    kind: string,
  ): Promise<{ text: string; type: string | null }> {
    const response = await call("GET", `/v1/batches/${id}/${kind}.csv`, token);
    expect(response.status).toBe(200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    return {
      text: new TextDecoder().decode(bytes.slice(3)),
      type: response.headers.get("content-type"),
    };
  }

  it("result.csv: BOM, ;, every field quoted, CRLF, C3 columns, masked CNPJ, CR-P8 escaping", async () => {
    const token = await login();
    const id = await startOk(token, AC16.linhas);
    await runToEnd(token, id);
    const { text, type } = await csv(token, id, "result");
    expect(type).toBe("text/csv; charset=utf-8");
    const lines = text.split("\r\n");
    expect(lines[0]).toBe(
      '"CNPJ";"Razão social";"Situação";"Motivos";"Responsável";"ID na plataforma"',
    );
    expect(lines).toHaveLength(184 + 2); // header, rows, the final CRLF
    expect(lines[1]).toMatch(
      /^"[0-9A-Z]{2}\.[0-9A-Z]{3}\.[0-9A-Z]{3}\/[0-9A-Z]{4}-\d{2}";/,
    );
    expect(text).toContain('"\'=HYPERLINK(""http://exemplo.test"")"');
    expect(text).toMatch(/"(Tudo certo|Atenção|Crítico|Não consultado)"/);
  });

  it("errors.csv: exactly the template's headers, one row per erro", async () => {
    const token = await login();
    const id = await startOk(token, AC16.linhas);
    await runToEnd(token, id);
    const lines = (await csv(token, id, "errors")).text.split("\r\n");
    expect(lines[0]).toBe('"CNPJ";"Responsável";"ID na plataforma"');
    expect(lines).toHaveLength(3 + 2);
  });

  it("the csv-sem-escape seed returns unescaped formula cells", async () => {
    await control("POST", "/seed", {
      scenario: "csv-sem-escape",
      email: PANEL_EMAILS.pago,
    });
    const token = await login();
    const id = await startOk(token, AC16.linhas);
    await runToEnd(token, id);
    const { text } = await csv(token, id, "result");
    expect(text).toContain('"=HYPERLINK(""http://exemplo.test"")"');
    expect(text).not.toContain("'=HYPERLINK");
  });
});

describe("PB9: history", () => {
  it("newest first; empty for a new account; the historico-falha seed → 500", async () => {
    const empty = await json<unknown[]>(
      await call(
        "GET",
        "/v1/batches?limit=10",
        await login(PANEL_EMAILS.outro),
      ),
    );
    expect(empty).toEqual([]);

    let now = Date.parse("2026-10-05T13:00:00Z");
    setBatchClock(() => now);
    const token = await login();
    const older = await startOk(token, few(BATCH_SETS.tudoOk));
    await runToEnd(token, older);
    now += 60_000;
    const newer = await startOk(token, few(BATCH_SETS.tudoErro), OTHER_KEY);
    await control("POST", `/batches/${newer}/hold`);
    const history = await json<{ id: string; estado: string; total: number }[]>(
      await call("GET", "/v1/batches?limit=10", token),
    );
    // pago's boot-time batch (G8) is the oldest.
    expect(history.map((entry) => entry.id).slice(0, 2)).toEqual([
      newer,
      older,
    ]);
    expect(history[0]).toMatchObject({
      estado: "processando",
      total: BATCH_SETS.tudoErro.length,
    });

    await control("POST", "/seed", {
      scenario: "historico-falha",
      email: PANEL_EMAILS.pago,
    });
    expect((await call("GET", "/v1/batches?limit=10", token)).status).toBe(500);
  });
});

describe("PB10: tenancy", () => {
  it("an unknown id and another account's id → the same 404 LOTE_NAO_ENCONTRADO", async () => {
    const pago = await login(PANEL_EMAILS.pago);
    const foreign = await startOk(pago, few(BATCH_SETS.tudoOk));
    const token = await login(PANEL_EMAILS.outro);
    const unknown = "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a";
    const bodies: string[] = [];
    for (const id of [foreign, unknown])
      for (const path of ["", "/rows?limit=25", "/result.csv", "/errors.csv"]) {
        const response = await call("GET", `/v1/batches/${id}${path}`, token);
        expect(response.status).toBe(404);
        const body = await json(response);
        expect(body.code).toBe("LOTE_NAO_ENCONTRADO");
        bodies.push(JSON.stringify(body));
      }
    for (const action of ["to-queue", "monitor", "resume"]) {
      const response = await call(
        "POST",
        `/v1/batches/${foreign}/${action}`,
        token,
        {},
        {
          "idempotency-key": KEY,
        },
      );
      expect(response.status).toBe(404);
    }
    expect(new Set(bodies).size).toBe(1);
  });
});

describe("PB11: status reads fail n times, then recover", () => {
  it("503 for the next n reads, without advancing", async () => {
    const token = await login();
    const id = await startOk(token, AC16.linhas);
    await control("POST", "/seed", {
      scenario: "lote-poll-falha",
      email: PANEL_EMAILS.pago,
      n: 2,
    });
    expect((await call("GET", `/v1/batches/${id}`, token)).status).toBe(503);
    expect((await call("GET", `/v1/batches/${id}`, token)).status).toBe(503);
    expect((await status(token, id)).processados).toBe(46);
  });
});

describe("PB12: the connection drops on start", () => {
  it("queda-de-rede-lote destroys the socket", async () => {
    await control("POST", "/seed", {
      scenario: "queda-de-rede-lote",
      email: PANEL_EMAILS.pago,
    });
    const token = await login();
    await expect(start(token, AC16.linhas)).rejects.toThrow();
  });
});

describe("PB13: tampered start bodies", () => {
  it("> 5,000 rows → MUITAS_LINHAS; no valid CNPJ → SEM_CNPJ_VALIDO", async () => {
    const token = await login();
    const many = Array.from({ length: 5001 }, () => ({
      cnpj: BATCH_SETS.tudoOk[0] ?? "",
    }));
    let response = await start(token, many);
    expect(response.status).toBe(422);
    expect(await errorCode(response)).toBe("MUITAS_LINHAS");

    response = await start(token, [{ cnpj: "11222333000100" }, { cnpj: "" }]);
    expect(response.status).toBe(422);
    expect(await errorCode(response)).toBe("SEM_CNPJ_VALIDO");

    response = await start(token, []);
    expect(await errorCode(response)).toBe("SEM_CNPJ_VALIDO");
  });

  it.each([
    [
      "a bad check digit",
      [{ cnpj: "11222333000181" }, { cnpj: "11222333000100" }],
      "linhas[1].cnpj",
    ],
    [
      "a duplicate",
      [{ cnpj: "11222333000181" }, { cnpj: "11222333000181" }],
      "linhas[1].cnpj",
    ],
    [
      "a masked CNPJ",
      [{ cnpj: "11222333000181" }, { cnpj: "11.222.333/0001-81" }],
      "linhas[1].cnpj",
    ],
    [
      "an over-long responsavel",
      [{ cnpj: "11222333000181", responsavel: "a".repeat(121) }],
      "linhas[0].responsavel",
    ],
    [
      "an off-charset responsavel",
      [{ cnpj: "11222333000181", responsavel: "=1+1" }],
      "linhas[0].responsavel",
    ],
    [
      "an over-long ext_id",
      [{ cnpj: "11222333000181", ext_id: "x".repeat(65) }],
      "linhas[0].ext_id",
    ],
    ["an extra field", [{ cnpj: "11222333000181", nota: "x" }], "linhas[0]"],
  ])("%s → VALOR_INVALIDO with field", async (_, linhas, field) => {
    const token = await login();
    const response = await start(token, linhas as Linha[]);
    expect(response.status).toBe(422);
    const body = await json(response);
    expect(body).toMatchObject({
      code: "VALOR_INVALIDO",
      field,
      message: ERROR_SENTINEL,
    });
  });

  it("a missing or non-uuid Idempotency-Key → VALOR_INVALIDO; no bearer → 401", async () => {
    const token = await login();
    const response = await start(token, few(BATCH_SETS.tudoOk), "nao-uuid");
    expect(response.status).toBe(422);
    const unauthenticated = await call(
      "POST",
      "/v1/batches",
      undefined,
      {
        linhas: few(BATCH_SETS.tudoOk),
      },
      { "idempotency-key": KEY },
    );
    expect(unauthenticated.status).toBe(401);
    expect(await errorCode(unauthenticated)).toBe("SESSAO_EXPIRADA");
  });
});

describe("PB14: session expired mid-poll", () => {
  it("401 SESSAO_EXPIRADA; a poll read doesn't keep the session alive", async () => {
    const token = await login();
    const id = await startOk(token, AC16.linhas);
    await control("POST", "/expire-session", { id: token });
    const response = await call("GET", `/v1/batches/${id}`, token, undefined, {
      "x-kybr-poll": "1",
    });
    expect(response.status).toBe(401);
    expect(await errorCode(response)).toBe("SESSAO_EXPIRADA");
  });
});

describe("PB18: buttons hidden on a finished batch", () => {
  it("TUDO-OK has no Atenção/Crítico rows; TUDO-ERRO has no successful rows", async () => {
    const token = await login();
    const ok = await runToEnd(
      token,
      await startOk(token, few(BATCH_SETS.tudoOk)),
    );
    expect(ok.contagens.warn + ok.contagens.bad).toBe(0);
    expect(ok.estado).toBe("concluido");
    const erro = await runToEnd(
      token,
      await startOk(token, few(BATCH_SETS.tudoErro), OTHER_KEY),
    );
    expect(erro.contagens.ok + erro.contagens.warn + erro.contagens.bad).toBe(
      0,
    );
    expect(erro.estado).toBe("concluido_com_erros");
  });
});

describe("test controls", () => {
  it("list an account's batches and create one directly (E2E)", async () => {
    const created = await json<{ id: string }>(
      await control("POST", "/batches", {
        email: PANEL_EMAILS.pago,
        set: "ac16",
        finish: true,
      }),
    );
    const listed = await json<{ id: string; estado: string }[]>(
      await control("GET", `/batches?email=${PANEL_EMAILS.pago}`),
    );
    // Newest first; pago's boot-time batch (G8) is older.
    expect(listed[0]).toEqual(
      expect.objectContaining({
        id: created.id,
        estado: "concluido_com_erros",
      }),
    );
    expect(listed.at(-1)?.id).toBe(FOREIGN_BATCH_ID);
  });
});

describe("QA fixture gaps (M5 test plan G1–G11)", () => {
  it("G1: a start's call carries the row keys and optional-field counts, never values", async () => {
    const token = await login();
    await startOk(token, [
      { cnpj: BATCH_SETS.tudoOk[0] ?? "", responsavel: "Maria Exemplo" },
      { cnpj: BATCH_SETS.tudoOk[1] ?? "", ext_id: "loja-1" },
      { cnpj: BATCH_SETS.tudoOk[2] ?? "" },
    ]);
    const calls = await json<Record<string, unknown>[]>(
      await control("GET", `/calls?email=${PANEL_EMAILS.pago}`),
    );
    const start = calls.find(
      (c) => c.path === "/v1/batches" && c.method === "POST",
    );
    expect(start).toMatchObject({
      rows: 3,
      rowKeys: ["cnpj", "ext_id", "responsavel"],
      withResponsavel: 1,
      withExtId: 1,
    });
    expect(JSON.stringify(calls)).not.toContain("Maria Exemplo");
  });

  it("G3: Lote's seeds need an account", async () => {
    for (const scenario of [
      "csv-sem-escape",
      "historico-falha",
      "queda-de-rede-lote",
      "lote-poll-falha",
    ])
      expect(
        (await control("POST", "/seed", { scenario })).status,
        scenario,
      ).toBe(400);
  });

  it("G4: per-account faults — delay, 500, drop, oversized / HTML / broken CSVs, processados > total", async () => {
    const token = await login();
    const id = await startOk(token, few(BATCH_SETS.tudoOk));
    const fault = (endpoint: string, kind: string, extra: object = {}) =>
      control("POST", "/batch-fault", {
        email: PANEL_EMAILS.pago,
        endpoint,
        fault: kind,
        ...extra,
      });

    await fault("status", "500", { times: 1 });
    expect((await call("GET", `/v1/batches/${id}`, token)).status).toBe(500);
    expect((await call("GET", `/v1/batches/${id}`, token)).status).toBe(200);

    await fault("to-queue", "drop");
    await runToEnd(token, id);
    await expect(
      call(
        "POST",
        `/v1/batches/${id}/to-queue`,
        token,
        {},
        { "idempotency-key": ACTION_KEY },
      ),
    ).rejects.toThrow();
    await fault("to-queue", "none");

    await fault("history", "delay", { ms: 300, times: 1 });
    const started = Date.now();
    expect((await call("GET", "/v1/batches?limit=10", token)).status).toBe(200);
    expect(Date.now() - started).toBeGreaterThanOrEqual(290);

    await fault("result.csv", "csv-html");
    const html = await call("GET", `/v1/batches/${id}/result.csv`, token);
    expect(html.headers.get("content-type")).toBe("text/html");
    await fault("result.csv", "csv-grande");
    expect(
      (await (await call("GET", `/v1/batches/${id}/result.csv`, token)).text())
        .length,
    ).toBe(5 * 1024 * 1024 + 1);
    await fault("errors.csv", "csv-aspas");
    expect(
      await (await call("GET", `/v1/batches/${id}/errors.csv`, token)).text(),
    ).toContain('"aberta');

    await fault("status", "processados-acima", { times: 1 });
    const view = await json<BatchView>(
      await call("GET", `/v1/batches/${id}`, token),
    );
    expect(view.processados).toBe(view.total + 1);
  });

  it("G5: misto-sem-erro ends concluido with motivos_contagem 2 / 1 / 5; um-atencao has one warn", async () => {
    const token = await login();
    const misto = await runToEnd(
      token,
      await startOk(token, few(BATCH_SETS.mistoSemErro)),
    );
    expect(misto.estado).toBe("concluido");
    expect(misto.contagens).toEqual({ ok: 30, warn: 6, bad: 4, erro: 0 });
    expect(misto.motivos_contagem).toEqual({
      inapta_baixada: 2,
      sem_ie: 1,
      cnae_fora: 5,
    });
    const um = await runToEnd(
      token,
      await startOk(token, few(BATCH_SETS.umAtencao), OTHER_KEY),
    );
    expect(um.contagens).toEqual({ ok: 3, warn: 1, bad: 0, erro: 0 });
  });

  it("G6: X-Kybr-Poll is logged, and /__mock/panel/session shows a poll doesn't slide idle", async () => {
    const token = await login();
    const id = await startOk(token, few(BATCH_SETS.tudoOk));
    const before = await json<{ lastActivity: number }>(
      await control("GET", `/session?id=${token}`),
    );
    // The clock moves on (P5-012: no real sleep); a poll must not slide idle.
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 1_000 });
    try {
      await call("GET", `/v1/batches/${id}`, token, undefined, {
        "x-kybr-poll": "1",
      });
    } finally {
      vi.useRealTimers();
    }
    const after = await json<{ lastActivity: number }>(
      await control("GET", `/session?id=${token}`),
    );
    expect(after.lastActivity).toBe(before.lastActivity);
    const calls = await json<Record<string, unknown>[]>(
      await control("GET", `/calls?email=${PANEL_EMAILS.pago}`),
    );
    expect(calls.at(-1)).toMatchObject({
      path: `/v1/batches/${id}`,
      poll: true,
    });
  });

  it("G7: hostile backend strings reach the rows as given", async () => {
    const token = await login();
    const id = await startOk(token, few(BATCH_SETS.hostil));
    await runToEnd(token, id);
    const page = await json<{
      itens: { razao_social?: string; motivos: string[] }[];
    }>(await call("GET", `/v1/batches/${id}/rows?limit=25`, token));
    expect(page.itens[0]?.razao_social).toBe(HOSTILE_RAZAO);
    expect(page.itens[0]?.motivos).toHaveLength(6);
    expect(page.itens[1]?.razao_social).toHaveLength(200);
    expect(page.itens[2]?.razao_social).toBeUndefined();
    expect(page.itens[3]?.razao_social).toContain("***.***.***-**");
  });

  it("G8: FOREIGN_BATCH_ID is pago's from boot, a 404 for anyone else", async () => {
    expect((await status(await login(), FOREIGN_BATCH_ID)).estado).toBe(
      "concluido",
    );
    const outro = await login(PANEL_EMAILS.outro);
    expect(
      (await call("GET", `/v1/batches/${FOREIGN_BATCH_ID}`, outro)).status,
    ).toBe(404);
  });

  it("G10: /__mock/panel/plan sets the plan; G11: a batch's start and duration are fixed", async () => {
    expect(
      (
        await control("POST", "/plan", {
          email: PANEL_EMAILS.pago,
          usadas: 4999,
        })
      ).status,
    ).toBe(204);
    const token = await login();
    expect((await plano(token)).usadas).toBe(4999);

    const { id } = await json<{ id: string }>(
      await control("POST", "/batches", {
        email: PANEL_EMAILS.pago,
        set: "hostil",
        finish: true,
        iniciadoEm: "2026-10-05T23:30:00-03:00",
        duracaoMs: 3 * 60_000,
      }),
    );
    const view = await status(token, id);
    expect(view.iniciado_em).toBe("2026-10-06T02:30:00.000Z");
    expect(view.concluido_em).toBe("2026-10-06T02:33:00.000Z");
  });
});
