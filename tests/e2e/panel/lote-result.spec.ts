import { expect, test, type Page } from "@playwright/test";

import { expectNoAxeViolations } from "../fixtures/axe.ts";
import {
  createAccount,
  createBatch,
  holdBatch,
  logIn,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";

// T82: the result (AC 20, AC 21 legend half, AC 69, 70, 71, 76; QA Q4).

/** The computed colour of a token, for comparisons. */
async function tokenColor(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, token);
}

test.describe("Lote: the result @feature-ops-panel @panel-lote", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("summary, legend with Não consultados, the errors line and the real breakdown; DDR-0003 text colours; axe clean", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("lote-resultado", testInfo);
    await createAccount(request, email, "pago");
    const id = await createBatch(request, email, "ac16", { finish: true });
    await logIn(page, email);
    await page.goto(`/lote/${id}`);

    // The result's block: from its heading to the errors line.
    const result = page
      .locator("main div", {
        has: page.getByRole("heading", { name: "Resultado" }),
      })
      .filter({ has: page.getByRole("list") })
      .last();
    await expect(
      result.getByText("181 CNPJs consultados em 41 s.", { exact: true }),
    ).toBeVisible();
    const legend = result.getByRole("listitem");
    await expect(legend).toHaveText([
      /^Tudo certo\d+$/,
      /^Atenção\d+$/,
      /^Crítico\d+$/,
      "Não consultados3",
    ]);
    await expect(
      result.getByText(
        "3 CNPJs não foram consultados e não consumiram verificações.",
      ),
    ).toBeVisible();
    await expect(
      page.locator("svg[aria-hidden='true'] circle[data-arc]"),
    ).toHaveCount(4);

    const why = page.getByRole("region", { name: "O que isso resolve" });
    await expect(
      why.getByText(/vendedores? inaptos? ou baixados?/),
    ).toBeVisible();
    await expect(why.getByText(/sem inscrição estadual/)).toBeVisible();

    // DDR-0003 / AC 71: text in ink or ink-muted only; status by word.
    const allowed = [
      await tokenColor(page, "--color-ink"),
      await tokenColor(page, "--color-ink-muted"),
    ];
    const colors = await result.evaluate((section) =>
      [...section.querySelectorAll("h2, p, li, span")]
        .filter(
          (el) =>
            (el.textContent ?? "").trim() !== "" &&
            !el.closest("[aria-hidden], button, a"),
        )
        .map((el) => getComputedStyle(el).color),
    );
    for (const color of colors) expect(allowed).toContain(color);
    // AC 76: the numbers in tabular figures.
    const numerals = await result
      .getByRole("listitem")
      .locator("span.tabular-nums")
      .evaluateAll((els) =>
        els.map((el) => getComputedStyle(el).fontVariantNumeric),
      );
    expect(numerals.every((value) => value.includes("tabular-nums"))).toBe(
      true,
    );
    await expectNoAxeViolations(page);
  });

  test("an end seen live with focus in the progress region: focus moves to Resultado, and the summary is announced", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("lote-foco", testInfo);
    await createAccount(request, email, "pago");
    const id = await createBatch(request, email, "tudo-ok", { hold: true });
    await logIn(page, email);
    await page.goto(`/lote/${id}`);
    await expect(
      page.getByRole("heading", { name: "Verificando 3 CNPJs" }),
    ).toBeFocused();
    await holdBatch(request, id, false);
    const heading = page.getByRole("heading", { name: "Resultado" });
    await expect(heading).toBeFocused({ timeout: 15_000 });
    await expect(
      page
        .locator("main")
        .getByRole("status")
        .filter({ hasText: "3 CNPJs consultados em" }),
    ).toHaveCount(1);
  });

  test("an end seen live with focus elsewhere: focus stays, and the summary is still announced", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("lote-foco-fora", testInfo);
    await createAccount(request, email, "pago");
    const id = await createBatch(request, email, "tudo-ok", { hold: true });
    await logIn(page, email);
    await page.goto(`/lote/${id}`);
    // Arrival focus first (QA Q6), then Renata moves it.
    await expect(
      page.getByRole("heading", { name: "Verificando 3 CNPJs" }),
    ).toBeFocused();
    const fila = page
      .locator("aside")
      .getByRole("link", { name: /^Fila de revisão/ });
    await fila.focus();
    await holdBatch(request, id, false);
    await expect(page.getByRole("heading", { name: "Resultado" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page
        .locator("main")
        .getByRole("status")
        .filter({ hasText: "3 CNPJs consultados em" }),
    ).toHaveCount(1);
    await expect(fila).toBeFocused();
  });

  test("reduced motion: the donut renders final at once (AC 70)", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("lote-movimento", testInfo);
    await createAccount(request, email, "pago");
    const id = await createBatch(request, email, "misto-sem-erro", {
      finish: true,
    });
    await logIn(page, email);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/lote/${id}`);
    const arc = page.locator("circle[data-arc]").first();
    expect(
      await arc.evaluate((el) => getComputedStyle(el).transitionProperty),
    ).toBe("none");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.reload();
    const timing = await page
      .locator("circle[data-arc]")
      .first()
      .evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(timing).toBe("0.45s");
  });
});
