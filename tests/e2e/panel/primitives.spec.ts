import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  NOTICE_BASE,
  NOTICE_TONES,
} from "../../../components/panel/notice-styles.ts";
import {
  TOAST_ITEM,
  TOAST_REGION,
} from "../../../components/panel/toast-styles.ts";
import {
  DIALOG,
  DIALOG_BODY,
  DIALOG_CLOSE,
} from "../../../components/panel/dialog-styles.ts";
import { navCountClassName } from "../../../features/panel-shell/nav-count-styles.ts";
import { createAccount, logIn, uniqueEmail } from "../fixtures/panel-mock.ts";

// Geometry and colour of the panel's primitives, in a real browser (review
// P4-006): the M1 rule keeps these out of unit tests, which can only see
// class names. Colours are compared with the token's own computed value.

/** The computed value of `property` for an element styled with `var(token)`. */
async function tokenValue(
  page: Page,
  token: string,
  property: "color" | "backgroundColor" | "borderColor" | "height",
): Promise<string> {
  return page.evaluate(
    ([name, prop]) => {
      const probe = document.createElement("div");
      const css = prop === "borderColor" ? "border: 1px solid" : "";
      probe.setAttribute(
        "style",
        prop === "height"
          ? `height: var(${name})`
          : `${css}; ${prop === "backgroundColor" ? "background-color" : prop === "borderColor" ? "border-color" : "color"}: var(${name})`,
      );
      document.body.append(probe);
      const value = getComputedStyle(probe)[prop];
      probe.remove();
      return value;
    },
    [token, property] as const,
  );
}

async function style(
  locator: Locator,
  property:
    | "color"
    | "backgroundColor"
    | "borderColor"
    | "outlineStyle"
    | "outlineColor"
    | "overflowX"
    | "flexDirection"
    | "whiteSpace"
    | "accentColor"
    | "clipPath"
    | "borderLeftColor"
    | "borderLeftWidth",
): Promise<string> {
  return locator.evaluate(
    (element, prop) => getComputedStyle(element)[prop],
    property,
  );
}

async function height(locator: Locator): Promise<number> {
  return (await locator.boundingBox())?.height ?? 0;
}

async function coarsePointer(page: Page): Promise<boolean> {
  return page.evaluate(() => matchMedia("(pointer: coarse)").matches);
}

