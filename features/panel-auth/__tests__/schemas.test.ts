import { describe, expect, it } from "vitest";

import { loginSchema } from "@/features/panel-auth/schemas";

describe("loginSchema (plan § 3.4)", () => {
  it("trims and lowercases the e-mail, keeps the password as typed", () => {
    expect(
      loginSchema.parse({ email: "  Renata@Exemplo.TEST ", senha: " a b " }),
    ).toEqual({ email: "renata@exemplo.test", senha: " a b " });
  });

  it.each([
    [{ email: "", senha: "x" }],
    [{ email: "a@b.c", senha: "" }],
    [{ email: "a@b.c", senha: "x".repeat(129) }],
    [{ email: `${"a".repeat(250)}@b.cc`, senha: "x" }],
    [{ email: "a@b.c", senha: "x", turnstile: "t".repeat(2049) }],
  ])("rejects %j", (input) => {
    expect(loginSchema.safeParse(input).success).toBe(false);
  });

  it("keeps an optional Turnstile token and volta, and drops unknown keys", () => {
    expect(
      loginSchema.parse({
        email: "a@b.c",
        senha: "x",
        turnstile: "tok",
        volta: "/fila",
        workspace: "outro",
      }),
    ).toEqual({ email: "a@b.c", senha: "x", turnstile: "tok", volta: "/fila" });
  });
});

describe("signupSchema (D-A1, U-P8)", () => {
  const valid = {
    nome: " Pessoa Exemplo ",
    workspace: " Plataforma ",
    email: " Pessoa@Exemplo.TEST ",
    senha: "doze-caracteres",
    aceite: true,
    turnstile: "tok",
    idempotencyKey: "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e",
  };

  it("trims and normalizes", async () => {
    const { signupSchema } = await import("@/features/panel-auth/schemas");
    expect(signupSchema.parse(valid)).toEqual({
      ...valid,
      nome: "Pessoa Exemplo",
      workspace: "Plataforma",
      email: "pessoa@exemplo.test",
    });
  });

  it.each([
    ["nome", ""],
    ["nome", "x".repeat(121)],
    ["workspace", "   "],
    ["workspace", "x".repeat(81)],
    ["email", "nao-e-email"],
    ["senha", "onze-chars!"],
    ["senha", "x".repeat(129)],
    ["aceite", false],
    ["turnstile", ""],
    ["idempotencyKey", "nao-uuid"],
  ])("rejects %s = %j, naming the field", async (field, value) => {
    const { signupSchema, signupIssues } =
      await import("@/features/panel-auth/schemas");
    const result = signupSchema.safeParse({ ...valid, [field]: value });
    expect(result.success).toBe(false);
    if (!result.success && field !== "idempotencyKey" && field !== "turnstile")
      expect(Object.keys(signupIssues(result.error.issues))).toEqual([field]);
  });
});
