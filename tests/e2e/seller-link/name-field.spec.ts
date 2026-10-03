import { expect, test, type CDPSession, type Locator } from "@playwright/test";

// Spec § Name field behavior + review M1 v1 Process Gap 4: the name filter
// must not break dead-key or IME composition (ABNT2 ´ ~ ^, Gboard), and
// apostrophe look-alikes become ' once they're completed characters.

const NAME_LABEL = "Nome completo do responsável";

/** A dead key (or IME) composition in Chromium: pending mark, then the committed text. */
async function compose(
  cdp: CDPSession,
  pending: string,
  committed: string,
): Promise<void> {
  await cdp.send("Input.imeSetComposition", {
    text: pending,
    selectionStart: pending.length,
    selectionEnd: pending.length,
  });
  await cdp.send("Input.insertText", { text: committed });
}

test.describe("name field @feature-seller-link", () => {
  test.describe("composition (Chromium IME emulation)", () => {
    test.skip(
      ({ browserName }) => browserName !== "chromium",
      "CDP Input.imeSetComposition is Chromium-only",
    );

    let cdp: CDPSession;
    let field: Locator;

    test.beforeEach(async ({ page }) => {
      await page.goto("/v/loja-exemplo");
      cdp = await page.context().newCDPSession(page);
      field = page.getByRole("textbox", { name: NAME_LABEL });
      await field.click();
    });

    test("José, João and Conceição type correctly through dead keys", async ({
      page,
    }) => {
      await page.keyboard.type("Jos");
      await compose(cdp, "´", "é");
      await page.keyboard.type(" Jo");
      await compose(cdp, "~", "ã");
      await page.keyboard.type("o Concei");
      await page.keyboard.insertText("ç");
      await compose(cdp, "~", "ã");
      await page.keyboard.type("o");

      await expect(field).toHaveValue("José João Conceição");
    });

    test("the pending dead key stays visible while composing", async () => {
      await cdp.send("Input.insertText", { text: "Jo" });
      await cdp.send("Input.imeSetComposition", {
        text: "~",
        selectionStart: 1,
        selectionEnd: 1,
      });

      await expect(field).toHaveValue("Jo~");
      await cdp.send("Input.insertText", { text: "ã" });
      await expect(field).toHaveValue("Joã");
    });

    test("a dead ´ committed on its own becomes '", async ({ page }) => {
      await page.keyboard.type("Ana D");
      await compose(cdp, "´", "´");
      await page.keyboard.type("Ávila");

      await expect(field).toHaveValue("Ana D'Ávila");
    });
  });

  test("’ ‘ ʼ and ` typed or pasted become '", async ({ page }) => {
    await page.goto("/v/loja-exemplo");
    const field = page.getByRole("textbox", { name: NAME_LABEL });

    await field.pressSequentially("Ana D’Ávila");
    await expect(field).toHaveValue("Ana D'Ávila");

    await field.fill("");
    await field.click();
    await page.keyboard.insertText("Ana O‘Neil Dʼ`Arc");
    await expect(field).toHaveValue("Ana O'Neil D''Arc");
  });
});
