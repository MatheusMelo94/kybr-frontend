import { expect, test } from "@playwright/test";

import { alertMail, seedAlerts, sweep } from "../fixtures/alerts-mock.ts";
import { SETTLE, holdNextAction } from "../fixtures/fila-timing.ts";
import { createAccount, logIn, uniqueEmail } from "../fixtures/panel-mock.ts";

// T126: AC 47 (success criterion 2, against MSW), at 1280 and on the phone
// projects: the sweep finds a critical change → the e-mail's /fila/{caseId}
// link → login (ADR-0009 volta) → the alert's case → Bloquear → the
// Monitoramento shows it decided, and the nav count drops by one (QA Q1/Q2).
// Security A-F3: login.spec.ts (M4) already proves //evil.example,
// https://evil.example/x, /\evil.example and /v/… land home; the
// encoded %2F%2Fevil.example is added here.

const CNPJ = "12ABC34501DE35"; // synthetic, the link's wire form

test.describe("AC 47: alert e-mail → case → Bloquear → decided (T126) @feature-ops-panel @panel-alertas @panel-phone", () => {
  test("the journey, with the nav count", async ({
    page,
    request,
  }, testInfo) => {
    const phone = (page.viewportSize()?.width ?? 1280) < 1024;
    const email = uniqueEmail("mon-ac47", testInfo);
    await createAccount(request, email);
    await seedAlerts(request, email, "semalertas");
    const { case_id: caseId } = await sweep(request, email, {
      cnpj: CNPJ,
      tipo: "SITUACAO_IRREGULAR",
    });
    expect(caseId).toBeTruthy();

    // D-M3: the mail's subject and its CTA link.
    const mail = await alertMail(request, email);
    expect(mail?.assunto).toMatch(/^Alerta crítico: /);
    const link = new URL(mail?.link ?? "");
    expect(link.origin).toBe("https://app.kybr.com.br");
    expect(link.pathname).toBe(`/fila/${caseId}`);

    // No session: the link goes through login and back (ADR-0009).
    await page.goto(link.pathname);
    await page.waitForURL(
      `**/entrar?volta=${encodeURIComponent(link.pathname)}`,
    );
    const entrar = new URL(page.url());
    await logIn(page, email, undefined, entrar.pathname + entrar.search);
    await expect(page).toHaveURL(new RegExp(`/fila/${caseId}$`));

    // The alert's case: origin Alerta, what changed, Manter aprovado.
    const heading = page.locator("[data-detail-heading]:visible");
    await expect(heading).toBeVisible();
    const detail = page.locator("main");
    await expect(
      detail.getByText("O que mudou").filter({ visible: true }).first(),
    ).toBeVisible();
    await expect(
      detail
        .getByRole("button", { name: "Manter aprovado", exact: true })
        .filter({ visible: true }),
    ).toBeVisible();

    // The count before: one undecided critical alert.
    const navLink = page
      .getByRole("navigation", { name: "Navegação do painel" })
      .filter({ visible: true })
      .getByRole("link", { name: /^Monitoramento/ });
    await expect(navLink).toHaveAccessibleName(
      "Monitoramento 1 alerta crítico sem decisão",
    );

    // Bloquear with a reason; the call is held, not raced (P6-005).
    await detail
      .getByRole("button", { name: "Bloquear", exact: true })
      .filter({ visible: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    if (phone) {
      // A bottom sheet: full width, flush with the bottom, once it slid up.
      const viewport = page.viewportSize() ?? { width: 360, height: 780 };
      await expect(async () => {
        const box = await dialog.boundingBox();
        expect(box?.width).toBeCloseTo(viewport.width, 0);
        expect((box?.y ?? 0) + (box?.height ?? 0)).toBeCloseTo(
          viewport.height,
          0,
        );
      }).toPass();
    }
    await dialog.getByRole("radio", { name: "Outro motivo" }).check();
    const release = await holdNextAction(page, caseId ?? "");
    await dialog.getByRole("button", { name: "Bloquear vendedor" }).click();
    await expect(
      dialog.getByRole("button", { name: "Bloqueando…" }),
    ).toBeVisible();
    release();
    await expect(
      page.getByRole("status").filter({ hasText: /Bloqueado: / }),
    ).toBeVisible(SETTLE);

    // The Monitoramento: the alert reads decided, no Decidir; the count dropped.
    await page.goto("/monitoramento");
    const row = page
      .locator("main")
      .getByRole("article", { name: /ficou inapta na Receita\.$/ });
    await expect(row.getByText("Decidido: Bloqueado")).toBeVisible();
    await expect(row.getByRole("link")).toHaveCount(0);
    await expect(navLink).toHaveAccessibleName("Monitoramento");
  });

  test("A-F3: an encoded //evil volta (%2F%2Fevil.example) lands on the panel home", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("mon-volta", testInfo);
    await createAccount(request, email);
    await logIn(
      page,
      email,
      undefined,
      `/entrar?volta=${encodeURIComponent("%2F%2Fevil.example")}`,
    );
    await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:3000\/(fila)?$/);
  });
});
