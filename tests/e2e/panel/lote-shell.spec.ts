import { expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "../fixtures/axe.ts";
import {
  callsFor,
  createAccount,
  createBatch,
  horizontalOverflow,
  logIn,
  seed,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";

// T77: the Lote nav item, /lote's empty state and history, the D1 redirect,
// and /lote/[batchId]'s not found (spec S7, AC 26, AC 73; S5 batch running).

const COST = "Cada CNPJ consome uma verificação do seu plano.";
const UNKNOWN = "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a";

test.describe("Lote: routes and history @feature-ops-panel @panel-lote", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the nav has Verificar em lote after the Fila; /lote shows the empty state in two columns; axe clean", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("lote-vazio", testInfo);
    await createAccount(request, email, "pago");
    await logIn(page, email);

    const nav = page
      .locator("aside")
      .getByRole("navigation", { name: "Navegação do painel" });
    await expect(nav.getByRole("link")).toHaveText([
      /^Fila de revisão/,
      /^Monitoramento/,
      "Verificar em lote",
    ]);
    await nav.getByRole("link", { name: "Verificar em lote" }).click();
    await page.waitForURL("**/lote");

    const main = page.locator("main");
    await expect(
      main.getByRole("heading", { level: 1, name: "Verificar em lote" }),
    ).toBeVisible();
    await expect(
      main.getByText(
        "Suba a lista de vendedores que já estão na plataforma e veja a situação de cada um hoje.",
      ),
    ).toBeVisible();
    await expect(main.getByText(COST)).toBeVisible();
    await expect(
      main.getByText("Você tem 3.760 verificações disponíveis."),
    ).toBeVisible();
    const why = main.getByRole("heading", { name: "O que isso resolve" });
    await expect(why).toBeVisible();
    await expect(
      main.getByRole("heading", { name: "Lotes anteriores" }),
    ).toHaveCount(0);
    await expect(
      nav.getByRole("link", { name: "Verificar em lote" }),
    ).toHaveAttribute("aria-current", "page");

    // Two columns at 1280: the side card sits to the right of the heading's column.
    const heading = await main.getByRole("heading", { level: 1 }).boundingBox();
    const side = await main.getByText(COST).boundingBox();
    expect(side?.x ?? 0).toBeGreaterThan((heading?.x ?? 0) + 400);

    await expectNoAxeViolations(page);
  });

  test("history: newest first, dd/mm/aaaa and {total}, running ones marked, each a link", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("lote-historico", testInfo);
    await createAccount(request, email, "pago");
    const running = await createBatch(request, email, "tudo-ok", { hold: true });
    const done = await createBatch(request, email, "ac16", { finish: true });
    await logIn(page, email);
    await page.goto("/lote");

    const history = page.getByRole("region", { name: "Lotes anteriores" });
    const links = history.getByRole("link");
    await expect(links).toHaveCount(2);
    await expect(links.nth(0)).toHaveAttribute("href", `/lote/${done}`);
    await expect(links.nth(0)).toHaveText(/^\d{2}\/\d{2}\/\d{4}: 184 CNPJs$/);
    await expect(links.nth(1)).toHaveAttribute("href", `/lote/${running}`);
    await expect(links.nth(1)).toHaveText(/: 3 CNPJs\s*Em andamento$/);

    await links.nth(0).click();
    await page.waitForURL(`**/lote/${done}`);
    await expect(page.getByRole("heading", { name: "Resultado" })).toBeVisible();
  });

  test("D1: with the newest batch processando, /lote opens it server-side; the nav says Verificando", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("lote-d1", testInfo);
    await createAccount(request, email, "pago");
    const id = await createBatch(request, email, "ac16", { hold: true });
    await logIn(page, email);

    await expect(
      page
        .locator("aside")
        .getByRole("link", { name: "Verificar em lote Verificando" }),
    ).toBeVisible();

    const response = await page.request.get("/lote", { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toMatch(new RegExp(`/lote/${id}$`));

    await page.goto("/lote");
    await page.waitForURL(`**/lote/${id}`);
    await expect(
      page.getByRole("heading", { name: "Verificando 184 CNPJs" }),
    ).toBeVisible();
    await expect(
      page.locator("main p").getByText("0 de 184", { exact: true }),
    ).toBeVisible();
  });

  test("a D-B6 failure shows lote.history.error inline; the rest of /lote works", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("lote-historico-falha", testInfo);
    await createAccount(request, email, "pago");
    await seed(request, "historico-falha", email);
    await logIn(page, email);
    await page.goto("/lote");

    await expect(
      page.getByText("Não conseguimos carregar os lotes anteriores."),
    ).toBeVisible();
    await expect(page.getByText(COST)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Verificar em lote",
    );
  });

  test("/lote/{id}: a malformed id 404s with no API call; unknown and foreign ids 404 the same", async ({
    page,
    request,
  }, testInfo) => {
    const owner = uniqueEmail("lote-dono", testInfo);
    await createAccount(request, owner, "pago");
    const foreign = await createBatch(request, owner, "tudo-ok", {
      finish: true,
    });
    const email = uniqueEmail("lote-404", testInfo);
    await createAccount(request, email, "pago");
    await logIn(page, email);

    const bodies: string[] = [];
    for (const id of ["curto", "lote_ABCDEFGHIJKLMNOP", UNKNOWN, foreign]) {
      const response = await page.goto(`/lote/${id}`);
      expect(response?.status(), id).toBe(404);
      const main = page.locator("main");
      await expect(
        main.getByRole("heading", { level: 1, name: "Lote não encontrado" }),
      ).toBeVisible();
      await expect(
        main.getByText("Ele não existe ou não pertence a esta conta."),
      ).toBeVisible();
      bodies.push(await main.innerText());
    }
    expect(new Set(bodies).size).toBe(1);

    const paths = (await callsFor(request, email)).map((call) => call.path);
    expect(paths.some((path) => path.includes("curto"))).toBe(false);
    expect(paths.some((path) => path.includes("lote_ABCDEFGHIJKLMNOP"))).toBe(
      false,
    );
    expect(paths).toContain(`/v1/batches/${UNKNOWN}`);
  });
});

test.describe("Lote below lg @feature-ops-panel @panel-lote @panel-phone", () => {
  test("one column (main, then the side cards); no page scroll at 320", async ({
    page,
    request,
  }, testInfo) => {
    test.skip(testInfo.project.name === "panel-desktop", "below lg only");
    const email = uniqueEmail("lote-coluna", testInfo);
    await createAccount(request, email, "pago");
    await createBatch(request, email, "tudo-ok", { finish: true });
    await logIn(page, email);
    await page.goto("/lote");

    const main = page.locator("main");
    const history = await main
      .getByRole("heading", { name: "Lotes anteriores" })
      .boundingBox();
    const cost = await main.getByText(COST).boundingBox();
    expect(cost?.y ?? 0).toBeGreaterThan(history?.y ?? 0);
    await page.setViewportSize({ width: 320, height: 700 });
    expect(await horizontalOverflow(page)).toBe(0);
  });
});
