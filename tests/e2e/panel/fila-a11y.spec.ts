import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type TestInfo,
} from "@playwright/test";

import { expectNoAxeViolations } from "../fixtures/axe.ts";
import { MOCK_API } from "../fixtures/mock-api.ts";
import {
  caseFault,
  caseSeed,
  decideElsewhere,
  seedCases,
  type MockCase,
} from "../fixtures/fila-mock.ts";
import {
  createAccount,
  horizontalOverflow,
  logIn,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";

// T115: the Fila's accessibility pass (AC 45, 67, 69, 70, 71, 72, 73, 74,
// 76; spec § Accessibility Acceptance; QA J4). The J4 keyboard path at 1280,
// and axe in both themes plus the cross-cutting checks on every Fila state
// at 1280 and on the phone projects.

const SENTINEL = "MSG-BACKEND-NAO-EXIBIR";
const GENDERED = /bem-vind|obrigad|você mesm/i;
const UNKNOWN_ID = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";

const byKind = (cases: MockCase[], kind: string): MockCase => {
  const found = cases.find((c) => c.kind === kind);
  if (!found) throw new Error(`no ${kind} case`);
  return found;
};

/** AC 69: no amber or green text in main; the danger ink only on a late SLA or an error. */
async function signalText(page: Page): Promise<string[]> {
  return page.locator("main").evaluate((main) => {
    const probe = (token: string) => {
      const span = document.createElement("span");
      span.style.color = `var(${token})`;
      document.body.append(span);
      const color = getComputedStyle(span).color;
      span.remove();
      return color;
    };
    const forbidden = new Set([
      probe("--color-success"),
      probe("--color-warning"),
    ]);
    const danger = probe("--color-danger-ink");
    const wrong: string[] = [];
    for (const element of main.querySelectorAll<HTMLElement>("*")) {
      if (element.getClientRects().length === 0) continue;
      const own = [...element.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? "")
        .join("")
        .trim();
      if (own === "") continue;
      const color = getComputedStyle(element).color;
      if (forbidden.has(color)) wrong.push(`signal: ${own.slice(0, 40)}`);
      const allowedDanger =
        element.closest("[role=alert]") !== null ||
        /^Atrasado há /.test(own) ||
        (element.id !== "" &&
          document.querySelector(`[aria-describedby~="${element.id}"]`) !==
            null);
      if (color === danger && !allowedDanger)
        wrong.push(`danger: ${own.slice(0, 40)}`);
    }
    return wrong;
  });
}

/** AC 71: every dot or mark is aria-hidden beside a word, also in grayscale. */
async function marksWithoutWords(page: Page): Promise<string[]> {
  await page.evaluate(() => {
    document.documentElement.style.filter = "grayscale(1)";
  });
  const bad = await page.locator("main").evaluate((main) =>
    [...main.querySelectorAll<HTMLElement>("svg, [data-status-dot]")]
      .filter((mark) => mark.getClientRects().length > 0)
      .filter(
        (mark) =>
          mark.closest("[aria-hidden=true]") === null ||
          // The word: the mark's control (its label or name) or its parent.
          ((control) =>
            (
              control?.getAttribute("aria-label") ??
              control?.textContent ??
              ""
            ).trim() === "")(
            mark.closest("label, button, li, [role=option]") ??
              mark.parentElement,
          ),
      )
      .map((mark) => mark.outerHTML.slice(0, 60)),
  );
  await page.evaluate(() => {
    document.documentElement.style.filter = "";
  });
  return bad;
}

/** AC 76: every seen CNPJ, count and time in main is in tabular figures. */
async function notTabular(page: Page): Promise<string[]> {
  return page.locator("main").evaluate((main) =>
    [...main.querySelectorAll<HTMLElement>("*")]
      .filter(
        (element) =>
          element.getClientRects().length > 0 &&
          element.closest(".sr-only") === null,
      )
      .filter((element) =>
        [...element.childNodes].some(
          (node) =>
            node.nodeType === Node.TEXT_NODE &&
            /[0-9A-Z]{2}\.[0-9A-Z]{3}\.[0-9A-Z]{3}\/[0-9A-Z]{4}-\d{2}|\b\d{2}:\d{2}\b|\(\d+\)/.test(
              node.textContent ?? "",
            ),
        ),
      )
      .filter(
        (element) =>
          !getComputedStyle(element).fontVariantNumeric.includes(
            "tabular-nums",
          ),
      )
      .map((element) => element.textContent?.trim().slice(0, 50) ?? ""),
  );
}

/** P6-002: the headings in the accessibility tree, in document order. */
async function outline(page: Page): Promise<number[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")]
      .filter(
        (heading) =>
          heading.getClientRects().length > 0 &&
          heading.closest("[aria-hidden=true], [inert]") === null,
      )
      .map((heading) => Number(heading.tagName.slice(1))),
  );
}

