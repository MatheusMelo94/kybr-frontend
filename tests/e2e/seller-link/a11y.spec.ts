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
import { pdf } from "../../fixtures/factories/files.ts";
import { expectNoAxeViolations } from "../fixtures/axe.ts";
import { MOCK_API, createCase } from "../fixtures/mock-api.ts";

// T34 (spec AC 33–35; DC § Accessibility Baseline; QA M3 plan § Breakpoint
// sweep): every state at 360, 768 and 1280 (axe in light and dark, no
// horizontal scroll), 44 × 44 px targets at 360, 320 px reflow, 200 % text,
// and the whole journey by keyboard.

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
];

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

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
}

test.describe("accessibility and breakpoints @feature-seller-link", () => {
  for (const [name, open] of STATES) {
    test(`AC 34 / AC 35: ${name} at 360, 768 and 1280: axe in light and dark, no horizontal scroll, 44 px targets at 360`, async ({
      page,
      request,
    }) => {
      for (const width of [360, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await open(page, request);

        expect(
          await horizontalOverflow(page),
          `${width}px`,
        ).toBeLessThanOrEqual(0);
        if (width === 360) expect(await smallTargets(page)).toEqual([]);
        await expectNoAxeViolations(page);
      }
    });

    test(`reflow: ${name} at 320 px, and with text at 200 %`, async ({
      page,
      request,
    }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await open(page, request);
      expect(await horizontalOverflow(page), "320px").toBeLessThanOrEqual(0);

      await page.setViewportSize({ width: 768, height: 900 });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      expect(await horizontalOverflow(page), "200 % text").toBeLessThanOrEqual(
        0,
      );
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
