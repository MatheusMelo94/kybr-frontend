import {
  expect,
  test,
  type APIRequestContext,
  type FileChooser,
  type Page,
} from "@playwright/test";

import {
  CASE_PRESETS,
  ERROR_SENTINEL,
  SLUGS,
  UPLOAD_MARKERS,
} from "../../fixtures/factories/seller-link.ts";
import { expectNoAxeViolations } from "../fixtures/axe.ts";
import { createCase } from "../fixtures/mock-api.ts";

// Document upload errors (spec AC 22; threat model F05, Q7): the client's
// pre-checks, then the D6 codes from the mock API, on the route.

type Files = Parameters<FileChooser["setFiles"]>[0];

const COPY = {
  size: "Passou do limite de envio. Envie um PDF menor ou menos fotos.",
  type: "Formato não aceito. Envie PDF, JPG ou PNG.",
  mixed: "Cada documento aceita um único PDF ou só fotos. Escolha de novo.",
  network: "Não conseguimos enviar o documento. Tente de novo.",
  closed:
    "Este cadastro já foi decidido. Não é mais preciso enviar documentos.",
};

const pdf = (name = "contrato.pdf") => ({
  name,
  mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.4 synthetic test document"),
});
const png = (name: string, bytes = 8) => ({
  name,
  mimeType: "image/png",
  buffer: Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(Math.max(0, bytes - 8)),
  ]),
});

async function openPending(page: Page, request: APIRequestContext) {
  const token = await createCase(request, { kind: "pendente", ageMs: 60_000 });
  await page.goto(`/v/${SLUGS.ok}/c/${token}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Quase lá" }),
  ).toBeVisible();
  // The upload is a lazy chunk: a tap before it hydrates is inert by design.
  await page.waitForLoadState("networkidle");
  return token;
}

async function pick(page: Page, button: string, files: Files): Promise<void> {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: button }).click();
  await (await chooser).setFiles(files);
}

/** Counts the D6 POSTs the page sends. */
function countUploads(page: Page): { sent: number } {
  const count = { sent: 0 };
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/documents"))
      count.sent += 1;
  });
  return count;
}

test.describe("document upload errors @feature-seller-link", () => {
  test("AC 22 (client): over 10 MB, another format, PDF with photos and two PDFs upload nothing", async ({
    page,
    request,
  }) => {
    await openPending(page, request);
    const uploads = countUploads(page);

    for (const [files, copy] of [
      [
        [png("a.png", 6 * 1024 * 1024), png("b.png", 5 * 1024 * 1024)],
        COPY.size,
      ],
      [
        [
          {
            name: "notas.txt",
            mimeType: "text/plain",
            buffer: Buffer.from("x"),
          },
        ],
        COPY.type,
      ],
      [[pdf(), png("p.png")], COPY.mixed],
      [[pdf("a.pdf"), pdf("b.pdf")], COPY.mixed],
    ] as const) {
      await pick(page, "Enviar documento", [...files]);
      await expect(
        page.getByRole("status").filter({ hasText: copy }),
      ).toBeVisible();
    }
    expect(uploads.sent).toBe(0);
    await expectNoAxeViolations(page);
  });

  test("AC 22: a PDF added to photos already received is mixed, and the photos stay", async ({
    page,
    request,
  }) => {
    await openPending(page, request);
    await pick(page, "Enviar documento", [png("p1.png"), png("p2.png")]);
    await expect(page.getByText("Recebido: 2 arquivos")).toBeVisible();

    await pick(page, "Adicionar página", pdf());

    await expect(page.getByText(COPY.mixed)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Adicionar página" }),
    ).toBeVisible();
  });

  for (const [marker, copy, label] of [
    [UPLOAD_MARKERS.tooLarge, COPY.size, "413 ARQUIVO_GRANDE"],
    [UPLOAD_MARKERS.fileLimit, COPY.size, "413 LIMITE_ARQUIVOS (F05, Q7)"],
    [UPLOAD_MARKERS.badFormat, COPY.type, "415 FORMATO_INVALIDO"],
  ] as const) {
    test(`AC 22 (API): ${label} shows its copy, never the backend's message`, async ({
      page,
      request,
    }) => {
      await openPending(page, request);

      await pick(page, "Enviar documento", pdf(`doc${marker}.pdf`));

      await expect(page.getByText(copy)).toBeVisible();
      await expect(page.locator("body")).not.toContainText(ERROR_SENTINEL);
      await expect(
        page.getByRole("button", { name: "Enviar documento" }),
      ).toBeVisible();
    });
  }

  test("AC 22: 409 shows upload.error.closed and the button goes away", async ({
    page,
    request,
  }) => {
    await openPending(page, request);

    await pick(
      page,
      "Enviar documento",
      pdf(`doc${UPLOAD_MARKERS.decided}.pdf`),
    );

    await expect(page.getByText(COPY.closed)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Enviar documento" }),
    ).toHaveCount(0);
    await expectNoAxeViolations(page);
  });

  test("AC 22: offline shows upload.error.network; tapping again resends, and the e-mail block keeps working", async ({
    page,
    context,
    request,
  }) => {
    await openPending(page, request);
    const uploads = countUploads(page);

    await context.setOffline(true);
    await pick(page, "Enviar documento", [png("p1.png"), png("p2.png")]);
    await expect(page.getByText(COPY.network)).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Seu e-mail para avisos" }),
    ).toBeEditable();

    await context.setOffline(false);
    // No picker this time: the same selection goes again.
    await page.getByRole("button", { name: "Enviar documento" }).click();
    await expect(page.getByText("Recebido: 2 arquivos")).toBeVisible();
    expect(uploads.sent).toBeGreaterThanOrEqual(1);
  });

  test("AC 22: one item's error leaves the other items alone (catalogue)", async ({
    page,
    request,
  }) => {
    const token = await createCase(request, CASE_PRESETS.pendingCatalogue);
    await page.goto(`/v/${SLUGS.ok}/c/${token}`);
    await page.waitForLoadState("networkidle");
    const buttons = page.getByRole("button", { name: "Enviar documento" });
    await expect(buttons).toHaveCount(6);

    const chooser = page.waitForEvent("filechooser");
    await buttons.first().click();
    await (await chooser).setFiles(pdf(`doc${UPLOAD_MARKERS.badFormat}.pdf`));

    await expect(page.getByText(COPY.type)).toHaveCount(1);
    await expect(buttons).toHaveCount(6);
  });
});