async function check(page: Page, label: string): Promise<void> {
  await expect(
    page.locator("h1:visible, h2:visible").first(),
    label,
  ).toBeVisible();
  // One h1 per screen (spec § Accessibility Acceptance), h1…h6 in order.
  await expect(page.getByRole("heading", { level: 1 }), label).toHaveCount(1);
  const levels = await outline(page);
  expect(
    levels.filter((level, index) => level > (levels[index - 1] ?? 0) + 1),
    `${label}: skipped heading level in ${levels.join(" ")}`,
  ).toEqual([]);
  const text = await page.locator("body").innerText();
  expect(text, `${label}: AC 67`).not.toContain(SENTINEL);
  expect(text, `${label}: AC 72`).not.toMatch(GENDERED);
  // Settled colours only: a collapse or a fade still running is a mid-frame.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
  await expectNoAxeViolations(page);
  await page.emulateMedia({ colorScheme: "light" });
  expect(await signalText(page), `${label}: AC 69`).toEqual([]);
  expect(await marksWithoutWords(page), `${label}: AC 71`).toEqual([]);
  expect(await notTabular(page), `${label}: AC 76`).toEqual([]);

  const viewport = page.viewportSize() ?? { width: 1280, height: 800 };
  for (const [width, scale] of [
    [320, "100%"],
    [viewport.width, "200%"],
  ] as const) {
    await page.setViewportSize({ width, height: viewport.height });
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = size;
    }, scale);
    expect(
      await horizontalOverflow(page),
      `${label}: AC 74 at ${width}px, ${scale} text`,
    ).toBeLessThanOrEqual(0);
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await page.setViewportSize(viewport);
}

async function account(
  request: APIRequestContext,
  testInfo: TestInfo,
  label: string,
  preset: Parameters<typeof seedCases>[2],
): Promise<{ email: string; cases: MockCase[] }> {
  const email = uniqueEmail(label, testInfo);
  await createAccount(request, email);
  return { email, cases: await seedCases(request, email, preset) };
}

const heading = (page: Page) => page.locator("[data-detail-heading]:visible");
const dialog = (page: Page) => page.getByRole("dialog");

