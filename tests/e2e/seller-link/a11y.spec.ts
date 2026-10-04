import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

import {
  CASE_PRESETS,
  CASE_TOKENS,
  MEI_CNPJS,
  cnpjFor,
  SLUGS,
} from "../../fixtures/factories/seller-link.ts";
import { gif, pdf } from "../../fixtures/factories/files.ts";
import { expectNoAxeViolations } from "../fixtures/axe.ts";
import {
  MOCK_API,
  createCase,
  failContactSaves,
} from "../fixtures/mock-api.ts";

// T34 (spec AC 33–35; DC § Accessibility Baseline; QA M3 plan § Breakpoint
// sweep). 360, 768 and 1280 are all first-class (user decision, 2026-10-04):
// every state at each width gets axe in light and dark, no horizontal scroll,
// 44 × 44 px targets, a Tab pass with the focus ring at every stop, and 200 %
// text; 768 and 1280 also get mouse hover and the wide-screen top spacing.
// Plus 320 px reflow and the whole journey by keyboard.

const WIDTHS = [360, 768, 1280] as const;

const ANALYSIS = "Sua empresa está em análise";

type Open = (page: Page, request: APIRequestContext) => Promise<void>;

const h1 = (page: Page, name?: string) =>
  page.getByRole("heading", { level: 1, ...(name && { name }) });

async function goto(page: Page, path: string, heading?: string) {
  await page.goto(path);
  await expect(h1(page, heading)).toBeVisible();
  // Client leaves (upload, e-mail block) hydrate before anything is measured.
  await page.waitForLoadState("networkidle");
}

async function caseWith(
  page: Page,
  request: APIRequestContext,
  input: Parameters<typeof createCase>[1],
  heading?: string,
) {
  const token = await createCase(request, input);
  await goto(page, `/v/${SLUGS.ok}/c/${token}`, heading);
  return token;
}

async function saveEmailDirect(
  request: APIRequestContext,
  token: string,
): Promise<void> {
  await request.put(`${MOCK_API}/public/v/${SLUGS.ok}/cases/${token}/contact`, {
    data: { email: "maria.exemplo@empresa-exemplo.test" },
  });
}

