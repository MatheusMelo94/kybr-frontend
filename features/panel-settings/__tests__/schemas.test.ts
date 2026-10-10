import { describe, expect, it } from "vitest";

import {
  changePasswordSchema,
  ownNameSchema,
} from "@/features/panel-settings/schemas";

// T128: the D-A6 and D-W4 request schemas (C-M8-7, C-M8-8; O-F2).

describe("changePasswordSchema (D-A6)", () => {
  const ok = { senha_atual: "atual-qualquer", senha_nova: "nova-senha-longa" };

  it("accepts the two passwords as typed (never trimmed)", () => {
    const parsed = changePasswordSchema.parse({
      senha_atual: " com espaço ",
      senha_nova: " nova senha longa ",
    });
    expect(parsed.senha_atual).toBe(" com espaço ");
    expect(parsed.senha_nova).toBe(" nova senha longa ");
  });

  it.each([
    ["an empty current password", { ...ok, senha_atual: "" }],
    ["a current password over 128", { ...ok, senha_atual: "a".repeat(129) }],
    ["a new password under 12", { ...ok, senha_nova: "a".repeat(11) }],
    ["a new password over 128", { ...ok, senha_nova: "a".repeat(129) }],
    ["an extra field", { ...ok, email: "x@exemplo.test" }],
  ])("rejects %s", (_, input) => {
    expect(changePasswordSchema.safeParse(input).success).toBe(false);
  });
});

describe("ownNameSchema (D-W4)", () => {
  it("trims and accepts 1..80 characters", () => {
    expect(ownNameSchema.parse({ nome: "  Pessoa  " })).toEqual({
      nome: "Pessoa",
    });
    expect(ownNameSchema.safeParse({ nome: "a".repeat(80) }).success).toBe(
      true,
    );
  });

  it.each([
    ["an empty name", { nome: "   " }],
    ["81 characters", { nome: "a".repeat(81) }],
    ["an extra field", { nome: "Pessoa", slug: "outro" }],
  ])("rejects %s", (_, input) => {
    expect(ownNameSchema.safeParse(input).success).toBe(false);
  });
});
