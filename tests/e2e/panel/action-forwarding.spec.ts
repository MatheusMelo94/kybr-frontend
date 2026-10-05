import { expect, test, type APIRequestContext } from "@playwright/test";

import { actionId } from "../fixtures/actions.ts";
import {
  LINK_URL,
  PANEL_URL,
  callsFor,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";

// Next 15 forwards an action a page doesn't own to its owning page, and host
// routing once made that chain without end (one request exhausted the
// server's memory). Middleware now refuses any forwarded action and any
// action on a path no action posts to. Each replay ends at once (a 404, or
// Next's single-hop "{}"), with no API call, and the server stays up.

async function replay(
  request: APIRequestContext,
  url: string,
  id: string,
  email: string,
  accept = "text/html",
): Promise<{ status: number; body: string; ms: number }> {
  const started = Date.now();
  const response = await request.post(url, {
    headers: {
      "next-action": id,
      "content-type": "text/plain;charset=UTF-8",
      accept,
      origin: new URL(url).origin,
    },
    data: JSON.stringify([{ email, senha: "senha-correta-123" }]),
    timeout: 10_000,
    maxRedirects: 0,
  });
  return {
    status: response.status(),
    body: await response.text(),
    ms: Date.now() - started,
  };
}

test.describe("Server Action forwarding never chains @feature-ops-panel @panel-access", () => {
  const cases = [
    [
      "a panel id on the link host's /v/loja-exemplo",
      LINK_URL,
      "/v/loja-exemplo",
      "loginAction",
    ],
    [
      "a panel id on the link host's /entrar",
      LINK_URL,
      "/entrar",
      "loginAction",
    ],
    [
      "loginAction on the panel host's /qualquer",
      PANEL_URL,
      "/qualquer",
      "loginAction",
    ],
    [
      "loginAction on the panel host's /painel/x",
      PANEL_URL,
      "/painel/x",
      "loginAction",
    ],
    [
      "startVerification (the link's) on the panel host's /entrar",
      PANEL_URL,
      "/entrar",
      "startVerification",
    ],
  ] as const;

  for (const [name, origin, path, action] of cases)
    test(`${name}: ends at once, no API call, the server stays up`, async ({
      request,
    }, testInfo) => {
      const email = uniqueEmail("encaminhada", testInfo);
      for (const accept of ["text/html", "text/x-component"]) {
        const { status, body, ms } = await replay(
          request,
          `${origin}${path}`,
          actionId(action),
          email,
          accept,
        );
        expect(ms).toBeLessThan(3_000);
        expect([200, 404]).toContain(status);
        if (status === 200) expect(body).toBe("{}");
      }
      expect(await callsFor(request, email)).toEqual([]);
      expect((await request.get(`${origin}/api/health`)).status()).toBe(200);
    });
});
