import { expect, test } from "@playwright/test";

import { readFileSync } from "node:fs";

import { SETTLE, holdNextAction } from "../fixtures/fila-timing.ts";
import {
  dashboardFault,
  seedDashboard,
  settingsFault,
} from "../fixtures/home-mock.ts";
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
    await expect(queue.getByRole("listitem")).toHaveCount(4, SETTLE);
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

  test("T133 (AC 53): Primeiros passos leads a new workspace; Ocultar hides it after ok and for good @panel-phone", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("inicio-passos", testInfo);
    await seedDashboard(request, email, "novo");
    await logIn(page, email);

    const card = page.getByRole("region", { name: "Primeiros passos" });
    await expect(card).toBeVisible();
    await expect(page.getByRole("region").first()).toHaveAccessibleName(
      "Primeiros passos",
    );
    await expect(card.getByRole("listitem")).toHaveCount(3);
    await expect(
      card.getByRole("link", { name: "Ativar o monitoramento" }),
    ).toHaveAttribute("href", "/monitoramento");

    // Not optimistic: the card stays while the action is in flight.
    const release = await holdNextAction(page, "oculto");
    await card.getByRole("button", { name: "Ocultar" }).click();
    await expect(card.getByRole("button", { name: "Ocultar" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    await expect(card).toBeVisible();
    release();
    await expect(card).toHaveCount(0, SETTLE);

    // PH5: hidden for good.
    await page.reload();
    await expect(
      page
        .locator("#conteudo")
        .getByText("Comece verificando a base que você já tem."),
    ).toBeVisible();
    await expect(card).toHaveCount(0);
  });

  test("T133: Ocultar fails: error.network inline and the card stays", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("inicio-passos-falha", testInfo);
    await seedDashboard(request, email, "novo");
    await settingsFault(request, email, "first-steps", { kind: "503" });
    await logIn(page, email);

    const card = page.getByRole("region", { name: "Primeiros passos" });
    await card.getByRole("button", { name: "Ocultar" }).click();
    await expect(card.getByRole("alert")).toHaveText(
      "Não conseguimos falar com o servidor. Confira sua conexão e tente de novo.",
    );
    await expect(card).toBeVisible();
  });

  test("ADR-0008 Addendum 2: hideFirstStepsAction is owned by Início's page", async () => {
    const manifest = JSON.parse(
      readFileSync(".next/server/server-reference-manifest.json", "utf8"),
    ) as {
      node: Record<
        string,
        { exportedName?: string; workers: Record<string, unknown> }
      >;
    };
    const entry = Object.values(manifest.node).find(
      (value) => value.exportedName === "hideFirstStepsAction",
    );
    expect(Object.keys(entry?.workers ?? {})).toContain(
      "app/(panel)/painel/(app)/(inicio)/page",
    );
  });
});