test.describe("panel primitives at 1280, fine pointer @feature-ops-panel @panel-access", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("Button size=panel is 40 px; the Turnstile slot reserves 64 px before its script loads", async ({
    page,
  }) => {
    await page.route("**/challenges.cloudflare.com/**", (route) =>
      route.abort(),
    );
    await page.goto("/cadastro");
    expect(await coarsePointer(page)).toBe(false);
    const submit = page.getByRole("button", { name: "Criar conta" });
    expect(await height(submit)).toBe(
      Number.parseFloat(
        await tokenValue(page, "--size-control-panel", "height"),
      ),
    );
    expect(await height(page.getByTestId("turnstile"))).toBeGreaterThanOrEqual(
      64,
    );
  });

  test("Checkbox: a 24 px accent box; keyboard focus draws the focus ring; invalid draws the danger outline (it wins over focus)", async ({
    page,
  }) => {
    await page.goto("/cadastro");
    const box = page.getByRole("checkbox");
    const size = await box.boundingBox();
    expect(size?.width).toBe(24);
    expect(size?.height).toBe(24);
    expect(await style(box, "accentColor")).toBe(
      await tokenValue(page, "--color-accent", "color"),
    );

    await box.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(box).toBeFocused();
    expect(await style(box, "outlineStyle")).not.toBe("none");
    expect(await style(box, "outlineColor")).toBe(
      await tokenValue(page, "--color-focus", "color"),
    );

    await page.getByRole("button", { name: "Criar conta" }).click();
    await expect(box).toHaveAttribute("aria-invalid", "true");
    expect(await style(box, "outlineColor")).toBe(
      await tokenValue(page, "--color-danger-ink", "color"),
    );
  });

  test("FormAlert is danger ink; a focusable Notice (info) has the line border and the focus ring", async ({
    page,
  }, testInfo) => {
    await page.goto("/entrar?motivo=sessao");
    const notice = page.getByRole("status").filter({ hasText: /sessão/i });
    await expect(notice).toBeFocused();
    expect(await style(notice, "borderColor")).toBe(
      await tokenValue(page, "--color-line", "borderColor"),
    );

    await page.getByLabel("E-mail").fill(uniqueEmail("ninguem", testInfo));
    await page.getByLabel("Senha").fill("senha-errada-000");
    await page.getByRole("button", { name: "Entrar" }).click();
    const alert = page.getByRole("main").getByRole("alert");
    await expect(alert).toBeVisible();
    expect(await style(alert, "color")).toBe(
      await tokenValue(page, "--color-danger-ink", "color"),
    );
  });

  test("the nav count: no pill on the active item, the field-coloured pill on an inactive one", async ({
    page,
  }) => {
    // M4 has one nav item, so no shipped screen shows an inactive count:
    // render NavCount's own classes under the panel's real stylesheet.
    await page.goto("/entrar");
    await page.waitForLoadState("networkidle");
    for (const [id, className] of [
      ["count-active", navCountClassName(true)],
      ["count-inactive", navCountClassName(false)],
    ] as const)
      await page.evaluate(
        ([elementId, classes]) => {
          const element = document.createElement("span");
          element.id = elementId;
          element.className = classes;
          element.textContent = "7";
          document.body.append(element);
        },
        [id, className] as const,
      );
    expect(await style(page.locator("#count-active"), "backgroundColor")).toBe(
      "rgba(0, 0, 0, 0)",
    );
    expect(
      await style(page.locator("#count-inactive"), "backgroundColor"),
    ).toBe(await tokenValue(page, "--color-field", "backgroundColor"));
  });

  test("Notice tones (DDR-0003): ink text in every tone; warning and danger add a 4 px bar in their signal colour", async ({
    page,
  }) => {
    // No shipped screen shows the warning or danger tone yet: render the
    // Notice's own classes under the panel's real stylesheet.
    await page.goto("/entrar");
    // After hydration, so React never re-renders the probes away.
    await page.waitForLoadState("networkidle");
    for (const tone of ["info", "warning", "danger"] as const) {
      const notice = page.locator(`#notice-${tone}`);
      await page.evaluate(
        ([id, className]) => {
          const element = document.createElement("div");
          element.id = id;
          element.className = className;
          element.textContent = "Texto";
          document.body.append(element);
        },
        [`notice-${tone}`, `${NOTICE_BASE} ${NOTICE_TONES[tone]}`] as const,
      );
      expect(await style(notice, "color"), tone).toBe(
        await tokenValue(page, "--color-ink", "color"),
      );
      if (tone === "info") {
        expect(await style(notice, "borderLeftColor")).toBe(
          await tokenValue(page, "--color-line", "borderColor"),
        );
      } else {
        expect(await style(notice, "borderLeftColor"), tone).toBe(
          await tokenValue(page, `--color-${tone}`, "borderColor"),
        );
        expect(await style(notice, "borderLeftWidth"), tone).toBe("4px");
      }
    }
  });

  test("the skip link is out of sight until focused, then shows the focus ring", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("pular-geo", testInfo);
    await createAccount(request, email);
    await logIn(page, email);
    await page.reload();
    const skip = page.getByRole("link", { name: "Pular para o conteúdo" });
    // Visually hidden: clipped to nothing until it has focus.
    expect(await style(skip, "clipPath")).toBe("inset(50%)");

    await page.keyboard.press("Tab");
    await expect(skip).toBeFocused();
    expect(await style(skip, "clipPath")).toBe("none");
    await expect(skip).toBeInViewport();
    expect(await style(skip, "outlineColor")).toBe(
      await tokenValue(page, "--color-focus", "color"),
    );
  });

  test("DDR-0003: the late Fila count is a neutral pill with a danger dot and an ink-muted late line; an exhausted plan is ink with a warning dot; the late state differs from an on-time one beyond colour (AC 11, 69, 71)", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("cores", testInfo);
    await createAccount(request, email, "renata");
    await logIn(page, email);
    const badge = page.locator("aside").getByTestId("nav-count");
    // The Fila is the active item here: its count has no pill (the
    // Aplicações board); the dot and the glyph still mark the late state.
    await expect(
      page.locator("aside").getByRole("link", { name: /^Fila de revisão/ }),
    ).toHaveAttribute("aria-current", "page");
    expect(await style(badge, "backgroundColor")).toBe("rgba(0, 0, 0, 0)");
    expect(await style(badge, "color")).toBe(
      await tokenValue(page, "--color-ink", "color"),
    );
    const dot = badge.locator("span[aria-hidden]").first();
    expect(await style(dot, "backgroundColor")).toBe(
      await tokenValue(page, "--color-danger", "backgroundColor"),
    );
    expect(
      await style(
        page.locator("aside").getByText("2 fora do prazo", { exact: true }),
        "color",
      ),
    ).toBe(await tokenValue(page, "--color-ink-muted", "color"));
    // Panel AC 76 (QA-BR-001): counts in tabular figures, the late line too.
    expect(
      await page
        .locator("aside")
        .getByText("2 fora do prazo", { exact: true })
        .evaluate((element) => getComputedStyle(element).fontVariantNumeric),
    ).toContain("tabular-nums");
    // AC 71 (B-007): the late state differs from an on-time one in more
    // than colour: the glyph and the late line are there only when late.
    await expect(badge.locator("svg")).toHaveCount(1);
    await expect(
      page.locator("aside").getByText("2 fora do prazo", { exact: true }),
    ).toBeVisible();
    const onTime = uniqueEmail("cores-em-dia", testInfo);
    await createAccount(request, onTime, "tres-abertos");
    await page.context().clearCookies();
    await logIn(page, onTime);
    const onTimeBadge = page.locator("aside").getByTestId("nav-count");
    await expect(onTimeBadge).toBeVisible();
    await expect(onTimeBadge.locator("svg")).toHaveCount(0);
    await expect(page.locator("aside").getByText(/fora do prazo/)).toHaveCount(
      0,
    );

    const exhausted = uniqueEmail("cores-esgotado", testInfo);
    await createAccount(request, exhausted, "esgotado");
    await page.context().clearCookies();
    await logIn(page, exhausted);
    const line = page
      .locator("aside")
      .getByText(
        "As verificações do plano acabaram. Contrate para continuar verificando.",
      );
    expect(await style(line, "color")).toBe(
      await tokenValue(page, "--color-ink", "color"),
    );
    expect(
      await style(line.locator("span[aria-hidden]"), "backgroundColor"),
    ).toBe(await tokenValue(page, "--color-warning", "backgroundColor"));
  });

  test("a RadioGroup's error is danger ink, and its radios are 24 px", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("radios", testInfo);
    await createAccount(request, email, "nova");
    await logIn(page, email);
    await expect(page).toHaveURL(/\/comecar$/);
    const radio = page.getByRole("radio").first();
    expect((await radio.boundingBox())?.width).toBe(24);
    expect(await style(radio, "accentColor")).toBe(
      await tokenValue(page, "--color-accent", "color"),
    );

    await page.getByRole("button", { name: "Continuar" }).click();
    const error = page.getByText("Escolha um tipo de vendedor.");
    await expect(error).toBeVisible();
    expect(await style(error, "color")).toBe(
      await tokenValue(page, "--color-danger-ink", "color"),
    );
  });
});