const STATES: [string, Open][] = [
  ["form", (page) => goto(page, `/v/${SLUGS.ok}`)],
  [
    "form, field errors",
    async (page) => {
      await goto(page, `/v/${SLUGS.ok}`);
      await page.getByRole("button", { name: "Verificar empresa" }).click();
      await expect(
        page.getByRole("textbox", { name: "CNPJ da empresa" }),
      ).toBeFocused();
    },
  ],
  [
    "form, company found (MEI, masked CPF)",
    async (page) => {
      await goto(page, `/v/${SLUGS.ok}`);
      await page
        .getByRole("textbox", { name: "CNPJ da empresa" })
        .pressSequentially(MEI_CNPJS.masked);
      await expect(page.getByTestId("company-block")).not.toHaveAttribute(
        "aria-busy",
      );
    },
  ],
  ["privacy notice", (page) => goto(page, `/v/${SLUGS.ok}/privacidade`)],
  ["link not found", (page) => goto(page, `/v/${SLUGS.unknown}`)],
  [
    "case not found",
    (page) => goto(page, `/v/${SLUGS.ok}/c/${CASE_TOKENS.unknown}`),
  ],
  [
    "verificando",
    (page, request) =>
      caseWith(page, request, {}, "Verificando sua empresa").then(() => {}),
  ],
  [
    "em análise (timeout), e-mail block",
    (page, request) =>
      caseWith(
        page,
        request,
        { ageMs: 11_000 },
        "Sua empresa está em análise",
      ).then(() => {}),
  ],
  [
    "em análise (no company data)",
    (page, request) =>
      caseWith(page, request, CASE_PRESETS.pendingNoItemsNoData).then(() => {}),
  ],
  [
    "quase lá, every item",
    (page, request) =>
      caseWith(page, request, CASE_PRESETS.pendingCatalogue, "Quase lá").then(
        () => {},
      ),
  ],
  [
    "quase lá, files received and e-mail saved",
    async (page, request) => {
      const token = await createCase(request, {
        kind: "pendente",
        ageMs: 60_000,
        uploads: { RESPONSAVEL: { files: 2, bytes: 4_000, format: "photos" } },
      });
      await saveEmailDirect(request, token);
      await goto(page, `/v/${SLUGS.ok}/c/${token}`, "Quase lá");
      await expect(page.getByText("Recebido: 2 arquivos")).toBeVisible();
    },
  ],
  [
    "tudo certo",
    (page) => goto(page, `/v/${SLUGS.ok}/c/${CASE_TOKENS.aprovado}`),
  ],
  [
    "não aprovado (regularize and contact)",
    (page) => goto(page, `/v/${SLUGS.ok}/c/${CASE_TOKENS.bloqueado}`),
  ],
  [
    "não aprovado (URL contact)",
    (page, request) =>
      caseWith(page, request, {
        slug: SLUGS.other,
        ...CASE_PRESETS.blocked.GENERICO,
      }).then(() => {}),
  ],
  [
    "em análise, offline banner",
    async (page, request) => {
      await page.context().setOffline(false);
      await caseWith(page, request, { ageMs: 11_000 }, ANALYSIS);
      await page.context().setOffline(true);
      await expect(
        page.getByRole("status").filter({ hasText: /^Sem conexão/ }),
      ).toBeVisible();
    },
  ],
  [
    "quase lá, e-mail field error",
    async (page, request) => {
      await caseWith(page, request, { kind: "pendente", ageMs: 60_000 });
      await page.getByRole("button", { name: "Salvar e-mail" }).click();
      await expect(page.getByText("Informe um e-mail.")).toBeVisible();
    },
  ],
  [
    "quase lá, e-mail network error",
    async (page, request) => {
      const token = await caseWith(page, request, {
        kind: "pendente",
        ageMs: 60_000,
      });
      await failContactSaves(request, token, 503);
      await page
        .getByRole("textbox", { name: "Seu e-mail para avisos" })
        .fill("maria.exemplo@empresa-exemplo.test");
      await page.getByRole("button", { name: "Salvar e-mail" }).click();
      await expect(
        page.getByText("Não conseguimos salvar o e-mail. Tente de novo."),
      ).toBeVisible();
    },
  ],
  [
    "quase lá, upload error",
    async (page, request) => {
      await caseWith(page, request, { kind: "pendente", ageMs: 60_000 });
      const chooser = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: "Enviar documento" }).click();
      await (await chooser).setFiles(gif());
      await expect(
        page.getByText("Formato não aceito. Envie PDF, JPG ou PNG."),
      ).toBeVisible();
    },
  ],
];

/**
 * Hovers every visible control with the mouse and returns the ones whose look
 * doesn't change (DC § Component States: hover, pointer-fine only). A field in
 * error keeps its danger border on hover, so it's left out.
 */
async function controlsWithoutHover(page: Page): Promise<string[]> {
  const controls = page.locator(
    'main a[href], main button:not([disabled]), main input:not([type="hidden"]):not([type="file"]):not([aria-invalid="true"])',
  );
  const missing: string[] = [];
  for (const control of await controls.all()) {
    if (!(await control.isVisible())) continue;
    const look = () =>
      control.evaluate((element) => {
        const style = getComputedStyle(element);
        return [
          style.backgroundColor,
          style.borderColor,
          style.color,
          style.textDecorationThickness,
        ].join("|");
      });
    await page.mouse.move(0, 0);
    const before = await look();
    await control.hover();
    // Transitions run for --duration-fast.
    await page.waitForTimeout(250);
    if ((await look()) === before)
      missing.push(((await control.textContent()) ?? "").trim().slice(0, 40));
  }
  return missing;
}

