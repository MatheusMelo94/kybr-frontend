import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { casesFor, seedCases } from "../fixtures/fila-mock.ts";
import { createAccount, logIn, uniqueEmail } from "../fixtures/panel-mock.ts";

// T114 (AC 70, the Fila half; plan-m6 § 7, D12): a decided case leaves the
// list with a WAAPI FLIP. The options below it move up (transform), the
// leaving one fades as a snapshot (opacity), over --duration-base; reduced
// motion removes it instantly with no animation at all. No GSAP (T113).

type Request = Parameters<typeof casesFor>[0];

type Sample = {
  id: string;
  keys: string[];
  duration: number;
  ghost: boolean;
  /** One frame later: the computed transform and the running animations. */
  transform?: string;
  running?: number;
  ghostsInDom?: number;
};

/** Records every Element.animate() call, then samples one frame later. */
async function recordAnimations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const samples: Sample[] = [];
    (window as unknown as { __samples: Sample[] }).__samples = samples;
    const original = Element.prototype.animate;
    Element.prototype.animate = function (
      this: HTMLElement,
      keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
      options?: number | KeyframeAnimationOptions,
    ) {
      const animation = original.call(this, keyframes, options);
      const sample: Sample = {
        id: this.dataset.id ?? "",
        keys: Array.isArray(keyframes)
          ? keyframes.flatMap((frame) => Object.keys(frame))
          : Object.keys(keyframes ?? {}),
        duration:
          typeof options === "number" ? options : Number(options?.duration),
        ghost: this.hasAttribute("data-collapse-ghost"),
        ghostsInDom: document.querySelectorAll("[data-collapse-ghost]").length,
      };
      samples.push(sample);
      requestAnimationFrame(() => {
        sample.transform = getComputedStyle(this).transform;
        sample.running = this.getAnimations().length;
      });
      return animation;
    };
  });
}

const samples = (page: Page) =>
  page.evaluate(() => (window as unknown as { __samples: Sample[] }).__samples);
const ghosts = (page: Page) => page.locator("[data-collapse-ghost]");
const options = (page: Page) => page.getByRole("listbox").getByRole("option");

async function openFirst(
  page: Page,
  request: Request,
  label: string,
  testInfo: TestInfo,
) {
  const email = uniqueEmail(label, testInfo);
  await createAccount(request, email);
  await seedCases(request, email, "vinte-e-cinco");
  const open = (await casesFor(request, email)).filter(
    (c) => c.estado === "aberto",
  );
  await recordAnimations(page);
  await logIn(page, email);
  await page.goto(`/fila/${open[0]?.id}`);
  await expect(options(page)).toHaveCount(25);
  return open;
}

test.describe("Fila collapse at 1280 (T114) @feature-ops-panel @panel-fila", () => {
  test.skip(
    ({ viewport }) => (viewport?.width ?? 0) < 1024,
    "the list is beside the detail at lg only",
  );

  test("AC 70: after Aprovar the options below move up by transform over --duration-base; the leaving one fades by opacity and is removed", async ({
    page,
    request,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const open = await openFirst(page, request, "fila-flip", testInfo);
    await page
      .getByRole("button", { name: /^(Aprovar|Manter aprovado)$/ })
      .click();
    await expect(options(page)).toHaveCount(24);

    await expect(async () => {
      const recorded = await samples(page);
      const moves = recorded.filter((s) => !s.ghost);
      expect(moves.length).toBeGreaterThan(0);
      expect(moves[0]?.id).toBe(open[1]?.id);
      for (const move of moves) {
        expect(move.keys.every((key) => key === "transform")).toBe(true);
        expect(move.duration).toBe(250);
      }
      // Mid-animation: a real transform, an animation running.
      expect(moves[0]?.transform).toMatch(/^matrix/);
      expect(moves[0]?.running).toBeGreaterThan(0);
      const fade = recorded.filter((s) => s.ghost);
      expect(fade).toHaveLength(1);
      expect(fade[0]?.keys).toEqual(["opacity", "opacity"]);
      for (const sample of recorded)
        for (const key of sample.keys)
          expect(["transform", "opacity"]).toContain(key);
    }).toPass();
    await expect(ghosts(page)).toHaveCount(0);
  });

  test("reduced motion: the case leaves instantly, animate() is never called, no transform and no snapshot", async ({
    page,
    request,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openFirst(page, request, "fila-flip-reduce", testInfo);
    await page
      .getByRole("button", { name: /^(Aprovar|Manter aprovado)$/ })
      .click();
    await expect(options(page)).toHaveCount(24);
    const transforms = await options(page).evaluateAll((all) =>
      all.map((option) => getComputedStyle(option).transform),
    );
    expect(transforms.every((t) => t === "none")).toBe(true);
    expect(await samples(page)).toEqual([]);
    await expect(ghosts(page)).toHaveCount(0);
  });

  test("two quick decisions: the first collapse is cancelled or done before the second starts; no snapshot is left", async ({
    page,
    request,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const open = await openFirst(page, request, "fila-flip-dois", testInfo);
    const decide = page.getByRole("button", {
      name: /^(Aprovar|Manter aprovado)$/,
    });
    await decide.click();
    await expect(page).toHaveURL(new RegExp(`/fila/${open[1]?.id}$`));
    // The next case's list has streamed in (Suspense): there is a list to collapse.
    await expect(options(page)).toHaveCount(24);
    await decide.click();
    await expect(options(page)).toHaveCount(23);
    await expect(page).toHaveURL(new RegExp(`/fila/${open[2]?.id}$`));
    const recorded = await samples(page);
    // Each new snapshot found at most its own in the DOM: the first was gone.
    for (const sample of recorded.filter((s) => s.ghost))
      expect(sample.ghostsInDom).toBeLessThanOrEqual(1);
    expect(
      recorded.filter((s) => s.ghost),
      JSON.stringify(
        recorded.map((s) => (s.ghost ? `G${s.ghostsInDom}` : s.id.slice(0, 4))),
      ),
    ).toHaveLength(2);
    await expect(ghosts(page)).toHaveCount(0);
  });
});

test.describe("Fila collapse on a phone (T114) @feature-ops-panel @panel-fila @panel-phone", () => {
  test("below lg the list isn't on screen while deciding: the decision still advances and leaves no snapshot", async ({
    page,
    request,
  }, testInfo) => {
    test.skip(
      (page.viewportSize()?.width ?? 0) >= 1024,
      "phone and tablet widths only",
    );
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const email = uniqueEmail("fila-flip-phone", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "dois");
    const [first, second] = (await casesFor(request, email)).filter(
      (c) => c.estado === "aberto",
    );
    await logIn(page, email);
    await page.goto(`/fila/${first?.id}`);
    await page.getByRole("button", { name: "Aprovar" }).click();
    await expect(page).toHaveURL(new RegExp(`/fila/${second?.id}$`));
    await expect(ghosts(page)).toHaveCount(0);
  });
});