test.describe("panel primitives on a coarse pointer @feature-ops-panel @panel-access @panel-phone", () => {
  test("44 px targets: Button size=panel, the checkbox's and radios' rows, the tabs and Conta; the tab row scrolls inside itself; the menu opens below", async ({
    page,
    request,
  }, testInfo) => {
    await page.goto("/cadastro");
    test.skip(!(await coarsePointer(page)), "a coarse-pointer project only");

    expect(
      await height(page.getByRole("button", { name: "Criar conta" })),
    ).toBeGreaterThanOrEqual(44);
    const label = page.getByRole("checkbox").locator("xpath=ancestor::label");
    expect(await height(label)).toBeGreaterThanOrEqual(44);
    expect((await page.getByRole("checkbox").boundingBox())?.width).toBe(24);

    const email = uniqueEmail("alvos", testInfo);
    await createAccount(request, email, "nova");
    await logIn(page, email);
    await expect(page).toHaveURL(/\/comecar$/);
    const row = page
      .getByRole("radio")
      .first()
      .locator("xpath=ancestor::label");
    expect(await height(row)).toBeGreaterThanOrEqual(44);

    // The shell needs an onboarded workspace (/comecar has none).
    const onboarded = uniqueEmail("alvos-shell", testInfo);
    await createAccount(request, onboarded);
    await page.context().clearCookies();
    await logIn(page, onboarded);
    const header = page.getByRole("banner");
    const tabs = header.getByRole("navigation", {
      name: "Navegação do painel",
    });
    const list = tabs.locator("ul");
    expect(await style(list, "flexDirection")).toBe("row");
    expect(await style(list, "overflowX")).toBe("auto");
    const tab = tabs.getByRole("link", { name: /^Fila de revisão/ });
    expect(await style(tab, "whiteSpace")).toBe("nowrap");
    expect(await height(tab)).toBeGreaterThanOrEqual(44);

    const conta = header.getByRole("button", { name: "Conta" });
    expect(await height(conta)).toBeGreaterThanOrEqual(44);
    await conta.click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    const buttonBox = await conta.boundingBox();
    const menuBox = await menu.boundingBox();
    expect(menuBox?.y ?? 0).toBeGreaterThanOrEqual(
      (buttonBox?.y ?? 0) + (buttonBox?.height ?? 0) - 1,
    );
  });

  test("the secondary panel Button (Reenviar código) is at least 44 px", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("reenviar-alvo", testInfo);
    await createAccount(request, email, "pendente");
    await page.goto("/entrar");
    test.skip(!(await coarsePointer(page)), "a coarse-pointer project only");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill("senha-correta-123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/cadastro\/confirmar/);
    // "Reenviar em {segundos} s" while the countdown runs.
    const resend = page.getByRole("button", { name: /^Reenviar/ });
    expect(await height(resend)).toBeGreaterThanOrEqual(44);
  });
});

