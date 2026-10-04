import { describe, expect, it } from "vitest";

import {
  confirmSchema,
  resetConfirmSchema,
  signupSchema,
} from "@/features/panel-auth/schemas";
import {
  CODE_PATTERN,
  RESET_TOKEN_PATTERN,
  isCode,
  isEmail,
  isResetToken,
  signupFieldIssues,
} from "@/features/panel-auth/validation";

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

describe("the code and the reset token: one pattern each (P4-012)", () => {
  it("exports the code and reset-token patterns the schemas import", () => {
    expect(String(CODE_PATTERN)).toBe(String(/^\d{6}$/));
    expect(String(RESET_TOKEN_PATTERN)).toBe(String(/^[A-Za-z0-9_-]{22,128}$/));
  });

  it.each(["123456", "12345", "1234567", "12a456", " 123456", ""])(
    "isCode agrees with confirmSchema on %j",
    (codigo) => {
      expect(isCode(codigo)).toBe(confirmSchema.safeParse({ codigo }).success);
    },
  );

  it.each([
    "a".repeat(22),
    "a".repeat(21),
    "a".repeat(128),
    "a".repeat(129),
    `${"a".repeat(21)}-`,
    `${"a".repeat(21)}.`,
    `${"a".repeat(21)}=`,
  ])("isResetToken agrees with resetConfirmSchema on %j", (token) => {
    expect(isResetToken(token)).toBe(
      resetConfirmSchema.safeParse({ token, senha: "x" }).success,
    );
  });
});
