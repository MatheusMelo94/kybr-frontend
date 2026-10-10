import { expect, test, type Page } from "@playwright/test";

import { ADVANCE_GUARD_MS } from "../../../features/panel-fila/limits.ts";
import { caseFault, casesFor, seedCases } from "../fixtures/fila-mock.ts";
import { SETTLE } from "../fixtures/fila-timing.ts";
import {
  callsFor,
  createAccount,
  logIn,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";

// QA-M6-004 (HIGH; QA A33-08 / DF-07, Q4): below lg the sticky bar renders
// the next case's Aprovar where the finger is once the advance lands, so a
// double tap decided two cases. For ADVANCE_GUARD_MS after the next case's
// actions mount, pointer activations of its decisions are ignored; the
// keyboard never is. Adopted from QA's qa-fila.spec.ts, with QA's
// exploratory gaps fixed and the decide latency set on the mock.

type Request = Parameters<typeof casesFor>[0];

async function openCases(request: Request, email: string) {
  return (await casesFor(request, email)).filter((c) => c.estado === "aberto");
}

async function decidePosts(request: Request, email: string) {
  return (await callsFor(request, email)).filter(
    (call) => call.method === "POST" && /\/decide$/.test(call.path),
  );
}

const APPROVE = { name: /^(Aprovar|Manter aprovado)$/ };

// QA's rates: 2–4 doubles in 6 at 100–350 ms with no latency, 4 in 6 at
// 450–600 ms with a 300 ms decide latency (the re-tap after the skeleton).
const RUNS = [
  { latency: 0, gaps: [100, 250, 350] },
  { latency: 300, gaps: [450, 600] },
] as const;

/** Two taps (a touch project) or two clicks at one point, `gap` ms apart. */
async function doubleActivate(page: Page, gap: number, touch: boolean) {
  const approve = page.getByRole("button", APPROVE);
  // At lg the bar isn't sticky: bring it into the viewport first.
  await approve.scrollIntoViewIfNeeded();
  const box = await approve.boundingBox();
  if (!box) throw new Error("Aprovar has no box");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const hit = () =>
    touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y);
  await hit();
  await page.waitForTimeout(gap);
  await hit();
}

test.describe("Fila: the advance guard (QA-M6-004) @feature-ops-panel @panel-fila @panel-phone", () => {
  for (const { latency, gaps } of RUNS) {
    test(`a double tap (or double click) on Aprovar decides exactly one case, decide latency ${latency} ms`, async ({
      page,
      request,
    }, testInfo) => {
      test.setTimeout(90_000);
      const touch = testInfo.project.use.hasTouch === true;
      const email = uniqueEmail(`fila-guard-${latency}`, testInfo);
      await createAccount(request, email);
      await seedCases(request, email, "vinte-e-cinco");
      if (latency > 0)
        await caseFault(request, email, "decide", "delay", {
          ms: latency,
          times: 100,
        });
      await logIn(page, email);
      await page.waitForURL(/\/fila(\/[0-9a-f-]{36})?$/);
      for (const [i, gap] of gaps.entries()) {
        const [target] = await openCases(request, email);
        if (!target) throw new Error("no open case");
        await page.goto(`/fila/${target.id}`);
        await expect(page.getByRole("button", APPROVE)).toBeVisible(SETTLE);
        await doubleActivate(page, gap, touch);
        await expect(page).not.toHaveURL(
          new RegExp(`/fila/${target.id}$`),
          SETTLE,
        );
        // Past the guard and any second call's latency: a second decision
        // would be on the mock by now.
        await page.waitForTimeout(ADVANCE_GUARD_MS + latency + 500);
        expect(
          await decidePosts(request, email),
          `gap ${gap} ms: one decision per double activation`,
        ).toHaveLength(i + 1);
        expect(
          (await casesFor(request, email)).filter((c) => c.estado !== "aberto"),
        ).toHaveLength(i + 1);
      }
    });
  }

  test("the keyboard is never blocked: Enter on the next case's Aprovar during the guard decides it", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-guard-kbd", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "vinte-e-cinco");
    const [first, second, third] = await openCases(request, email);
    await logIn(page, email);
    await page.waitForURL(/\/fila(\/[0-9a-f-]{36})?$/);
    await page.goto(`/fila/${first?.id}`);
    await page.getByRole("button", APPROVE).click();
    await expect(page).toHaveURL(new RegExp(`/fila/${second?.id}$`), SETTLE);
    const bar = page.locator("[data-case-actions]:visible");
    await expect(bar).toHaveAttribute("data-advance-guard");
    await page.getByRole("button", APPROVE).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/fila/${third?.id}$`), SETTLE);
    expect(await decidePosts(request, email)).toHaveLength(2);
  });
});