// T76: the toast primitive. No shipped screen shows a toast until T84, so the
// motion is read from its classes under the panel's real stylesheet.
test.describe("panel toasts @feature-ops-panel @panel-lote", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the shell's polite toast region is in the server HTML (present at first paint), empty", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("toasts", testInfo);
    await createAccount(request, email);
    await logIn(page, email);

    const html = await (await page.request.get("/fila")).text();
    expect(html).toMatch(
      /<div role="status" aria-live="polite" aria-atomic="false" class="[^"]*fixed[^"]*"><\/div>/,
    );
  });

  test("a toast rises 8 px and fades in at --duration-base, leaves at --duration-fast; reduced motion fades only; line border, no shadow", async ({
    page,
  }) => {
    await page.goto("/entrar");
    await page.waitForLoadState("networkidle");

    const probe = async (leaving: boolean) =>
      page.evaluate(
        ([region, item, out]) => {
          const box = document.createElement("div");
          box.className = region;
          const toast = document.createElement("div");
          toast.className = item;
          if (out) toast.setAttribute("data-leaving", "");
          toast.textContent = "1 caso na fila";
          box.append(toast);
          document.body.append(box);
          const s = getComputedStyle(toast);
          const result = {
            property: s.transitionProperty,
            duration: s.transitionDuration,
            translate: s.translate,
            boxShadow: s.boxShadow,
            borderStyle: s.borderTopStyle,
          };
          box.remove();
          return result;
        },
        [TOAST_REGION, TOAST_ITEM, leaving] as const,
      );

    await page.emulateMedia({ reducedMotion: "no-preference" });
    const entering = await probe(false);
    expect(entering.property).toBe("opacity, translate");
    // One value per property, or one for all: both mean 250 ms each.
    expect(entering.duration).toMatch(/^0\.25s(, 0\.25s)?$/);
    expect(entering.boxShadow).toBe("none");
    expect(entering.borderStyle).toBe("solid");
    const leaving = await probe(true);
    expect(leaving.duration).toMatch(/^0\.15s(, 0\.15s)?$/);
    expect(leaving.translate).toBe("0px 8px");

    await page.emulateMedia({ reducedMotion: "reduce" });
    const reduced = await probe(false);
    expect(reduced.property).toBe("opacity");
    const reducedOut = await probe(true);
    expect(reducedOut.translate).toBe("0px");
  });
});

// T94: the Dialog primitive's classes under the panel's real stylesheet, on a
// real showModal(). The behaviour (focus, Esc, busy, the draft) is in
// components/panel/__tests__/dialog.test.tsx.
type DialogProbe = {
  modal: boolean;
  focusInside: boolean;
  closed: { opacity: string; translate: string; display: string };
  open: {
    opacity: string;
    translate: string;
    width: number;
    height: number;
    bottom: number;
    property: string;
    duration: string;
    behavior: string;
    paddingBottom: string;
    closeHeight: number;
  };
};

