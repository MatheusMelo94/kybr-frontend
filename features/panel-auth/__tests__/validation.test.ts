import { describe, expect, it } from "vitest";

import { signupSchema } from "@/features/panel-auth/schemas";
import { isEmail, signupFieldIssues } from "@/features/panel-auth/validation";

const valid = {
  nome: "Pessoa",
  workspace: "Plataforma",
  email: "pessoa@exemplo.test",
  senha: "doze-caracteres",
  aceite: true,
};

describe("the auth forms' client rules", () => {
  it.each(["a@b.co", " Pessoa@Exemplo.TEST "])("%j is an e-mail", (value) => {
    expect(isEmail(value)).toBe(true);
  });

  it.each(["", "x", "a@b", "a..b@c.co", "a b@c.co", `${"a".repeat(250)}@b.co`])(
    "%j isn't",
    (value) => {
      expect(isEmail(value)).toBe(false);
    },
  );

  it("names each broken sign-up field in form order", () => {
    expect(
      signupFieldIssues({
        nome: " ",
        workspace: "",
        email: "x",
        senha: "curta",
        aceite: false,
      }),
    ).toEqual(["nome", "workspace", "email", "senha", "aceite"]);
    expect(signupFieldIssues(valid)).toEqual([]);
  });

  it.each([
    { ...valid, nome: "x".repeat(121) },
    { ...valid, workspace: "x".repeat(81) },
    { ...valid, email: "nao-e-email" },
    { ...valid, senha: "x".repeat(129) },
    { ...valid, aceite: false },
    valid,
  ])("agrees with the server schema on %j", (values) => {
    const server = signupSchema.safeParse({
      ...values,
      turnstile: "t",
      idempotencyKey: "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e",
    }).success;
    expect(signupFieldIssues(values).length === 0).toBe(server);
  });
});
