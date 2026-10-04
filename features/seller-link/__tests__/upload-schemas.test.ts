import { describe, expect, it } from "vitest";

import {
  checkUpload,
  uploadResponseSchema,
} from "@/features/seller-link/upload-schemas";

describe("uploadResponseSchema (D6 201)", () => {
  it("reads the document's file count", () => {
    expect(
      uploadResponseSchema.parse({
        tipo: "RESPONSAVEL",
        documentos_enviados: 3,
      }),
    ).toEqual({ tipo: "RESPONSAVEL", documentos_enviados: 3 });
  });

  it.each([-1, 1.5, "3", null, undefined])("rejects a count of %j", (count) => {
    expect(
      uploadResponseSchema.safeParse({
        tipo: "RESPONSAVEL",
        documentos_enviados: count,
      }).success,
    ).toBe(false);
  });
});

describe("checkUpload (AC 22 pre-checks; the API stays authoritative)", () => {
  const MB = 1024 * 1024;
  const file = (name: string, type: string, size = 10): File =>
    new File([new Uint8Array(size)], name, { type });
  const pdf = (name = "a.pdf", size = 10) =>
    file(name, "application/pdf", size);
  const jpg = (name = "a.jpg", size = 10) => file(name, "image/jpeg", size);
  const fresh = { received: 0, sentBytes: 0 };

  it("accepts one PDF, or one or more JPEG/PNG photos", () => {
    expect(checkUpload([pdf()], fresh)).toBeNull();
    expect(checkUpload([jpg(), file("b.png", "image/png")], fresh)).toBeNull();
  });

  it("reads the type from the extension when the picker gives none", () => {
    expect(checkUpload([file("scan.PDF", "")], fresh)).toBeNull();
    expect(checkUpload([file("notas.txt", "")], fresh)).toBe("type");
  });

  it.each([
    ["HEIC", "image/heic"],
    ["Word", "application/msword"],
    ["SVG", "image/svg+xml"],
  ])("refuses %s as type", (_name, type) => {
    expect(checkUpload([file("x", type)], fresh)).toBe("type");
  });

  it("type wins over mixing in the same pick", () => {
    expect(checkUpload([pdf(), file("x.gif", "image/gif")], fresh)).toBe(
      "type",
    );
  });

  it("refuses a PDF with photos, two PDFs, and a PDF added to received files as mixed", () => {
    expect(checkUpload([pdf(), jpg()], fresh)).toBe("mixed");
    expect(checkUpload([pdf("a.pdf"), pdf("b.pdf")], fresh)).toBe("mixed");
    expect(checkUpload([pdf()], { received: 2, sentBytes: 0 })).toBe("mixed");
    expect(checkUpload([jpg()], { received: 2, sentBytes: 0 })).toBeNull();
  });

  it("refuses more than 10 MB in total, counting what this page already sent", () => {
    expect(checkUpload([jpg("a.jpg", 10 * MB)], fresh)).toBeNull();
    expect(checkUpload([jpg("a.jpg", 10 * MB + 1)], fresh)).toBe("size");
    expect(
      checkUpload([jpg("b.jpg", 5 * MB)], { received: 1, sentBytes: 6 * MB }),
    ).toBe("size");
  });
});