async function probeDialog(page: Page): Promise<DialogProbe> {
  return page.evaluate(
    ([dialogClass, bodyClass, closeClass]) => {
      const dialog = document.createElement("dialog");
      dialog.className = dialogClass;
      const body = document.createElement("div");
      body.className = bodyClass;
      const close = document.createElement("button");
      close.type = "button";
      close.className = closeClass;
      close.setAttribute("aria-label", "Fechar");
      const field = document.createElement("input");
      body.append(close, field);
      dialog.append(body);
      document.body.append(dialog);
      const read = () => getComputedStyle(dialog);
      const before = read();
      const closed = {
        opacity: before.opacity,
        translate: before.translate,
        display: before.display,
      };
      dialog.showModal();
      // Jump the entry transition to its end state.
      dialog.getAnimations({ subtree: true }).forEach((a) => a.finish());
      const s = read();
      const box = dialog.getBoundingClientRect();
      const result = {
        modal: dialog.matches(":modal"),
        focusInside: dialog.contains(document.activeElement),
        closed,
        open: {
          opacity: s.opacity,
          translate: s.translate,
          width: box.width,
          height: box.height,
          bottom: box.bottom,
          property: s.transitionProperty,
          duration: s.transitionDuration,
          behavior: s.transitionBehavior,
          paddingBottom: getComputedStyle(body).paddingBottom,
          closeHeight: close.getBoundingClientRect().height,
        },
      };
      dialog.close();
      dialog.remove();
      return result;
    },
    [DIALOG, DIALOG_BODY, DIALOG_CLOSE] as const,
  );
}

test.describe("panel Dialog / bottom sheet (T94) @feature-ops-panel @panel-fila @panel-phone", () => {
  test("at 1280: modal, centred, at most 520 px wide, fades at --duration-base with allow-discrete; reduced motion: opacity only", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/entrar");
    await page.waitForLoadState("networkidle");

    await page.emulateMedia({ reducedMotion: "no-preference" });
    const dialog = await probeDialog(page);
    expect(dialog.modal).toBe(true);
    expect(dialog.focusInside).toBe(true);
    expect(dialog.closed.opacity).toBe("0");
    expect(dialog.open.opacity).toBe("1");
    expect(dialog.open.translate).toBe("none");
    expect(dialog.open.width).toBeLessThanOrEqual(520);
    expect(dialog.open.width).toBeGreaterThan(400);
    expect(dialog.open.bottom).toBeLessThan(800);
    expect(dialog.open.property).toBe("opacity, translate, display, overlay");
    expect(dialog.open.duration).toMatch(/^0\.25s(, 0\.25s)*$/);
    expect(dialog.open.behavior).toMatch(/^allow-discrete/);
    expect(dialog.open.paddingBottom).toBe("24px");

    await page.emulateMedia({ reducedMotion: "reduce" });
    const reduced = await probeDialog(page);
    expect(reduced.open.property).toBe("opacity, display, overlay");
    expect(reduced.closed.opacity).toBe("0");
    expect(reduced.open.translate).toBe("none");
  });

  test("below lg: a full-height bottom sheet that slides up from 100 %, clears the safe area, 44 px close on coarse pointers; reduced motion: opacity only", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/entrar");
    await page.waitForLoadState("networkidle");

    await page.emulateMedia({ reducedMotion: "no-preference" });
    const sheet = await probeDialog(page);
    expect(sheet.modal).toBe(true);
    expect(sheet.open.width).toBe(360);
    expect(sheet.open.height).toBe(780);
    expect(sheet.open.bottom).toBe(780);
    expect(sheet.open.opacity).toBe("1");
    expect(sheet.closed.opacity).toBe("1");
    expect(sheet.closed.translate).toMatch(/^0px (100%|780px)$/);
    expect(sheet.open.translate).toMatch(/^(none|0px( 0px)?)$/);
    expect(sheet.open.property).toBe("opacity, translate, display, overlay");
    // 16 px + env(safe-area-inset-bottom), which is 0 here.
    expect(sheet.open.paddingBottom).toBe("16px");
    if (await coarsePointer(page)) {
      expect(sheet.open.closeHeight).toBeGreaterThanOrEqual(44);
    }

    await page.emulateMedia({ reducedMotion: "reduce" });
    const reduced = await probeDialog(page);
    expect(reduced.open.property).toBe("opacity, display, overlay");
    expect(reduced.closed.opacity).toBe("0");
    expect(reduced.closed.translate).toBe("none");
    expect(reduced.open.opacity).toBe("1");
  });
});
