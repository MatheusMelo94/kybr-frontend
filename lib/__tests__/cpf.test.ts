import { describe, expect, it } from "vitest";

import { CPF_MASK, maskCpf } from "@/lib/cpf";

// Spec v3 § Company data on the link; contract X7 (the backend masks first).
describe("maskCpf", () => {
  it.each([
    ["JOAO CARLOS SILVA 12345678909", "JOAO CARLOS SILVA ***.***.***-**"],
    ["JOAO CARLOS SILVA 123.456.789-09", "JOAO CARLOS SILVA ***.***.***-**"],
    ["123.456.789-09 JOAO CARLOS SILVA", "***.***.***-** JOAO CARLOS SILVA"],
    ["A 12345678909 E 98765432100", "A ***.***.***-** E ***.***.***-**"],
  ])("masks the CPF in %j", (text, masked) => {
    expect(maskCpf(text)).toBe(masked);
  });

  it.each([
    "JOAO CARLOS SILVA ***.***.***-**",
    "AUTO PECAS EXEMPLO LTDA",
    "EMPRESA 12345678000195",
    "LOJA 1234567890",
    "LOJA 123456789012",
  ])(
    "leaves %j alone (already masked, no CPF, or not an 11-digit run)",
    (text) => {
      expect(maskCpf(text)).toBe(text);
    },
  );

  it("uses the spec's mask", () => {
    expect(CPF_MASK).toBe("***.***.***-**");
  });
});
