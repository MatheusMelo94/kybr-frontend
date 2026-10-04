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
