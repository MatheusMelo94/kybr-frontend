import { expect, test, type FileChooser, type Page } from "@playwright/test";

import { SLUGS } from "../../fixtures/factories/seller-link.ts";
import { expectNoAxeViolations } from "../fixtures/axe.ts";
import { createCase } from "../fixtures/mock-api.ts";

// Document upload, happy path (spec AC 21, AC 23; ADR-0004b): the browser
// posts multipart straight to the mock API (CORS, exact origin), then the page
// refreshes so the counts and pending.allreceived come from the server.

const PDF = {
  name: "contrato.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.4 synthetic test document"),
};
const photo = (name: string) => ({
  name,
  mimeType: "image/png",
  buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
});

const ITEM_TITLE = /não aparece entre os sócios da empresa$/;
const DEADLINE = /^Prazo da análise: até /;
const ALL_RECEIVED = /^Recebemos tudo\. Agora é com a gente/;

/** S5 (one requested document: RESPONSAVEL), past its processing window. */
async function openPending(
  page: Page,
  request: Parameters<typeof createCase>[0],
) {
  const token = await createCase(request, { kind: "pendente", ageMs: 60_000 });
  await page.goto(`/v/${SLUGS.ok}/c/${token}`);
  await leavesHydrated(page);
  await expect(
    page.getByRole("heading", { level: 1, name: "Quase lá" }),
  ).toBeVisible();
  return token;
}

/** Picks files through the visible button, as the seller does. */
async function pick(
  page: Page,
  buttonName: string,
  files: Parameters<FileChooser["setFiles"]>[0],
): Promise<void> {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: buttonName }).click();
  await (await chooser).setFiles(files);
}

/**
 * The e-mail block and the upload are lazy chunks (next/dynamic): wait until
 * they've loaded and hydrated before pressing their buttons, as a seller's
 * tap before hydration is inert by design.
 */
async function leavesHydrated(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
}

test.describe("document upload @feature-seller-link", () => {
  test("AC 21 / AC 23: one PDF ends as upload.received.one, with no upload.add, and pending.allreceived replaces the deadline without a reload", async ({
    page,
    request,
  }) => {
    await openPending(page, request);
    const button = page.getByRole("button", { name: "Enviar documento" });
    await expect(button).toHaveAccessibleDescription(
      new RegExp(
        `${ITEM_TITLE.source.slice(0, -1)} PDF ou fotos, até 10 MB no total\\.$`,
      ),
    );
    await expect(page.getByText(DEADLINE)).toBeVisible();
    await expectNoAxeViolations(page);

    const posted = page.waitForRequest(
      (r) => r.method() === "POST" && r.url().endsWith("/documents"),
    );
    await pick(page, "Enviar documento", PDF);
    expect((await posted).url()).toMatch(
      /^http:\/\/localhost:4010\/public\/v\/loja-exemplo\/cases\/[\w-]+\/documents$/,
    );

    await expect(page.getByText("Recebido: 1 arquivo")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Adicionar página" }),
    ).toHaveCount(0);
    await expect(page.getByText(ALL_RECEIVED)).toBeVisible();
    await expect(page.getByText(DEADLINE)).toHaveCount(0);
    // The refresh's metadata commits a moment after its body (Next 15.5).
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveTitle("Cadastro de vendedor");
    await expectNoAxeViolations(page);
  });

  test("AC 21: several photos end as upload.received.many with upload.add, and adding a page counts it", async ({
    page,
    request,
  }) => {
    await openPending(page, request);

    await pick(page, "Enviar documento", [photo("p1.png"), photo("p2.png")]);
    await expect(page.getByText("Recebido: 2 arquivos")).toBeVisible();

    await pick(page, "Adicionar página", photo("p3.png"));
    await expect(page.getByText("Recebido: 3 arquivos")).toBeVisible();

    // The count survives a reload (D4 documentos_enviados). A fresh page:
    // Firefox aborts the next navigation of a page that used a file chooser.
    const reopened = await page.context().newPage();
    await reopened.goto(page.url());
    await leavesHydrated(reopened);
    await expect(reopened.getByText("Recebido: 3 arquivos")).toBeVisible();
    await expect(
      reopened.getByRole("button", { name: "Adicionar página" }),
    ).toBeVisible();
  });
});