test.describe("Fila accessibility: every state (T115) @feature-ops-panel @panel-fila @panel-phone", () => {
  test.setTimeout(300_000);

  test("the list states: loading, list, empty (both tabs), list error", async ({
    page,
    request,
  }, testInfo) => {
    const { email } = await account(
      request,
      testInfo,
      "a11y-fila-lista",
      "cada-tipo",
    );
    await logIn(page, email);

    await caseFault(request, email, "list", "delay", { ms: 8_000, times: 1 });
    await page.goto("/fila", { waitUntil: "commit" });
    await expect(page.getByTestId("fila-list-skeleton")).toBeVisible();
    await check(page, "loading");

    await page.goto("/fila");
    await expect(page.getByRole("listbox")).toBeVisible();
    await check(page, "list");

    const { email: vazia } = await account(
      request,
      testInfo,
      "a11y-fila-vazia",
      "vazia",
    );
    await page.context().clearCookies();
    await logIn(page, vazia);
    await page.goto("/fila");
    await expect(
      page.getByText("Nenhum caso aberto").locator("visible=true").first(),
    ).toBeVisible();
    await check(page, "empty (Para decidir)");
    await page.goto("/fila?aba=aguardando");
    await expect(
      page
        .getByText("Nenhum vendedor com documento pendente.")
        .locator("visible=true")
        .first(),
    ).toBeVisible();
    await check(page, "empty (Aguardando vendedor)");

    await caseSeed(request, vazia, "lista-falha");
    await page.goto("/fila");
    await expect(
      page.getByRole("button", { name: "Tentar de novo" }),
    ).toBeVisible();
    await check(page, "list error");
  });

  test("the detail states: each kind, decided, partial, detail error, not found; AC 73 a foreign case = an unknown one", async ({
    page,
    request,
  }, testInfo) => {
    const { email, cases } = await account(
      request,
      testInfo,
      "a11y-fila-caso",
      "cada-tipo",
    );
    await logIn(page, email);

    for (const kind of [
      "link",
      "lote-sem-qsa",
      "alerta",
      "nodata",
      "decidido-aprovar",
      "aguardando-sem-email",
    ]) {
      await page.goto(`/fila/${byKind(cases, kind).id}`);
      await expect(heading(page)).toBeVisible();
      await check(page, `detail ${kind}`);
    }

    await caseSeed(request, email, "eventos-falha", { n: 1 });
    await page.goto(`/fila/${byKind(cases, "link").id}`);
    await expect(heading(page)).toBeVisible();
    await check(page, "detail partial");

    await caseSeed(request, email, "detalhe-falha", { n: 1 });
    await page.goto(`/fila/${byKind(cases, "lote").id}`);
    await expect(
      page.getByText("Não conseguimos abrir este caso."),
    ).toBeVisible();
    await check(page, "detail error");

    await page.goto(`/fila/${UNKNOWN_ID}`);
    await check(page, "not found");
    const unknown = await page.locator("main").innerText();

    const { cases: foreign } = await account(
      request,
      testInfo,
      "a11y-fila-outro",
      "um",
    );
    await page.goto(`/fila/${foreign[0]?.id}`);
    expect(await page.locator("main").innerText()).toBe(unknown);
  });

  test("the decision states: both dialogs with errors, offline, conflict, decide error, the new-cases notice", async ({
    page,
    context,
    request,
  }, testInfo) => {
    const { email, cases } = await account(
      request,
      testInfo,
      "a11y-fila-decide",
      "cada-tipo",
    );
    await logIn(page, email);
    await page.goto(`/fila/${byKind(cases, "link").id}`);
    await expect(heading(page)).toBeVisible();

    const ask = page.getByRole("button", {
      name: "Pedir documento",
      exact: true,
    });
    await ask.focus();
    await ask.click();
    await dialog(page)
      .getByRole("button", { name: /^(Pedir documento|Pedir \d documentos)$/ })
      .click();
    await expect(
      dialog(page).getByText("Escolha pelo menos um documento."),
    ).toBeVisible();
    await check(page, "Pedir documento with an error");
    await page.keyboard.press("Escape");

    const block = page.getByRole("button", { name: "Bloquear", exact: true });
    await block.focus();
    await block.click();
    await dialog(page)
      .getByRole("button", { name: "Bloquear vendedor" })
      .click();
    await expect(dialog(page).getByText("Escolha um motivo.")).toBeVisible();
    await check(page, "Bloquear with an error");
    await page.keyboard.press("Escape");

    await context.setOffline(true);
    await expect(page.getByText(/^Sem conexão\./)).toBeVisible();
    await check(page, "offline");
    await context.setOffline(false);
    await expect(page.getByText(/^Sem conexão\./)).toHaveCount(0);

    await caseSeed(request, email, "decide-falha", { n: 1 });
    await page.getByRole("button", { name: "Aprovar", exact: true }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await check(page, "decide error");

    const lote = byKind(cases, "lote");
    await page.goto(`/fila/${lote.id}`);
    await expect(heading(page)).toBeVisible();
    await decideElsewhere(request, lote.id);
    await page.getByRole("button", { name: "Aprovar", exact: true }).click();
    await expect(
      page.getByText(/^Este caso já tinha sido decidido/),
    ).toBeVisible({
      timeout: 15_000,
    });
    await check(page, "conflict");

    // A case created after the list rendered is "new" (D3).
    await page.goto("/fila");
    await expect(page.getByRole("listbox")).toBeVisible();
    const created = await request.post(`${MOCK_API}/__mock/panel/cases`, {
      data: { email, slaInMs: 60_000 },
    });
    expect(created.status()).toBe(201);
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await expect(
      page.getByRole("status").filter({ hasText: /casos? novos?/ }),
    ).toHaveText(/1 caso novo/, { timeout: 15_000 });
    await check(page, "new-cases notice");
  });
});

test.describe("Fila keyboard path J4 at 1280 (T115) @feature-ops-panel @panel-fila", () => {
  test.skip(
    ({ viewport }) => (viewport?.width ?? 0) < 1024,
    "the two-pane J4 path",
  );

  /** What has focus: role or tag, and the accessible name or text. */
  const focused = (page: Page) =>
    page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element || element === document.body)
        return { name: "", role: "", ring: false, html: "body" };
      // A listbox shows focus on its active option (aria-activedescendant).
      const active = element.getAttribute("aria-activedescendant");
      const ringed =
        (active ? document.getElementById(active) : null) ?? element;
      const style = getComputedStyle(ringed);
      return {
        html: element.outerHTML.slice(0, 120),
        name:
          (element.getAttribute("aria-label") ?? element.innerText ?? "")
            .trim()
            .split("\n")[0] ?? "",
        role: element.getAttribute("role") ?? element.tagName.toLowerCase(),
        ring: style.outlineStyle !== "none" || style.boxShadow !== "none",
      };
    });

  test("AC 45: skip link → tabs → list (arrows, Enter) → the case → actions in order, dialogs trap and return focus; visible focus everywhere, no trap", async ({
    page,
    request,
  }, testInfo) => {
    const { email, cases } = await account(
      request,
      testInfo,
      "a11y-fila-j4",
      "cada-tipo",
    );
    expect(cases.filter((c) => c.estado === "aberto").length).toBeGreaterThan(
      2,
    );
    await logIn(page, email);
    await page.goto("/fila");
    await expect(page).toHaveURL(/\/fila\/[^/?]+/);
    await expect(heading(page)).toBeVisible();

    // The list streams after the case (Suspense): tab once it's there.
    await expect(page.getByRole("listbox")).toBeVisible();
    // The skip link is the first stop.
    await page.keyboard.press("Tab");
    expect((await focused(page)).name).toBe("Pular para o conteúdo");
    await page.keyboard.press("Enter");

    // Tab to the listbox, passing the tabs on the way.
    const seen: string[] = [];
    for (let i = 0; i < 40; i += 1) {
      await page.keyboard.press("Tab");
      const now = await focused(page);
      seen.push(now.name);
      expect(now.ring, `focus ring on ${now.html}`).toBe(true);
      if (now.role === "listbox") break;
    }
    expect(seen.some((name) => name.startsWith("Para decidir"))).toBe(true);
    expect((await focused(page)).role).toBe("listbox");
    const before = page.url();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page).not.toHaveURL(before);
    await expect(heading(page)).toBeFocused();
    await page.waitForLoadState("networkidle");
    await expect(heading(page)).toBeFocused();

    // From the heading, the actions come in the spec's order.
    const order: string[] = [];
    for (let i = 0; i < 60; i += 1) {
      await page.keyboard.press("Tab");
      const now = await focused(page);
      expect(now.ring, `focus ring on ${now.name}`).toBe(true);
      order.push(now.name);
      if (now.name === "Baixar comprovante") break;
    }
    const at = (name: string) => order.indexOf(name);
    const primary = Math.max(at("Aprovar"), at("Manter aprovado"));
    expect(primary).toBeGreaterThanOrEqual(0);
    expect(at("Pedir documento")).toBe(primary + 1);
    expect(at("Bloquear")).toBe(primary + 2);
    expect(at("Baixar comprovante")).toBe(primary + 3);

    // Each dialog traps focus and returns it to its trigger on Esc.
    for (const [trigger, back] of [
      ["Bloquear", 1],
      ["Pedir documento", 2],
    ] as const) {
      for (let i = 0; i < back; i += 1) await page.keyboard.press("Shift+Tab");
      expect((await focused(page)).name).toBe(trigger);
      await page.keyboard.press("Enter");
      await expect(dialog(page)).toBeVisible();
      for (let i = 0; i < 12; i += 1) {
        await page.keyboard.press("Tab");
        expect(
          // A native modal: Tab cycles its controls and may pass through
          // the browser's own UI (body), never the page behind it.
          await page.evaluate(
            () =>
              document.activeElement === document.body ||
              document.activeElement?.closest("dialog[open]") !== null,
          ),
          `${trigger}: focus never leaves the dialog for the page`,
        ).toBe(true);
      }
      await page.keyboard.press("Escape");
      await expect(dialog(page)).toBeHidden();
      expect((await focused(page)).name).toBe(trigger);
      // Back to Baixar comprovante for the next round.
      while ((await focused(page)).name !== "Baixar comprovante")
        await page.keyboard.press("Tab");
    }
  });
});
