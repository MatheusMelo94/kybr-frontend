// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  gif,
  heic,
  jpeg,
  marked,
  pdf,
  png,
  textAs,
  webp,
  zeroByte,
} from "@/tests/fixtures/factories/files";
import {
  MAX_UPLOAD_BYTES,
  UPLOAD_MARKERS,
} from "@/tests/fixtures/factories/seller-link";

// QA M3 test plan G9: upload test files with real magic bytes and exact sizes.

const head = (buffer: Buffer, n: number): number[] => [
  ...buffer.subarray(0, n),
];

describe("file builders (G9)", () => {
  it("builds each format with its magic bytes, MIME type and exact size", () => {
    expect(head(pdf(2_000).buffer, 4)).toEqual([0x25, 0x50, 0x44, 0x46]);
    expect(pdf(2_000)).toMatchObject({ mimeType: "application/pdf" });
    expect(pdf(2_000).buffer).toHaveLength(2_000);
    expect(head(jpeg(500).buffer, 3)).toEqual([0xff, 0xd8, 0xff]);
    expect(jpeg(500).mimeType).toBe("image/jpeg");
    expect(head(png(500).buffer, 4)).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(png(500).mimeType).toBe("image/png");
    expect(gif().mimeType).toBe("image/gif");
    expect(head(gif().buffer, 3)).toEqual([0x47, 0x49, 0x46]);
    expect(webp().mimeType).toBe("image/webp");
    expect(heic().mimeType).toBe("image/heic");
  });

  it("hits the 10 MB boundary to the byte (Q10)", () => {
    expect(pdf(MAX_UPLOAD_BYTES).buffer).toHaveLength(10_485_760);
    expect(pdf(MAX_UPLOAD_BYTES + 1).buffer).toHaveLength(10_485_761);
  });

  it("names files, fakes a type, and makes empty files", () => {
    expect(pdf(100, "contrato.pdf").name).toBe("contrato.pdf");
    const fake = textAs("foto.jpg", "image/jpeg");
    expect(fake).toMatchObject({ name: "foto.jpg", mimeType: "image/jpeg" });
    expect(head(fake.buffer, 3)).not.toEqual([0xff, 0xd8, 0xff]);
    expect(zeroByte("vazio.pdf")).toMatchObject({
      name: "vazio.pdf",
      mimeType: "",
    });
    expect(zeroByte("vazio.pdf").buffer).toHaveLength(0);
  });

  it("puts an UPLOAD_MARKERS key in a file's name", () => {
    expect(marked(pdf(100), "networkDrop").name).toBe(
      `${UPLOAD_MARKERS.networkDrop}documento.pdf`,
    );
  });
});
