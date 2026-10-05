// @vitest-environment node
import { readdirSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { openSession, panelStore } from "@/tests/fixtures/msw/panel-store";
import { PANEL_EMAILS } from "@/tests/fixtures/factories/panel";

// Security M4-05: no E2E can reach a panel action's body off the panel host
// (middleware and Next's action forwarding stop it first), so this proves
// the defense-in-depth layer directly. Every exported action of every
// features/panel-*/actions.ts, called with a link host and a live session
// cookie, is a 404 (assertPanelHost) before any API call. A new action that
// forgets assertPanelHost() fails here.

const state = vi.hoisted(() => ({
  headers: new Headers(),
  token: undefined as string | undefined,
}));
vi.mock("next/headers", () => ({ headers: async () => state.headers }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
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
  readSignupCookie: async () => ({
    ticket: "t".repeat(32),
    nome: "Pessoa",
    workspace: "Plataforma",
    email: PANEL_EMAILS.pendente,
  }),
  setSessionCookie: vi.fn(),
  setSignupCookie: vi.fn(),
  deleteSessionCookie: vi.fn(),
  deleteSignupCookie: vi.fn(),
}));
vi.mock("@/lib/monitoring", () => ({ reportMarker: vi.fn() }));

const MODULES = readdirSync("features")
  .filter((dir) => dir.startsWith("panel-"))
  .flatMap((dir) =>
    readdirSync(`features/${dir}`)
      .filter((file) => file === "actions.ts")
      .map(() => dir),
  );

const actions: [string, (...args: unknown[]) => Promise<unknown>][] = [];
for (const dir of MODULES) {
  const exported = (await import(`@/features/${dir}/actions`)) as Record<
    string,
    unknown
  >;
  for (const [name, value] of Object.entries(exported))
    if (typeof value === "function")
      actions.push([
        `${dir}.${name}`,
        value as (...args: unknown[]) => Promise<unknown>,
      ]);
}

beforeEach(() => {
  state.headers = new Headers({
    host: "kybr.test",
    "x-forwarded-for": "203.0.113.9",
  });
  state.token = openSession(PANEL_EMAILS.renata).id;
});

describe("every panel Server Action checks the host first (P03.2, M4-05)", () => {
  it("finds the panel's action modules and their actions", () => {
    expect(MODULES.length).toBeGreaterThanOrEqual(3);
    expect(actions.length).toBeGreaterThanOrEqual(9);
  });

  it.each(actions)(
    "%s off the panel host: 404 and no API call",
    async (_name, action) => {
      const before = panelStore().calls.length;
      await expect(
        action({
          email: PANEL_EMAILS.renata,
          senha: "senha-correta-123",
          codigo: "123456",
        }),
      ).rejects.toThrow("NEXT_NOT_FOUND");
      expect(panelStore().calls.length).toBe(before);
    },
  );
});