/** Every visible control's size, for the ones under 44 × 44 px. */
async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const controls = document.querySelectorAll<HTMLElement>(
      'a[href], button, input:not([type="hidden"]):not([type="file"]), select, textarea, [role="button"], [tabindex="0"]',
    );
    return [...controls]
      .filter((control) => control.getClientRects().length > 0)
      .map((control) => ({ control, box: control.getBoundingClientRect() }))
      .filter(({ box }) => box.width < 44 || box.height < 44)
      .map(
        ({ control, box }) =>
          `${control.tagName.toLowerCase()} "${(control.textContent || control.getAttribute("aria-label") || "").trim().slice(0, 40)}" ${Math.round(box.width)}×${Math.round(box.height)}`,
      );
  });
}

/**
 * Tabs through the page from the top and returns every stop that draws no
 * focus ring (DC § Accessibility Baseline: focus-visible always shown).
 */
async function stopsWithoutRing(page: Page): Promise<string[]> {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  const missing: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element || element === document.body) return null;
      const style = getComputedStyle(element);
      const path: string[] = [];
      for (let node: Element | null = element; node; node = node.parentElement)
        path.unshift(
          `${node.tagName}:${[...(node.parentElement?.children ?? [])].indexOf(node)}`,
        );
      return {
        key: path.join("/"),
        name: (element.getAttribute("aria-label") ?? element.textContent ?? "")
          .trim()
          .slice(0, 40),
        ring: style.outlineStyle !== "none" && style.outlineWidth !== "0px",
      };
    });
    // Back at the top (or out to the browser): every stop was visited.
    if (stop === null || seen.has(stop.key)) break;
    seen.add(stop.key);
    if (!stop.ring) missing.push(stop.name);
  }
  // A page with controls must have been walked (Link not found has none).
  const controls = await page
    .locator('main a[href], main button, main input:not([type="hidden"])')
    .count();
  if (controls > 0)
    expect(seen.size, "the Tab pass reached the controls").toBeGreaterThan(0);
  return missing;
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
}

