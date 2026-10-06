// LHCI puppeteerScript (ADR-0010 § 1; T116): logs the panel in through the
// local mock API before Lighthouse measures an authenticated page. LHCI runs
// it once per URL, in the one browser it then audits. Lighthouse's storage
// reset clears the HTTP cache before every run but keeps cookies (Lighthouse
// 12's default clearStorageTypes), so each run is a cold load, signed in.
//
// Env (scripts/lighthouse-local.sh sets them): LHCI_PANEL_EMAIL and
// LHCI_PANEL_SENHA, an account the script created on the mock. Mock-only
// values; nothing here is a secret.

/**
 * @param {import('puppeteer-core').Browser} browser
 * @param {{ url: string }} context
 */
module.exports = async (browser, { url }) => {
  const email = process.env.LHCI_PANEL_EMAIL;
  const senha = process.env.LHCI_PANEL_SENHA;
  if (!email || !senha)
    throw new Error(
      "lighthouse-panel-login: LHCI_PANEL_EMAIL and LHCI_PANEL_SENHA are required",
    );
  const origin = new URL(url).origin;
  const page = await browser.newPage();
  try {
    // Signed in already (an earlier run): /fila stays put. Otherwise the
    // session check sends it to /entrar.
    await page.goto(`${origin}/fila`, { waitUntil: "networkidle0" });
    if (new URL(page.url()).pathname.startsWith("/entrar")) {
      await page.type("input[name=email]", email);
      await page.type("input[name=senha]", senha);
      await page.click("form button[type=submit]");
      // The form's action navigates on the client: wait for the URL, not a load.
      await page
        .waitForFunction(() => !location.pathname.startsWith("/entrar"), {
          timeout: 30_000,
        })
        .catch(() => {
          throw new Error(
            "lighthouse-panel-login: the login didn't leave /entrar",
          );
        });
      await page.waitForNetworkIdle();
    }
  } finally {
    await page.close();
  }
};
