import { expect, test } from "@playwright/test";

import { dashboardFault, seedDashboard } from "../fixtures/home-mock.ts";
import { logIn, uniqueEmail } from "../fixtures/panel-mock.ts";

// T132: Início (S9; AC 53 greeting half, AC 54) from one D-H1 read: the
// greeting, summary, KPIs, queue and feed cards, per-card errors (PH3), the
// whole-call error (PH4), the copy link, and O-F4 masking in the HTML.

const GREETING = /^(Bom dia|Boa tarde|Boa noite), [^.]+\.$/;

test.describe("Início @feature-ops-panel @panel-operacao", () => {
  test("PH1: greeting, KPIs, the oldest cases linking to the Fila, the newest alerts; CPFs masked in the page @panel-phone", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("inicio", testInfo);
    await seedDashboard(request, email, "populado");
    await logIn(page, email);

    await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:3000\/$/);
    await expect(page).toHaveTitle("Início · Kybr");
    await expect(
      page.getByRole("heading", { level: 1, name: GREETING }),
    ).toBeVisible();
    await expect(page.getByText("1.240", { exact: true })).toBeVisible();

    const queue = page.getByRole("region", { name: "Precisa da sua atenção" });
    await expect(queue.getByRole("listitem")).toHaveCount(4);
    await expect(queue.getByText("Fulano ***.***.***-** ME")).toBeVisible();
    const feed = page.getByRole("region", { name: "Mudanças na base" });
    await expect(feed.getByRole("listitem")).toHaveCount(4);

    // O-F4: the CPF never reaches the page, in either form.
    const html = await page.content();
    expect(html).not.toMatch(/123\.456\.789-09|12345678909/);

    const first = queue.getByRole("listitem").first().getByRole("link");
    const href = (await first.getAttribute("href")) ?? "";
    expect(href).toMatch(/^\/fila\/[A-Za-z0-9_-]+$/);
    await first.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
  });

  test("PH2: a new workspace: home.summary.none, no KPIs, queue or feed", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("inicio-novo", testInfo);
    await seedDashboard(request, email, "novo");
    await logIn(page, email);
    await expect(
      page.getByText("Comece verificando a base que você já tem."),
    ).toBeVisible();
    await expect(page.getByText("vendedores verificados")).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Precisa da sua atenção" }),
    ).toHaveCount(0);
  });

  test("PH3: each missing card fails alone; its retry loads it", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("inicio-parcial", testInfo);
    await seedDashboard(request, email, "populado");
    await dashboardFault(request, email, {
      kind: "omit",
      sem: ["fila", "alertas"],
    });
    await logIn(page, email);

    const queue = page.getByRole("region", { name: "Precisa da sua atenção" });
    await expect(queue.getByText("Esta parte não carregou.")).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Mudanças na base" })
        .getByText("Esta parte não carregou."),
    ).toBeVisible();
    await expect(page.getByText("vendedores verificados")).toBeVisible();

    await dashboardFault(request, email, { kind: null });
    await queue.getByRole("button", { name: "Tentar de novo" }).click();
    await expect(queue.getByRole("listitem")).toHaveCount(4);
  });

  test("PH4: the whole call fails: error.load.* with a retry", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("inicio-falha", testInfo);
    await seedDashboard(request, email, "populado");
    await dashboardFault(request, email, { kind: "503" });
    await logIn(page, email);
    await expect(
      page.getByRole("heading", { level: 2, name: "Não carregou" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Tentar de novo" }),
    ).toBeVisible();
  });

  test("Copiar link de cadastro: toast.link_copied", async ({
    page,
    context,
    request,
    browserName,
  }, testInfo) => {
    test.skip(browserName !== "chromium", "clipboard permissions: chromium");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const email = uniqueEmail("inicio-link", testInfo);
    await seedDashboard(request, email, "populado");
    await logIn(page, email);
    await page.getByRole("button", { name: "Copiar link de cadastro" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Link copiado" }),
    ).toBeVisible();
  });
});