test.describe("accessibility and breakpoints @feature-seller-link", () => {
  for (const [path, heading] of [
    [`/v/${SLUGS.ok}`, undefined],
    [`/v/${SLUGS.ok}/c/${CASE_TOKENS.aprovado}`, undefined],
  ] as const) {
    test(`wide screens: the same centered column sits lower at 768 and 1024+ (${path})`, async ({
      page,
    }) => {
      const main = page.locator("main");
      for (const [width, top] of [
        [360, "32px"],
        [768, "64px"],
        [1024, "96px"],
        [1280, "96px"],
      ] as const) {
        await page.setViewportSize({ width, height: 900 });
        await goto(page, path, heading);
        expect(
          await main.evaluate((m) => getComputedStyle(m).paddingTop),
          `${width}px`,
        ).toBe(top);
        const box = await main.evaluate((m) => {
          const { left, width: w } = m.getBoundingClientRect();
          return { left, width: w };
        });
        expect(box.width, `${width}px column`).toBeLessThanOrEqual(480);
        // Centered: the same margin on both sides.
        expect(
          Math.abs(width - (box.left + box.width) - box.left),
          `${width}px centered`,
        ).toBeLessThanOrEqual(1);
      }
    });
  }

  for (const [name, open] of STATES) {
    test(`hover: every control in ${name} changes on mouse hover at 768 and 1280`, async ({
      page,
      request,
    }, testInfo) => {
      test.skip(
        testInfo.project.use.hasTouch === true,
        "hover is for fine pointers (mouse) only",
      );
      for (const width of [768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await open(page, request);
        expect(await controlsWithoutHover(page), `${width}px`).toEqual([]);
      }
    });
  }

  for (const [name, open] of STATES) {
    test(`AC 34 / AC 35: ${name} at 360, 768 and 1280: axe in light and dark, no horizontal scroll, 44 px targets, a focus ring at every Tab stop`, async ({
      page,
      request,
    }) => {
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await open(page, request);

        expect(
          await horizontalOverflow(page),
          `${width}px`,
        ).toBeLessThanOrEqual(0);
        expect(await smallTargets(page), `${width}px`).toEqual([]);
        await expectNoAxeViolations(page);
        expect(await stopsWithoutRing(page), `${width}px`).toEqual([]);
      }
    });

    test(`reflow: ${name} at 320 px, and with text at 200 % at 360, 768 and 1280`, async ({
      page,
      request,
    }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await open(page, request);
      expect(await horizontalOverflow(page), "320px").toBeLessThanOrEqual(0);

      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await open(page, request);
        await page.evaluate(() => {
          document.documentElement.style.fontSize = "200%";
        });
        expect(
          await horizontalOverflow(page),
          `200 % text at ${width}px`,
        ).toBeLessThanOrEqual(0);
        expect(await smallTargets(page), `200 % text at ${width}px`).toEqual(
          [],
        );
      }
    });
  }

  test("AC 33: form → submit → result → e-mail → upload by keyboard alone, with a visible focus ring at every stop", async ({
    page,
  }) => {
    /** The focused element, with whether it draws a ring. */
    const focused = () =>
      page.evaluate(() => {
        const element = document.activeElement as HTMLInputElement;
        const style = getComputedStyle(element);
        return {
          name:
            element.getAttribute("aria-label") ??
            (
              element.labels?.[0]?.textContent ||
              element.textContent ||
              ""
            ).trim(),
          ring: style.outlineStyle !== "none" && style.outlineWidth !== "0px",
        };
      });
    const tabTo = async (name: string | RegExp) => {
      await page.keyboard.press("Tab");
      const now = await focused();
      expect(now.name).toMatch(name);
      expect(now.ring, `focus ring on ${now.name}`).toBe(true);
    };

    // Listen from the start: Playwright turns file-chooser interception on
    // asynchronously, and a keypress right after waitForEvent() can beat it.
    const chooser = page.waitForEvent("filechooser", { timeout: 60_000 });
    await goto(page, `/v/${SLUGS.ok}`);
    await tabTo("CNPJ da empresa");
    await page.keyboard.type(cnpjFor("pendente"));
    await tabTo("Nome completo do responsável");
    await page.keyboard.type("Maria Exemplo");
    await tabTo("Verificar empresa");
    await page.keyboard.press("Enter");

    await expect(h1(page, "Verificando sua empresa")).toBeFocused();
    const result = h1(page, "Quase lá");
    await expect(result).toBeFocused({ timeout: 10_000 });
    expect((await focused()).ring).toBe(true);

    // Spec § Keyboard path: each item's action, then the e-mail field and
    // "Salvar e-mail", then the contact actions and the privacy link.
    await tabTo("Enviar documento");
    await tabTo("Como regularizar");
    await tabTo("Seu e-mail para avisos");
    await page.keyboard.type("maria.exemplo@empresa-exemplo.test");
    await tabTo("Salvar e-mail");
    await page.keyboard.press("Enter");
    await expect(
      page.getByText(
        "E-mail salvo. Vamos avisar em maria.exemplo@empresa-exemplo.test.",
      ),
    ).toBeVisible();

    // Back to the item's upload once the save has settled, by keyboard.
    await page.waitForLoadState("networkidle");
    const upload = page.getByRole("button", { name: "Enviar documento" });
    for (
      let i = 0;
      i < 10 && !(await upload.evaluate((b) => b === document.activeElement));
      i++
    )
      await page.keyboard.press("Shift+Tab");
    await expect(upload).toBeFocused();
    expect((await focused()).ring).toBe(true);
    await page.keyboard.press("Enter");
    await (await chooser).setFiles(pdf(4_000, "contrato.pdf"));
    await expect(page.getByText("Recebido: 1 arquivo")).toBeVisible();
  });
});
