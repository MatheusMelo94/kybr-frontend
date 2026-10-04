import { describe, expect, it } from "vitest";

import { uploadResponseSchema } from "@/features/seller-link/upload-schemas";

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
