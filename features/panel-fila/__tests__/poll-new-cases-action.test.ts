// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  addCase,
  ageSession,
  casesOf,
  openSession,
  panelStore,
  seedCases,
  setCaseFault,
} from "@/tests/fixtures/msw/panel-store";
import { server } from "@/tests/fixtures/msw/server";

const state = vi.hoisted(() => ({
  headers: new Headers(),
  token: undefined as string | undefined,
}));
vi.mock("next/headers", () => ({ headers: async () => state.headers }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));
vi.mock("@/lib/api/panel/cookies", () => ({
  readSessionToken: async () => state.token,
}));
vi.mock("@/lib/monitoring", () => ({ reportMarker: vi.fn() }));

import { pollNewCasesAction } from "@/features/panel-fila/poll-action";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
let email: string;

const iso = (ms: number) => new Date(ms).toISOString();

beforeEach(() => {
  email = `novos-${crypto.randomUUID().slice(0, 8)}@exemplo.test`;
  seedCases(email, "dois");
  state.token = openSession(email).id;
  state.headers = new Headers({ host: "app.kybr.test" });
});

/** A case that opened `agoMs` ago (the mock's abertoEm). */
function openedAgo(agoMs: number): void {
  const [template] = casesOf(email);
  if (!template) throw new Error("seed");
  addCase({
    ...structuredClone(template),
    id: crypto.randomUUID(),
    abertoEm: Date.now() - agoMs,
  });
}

const accountCalls = () =>
  panelStore().calls.filter((call) => call.email === email || !call.email);

describe("pollNewCasesAction (D-C1 desde, C-M6-1; ADR-0011 rule 3 + Addendum 2; F10)", () => {
  it("off the panel host: 404 before anything", async () => {
    state.headers = new Headers({ host: "kybr.test" });
    await expect(
      pollNewCasesAction({ desde: iso(Date.now() - MINUTE) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it.each([
    ["no desde", {}],
    ["a date that isn't ISO", { desde: "ontem" }],
    ["an ISO date without a time", { desde: "2026-10-06" }],
    [
      "a desde older than 7 days",
      { desde: iso(Date.now() - 7 * DAY - MINUTE) },
    ],
    ["an unknown key", { desde: iso(Date.now()), extra: 1 }],
    ["a non-object", "agora"],
  ])("refuses %s with VALOR_INVALIDO and no API call", async (_, input) => {
    const before = panelStore().calls.length;
    expect(await pollNewCasesAction(input)).toEqual({
      ok: false,
      code: "VALOR_INVALIDO",
    });
    expect(panelStore().calls.length).toBe(before);
  });

  it("counts the cases opened since desde", async () => {
    const desde = iso(Date.now() - 10 * MINUTE);
    openedAgo(MINUTE);
    openedAgo(2 * MINUTE);
    openedAgo(20 * MINUTE);
    expect(await pollNewCasesAction({ desde })).toEqual({ ok: true, novos: 2 });
  });

  it("F10: one poll sends exactly two backend requests, /me and the desde count, both with X-Kybr-Poll: 1", async () => {
    const seen: { path: string; poll: string | null }[] = [];
    const listener = ({ request }: { request: Request }) => {
      seen.push({
        path: new URL(request.url).pathname,
        poll: request.headers.get("x-kybr-poll"),
      });
    };
    server.events.on("request:start", listener);
    await pollNewCasesAction({ desde: iso(Date.now() - MINUTE) });
    server.events.removeListener("request:start", listener);
    expect(seen).toEqual([
      { path: "/v1/me", poll: "1" },
      { path: "/v1/cases", poll: "1" },
    ]);
  });

  it("doesn't keep the session alive", async () => {
    const id = state.token as string;
    ageSession(id, 60 * MINUTE);
    const before = panelStore().sessions.get(id)?.lastActivity;
    expect((await pollNewCasesAction({ desde: iso(Date.now()) })).ok).toBe(
      true,
    );
    expect(panelStore().sessions.get(id)?.lastActivity).toBe(before);
  });

  it("no session: SESSAO_EXPIRADA as a result (Addendum 2), no redirect, 0 count calls", async () => {
    state.token = undefined;
    const before = panelStore().calls.length;
    expect(await pollNewCasesAction({ desde: iso(Date.now()) })).toEqual({
      ok: false,
      code: "SESSAO_EXPIRADA",
    });
    expect(panelStore().calls.length).toBe(before);
  });

  it("a session the API rejects at /me: SESSAO_EXPIRADA, and no count call", async () => {
    panelStore().sessions.clear();
    expect(await pollNewCasesAction({ desde: iso(Date.now()) })).toEqual({
      ok: false,
      code: "SESSAO_EXPIRADA",
    });
    expect(accountCalls().filter((call) => call.path === "/v1/cases")).toEqual(
      [],
    );
  });

  it("a failed count (poll-falha): FAILED, silently", async () => {
    setCaseFault(email, "poll", { kind: "503", times: 1 });
    expect(await pollNewCasesAction({ desde: iso(Date.now()) })).toEqual({
      ok: false,
      code: "FAILED",
    });
  });
});
