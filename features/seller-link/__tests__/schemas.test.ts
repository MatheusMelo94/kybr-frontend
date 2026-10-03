import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  contactEmailSchema,
  verifySchema,
} from "@/features/seller-link/schemas";

const valid = { cnpj: "12.abc.345/01de-35", responsavel: "Maria Exemplo" };

function issues(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}): string[] {
  return (result.error?.issues ?? []).map(
    (issue) => `${issue.path.join(".")}:${issue.message}`,
  );
}

describe("verifySchema", () => {
  it("normalizes the CNPJ to 14 uppercase characters and tidies the name", () => {
    const result = verifySchema.safeParse({
      ...valid,
      responsavel: "  Maria   Exemplo  Silva ",
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      cnpj: "12ABC34501DE35",
      responsavel: "Maria Exemplo Silva",
    });
  });

  it("accepts a numeric CNPJ the same way", () => {
    expect(
      verifySchema.safeParse({ ...valid, cnpj: "11.222.333/0001-81" }).data
        ?.cnpj,
    ).toBe("11222333000181");
  });

  it.each([
    ["empty", ""],
    ["empty", undefined],
    ["incomplete", "12.ABC.345"],
    ["check_letters", "12.ABC.345/01DE-3A"],
    ["invalid", "12.ABC.345/01DE-36"],
  ])("gives the CNPJ a distinct %s issue", (reason, cnpj) => {
    expect(issues(verifySchema.safeParse({ ...valid, cnpj }))).toEqual([
      `cnpj:${reason}`,
    ]);
  });

  it.each([
    ["empty", ""],
    ["empty", "   "],
    ["empty", undefined],
    ["single", "Maria"],
    ["single", "  Maria  "],
  ])("gives the name a distinct %s issue for %j", (reason, responsavel) => {
    expect(issues(verifySchema.safeParse({ ...valid, responsavel }))).toEqual([
      `responsavel:${reason}`,
    ]);
  });

  it("reports every invalid field at once, CNPJ first", () => {
    expect(
      issues(verifySchema.safeParse({ cnpj: "12", responsavel: "Maria" })),
    ).toEqual(["cnpj:incomplete", "responsavel:single"]);
  });

  it("passes ref and ext_id through when they're at most 256 characters", () => {
    const result = verifySchema.safeParse({
      ...valid,
      ref: "onboarding",
      ext_id: "x".repeat(256),
    });

    expect(result.data).toMatchObject({
      ref: "onboarding",
      ext_id: "x".repeat(256),
    });
  });

  it.each([
    ["longer than 256 characters", "x".repeat(257)],
    ["empty", ""],
    ["not a string", ["a", "b"]],
  ])("drops ref and ext_id when %s, without failing", (_case, value) => {
    const result = verifySchema.safeParse({
      ...valid,
      ref: value,
      ext_id: value,
    });

    expect(result.success).toBe(true);
    expect(result.data?.ref).toBeUndefined();
    expect(result.data?.ext_id).toBeUndefined();
  });
});

describe("verifySchema: F07 bounds (threat model)", () => {
  it("NFC-normalizes the name", () => {
    expect(
      verifySchema.safeParse({ ...valid, responsavel: "Jose\u0301 Silva" }).data
        ?.responsavel,
    ).toBe("José Silva");
  });

  it("accepts letters, spaces, apostrophes, hyphens and periods", () => {
    expect(
      verifySchema.safeParse({ ...valid, responsavel: "Ana-Maria D'Ávila Jr." })
        .data?.responsavel,
    ).toBe("Ana-Maria D'Ávila Jr.");
  });

  it.each([
    ["’ (iOS smart punctuation)", "’"],
    ["‘", "‘"],
    ["ʼ", "ʼ"],
    ["´ (ABNT2 acute, completed)", "´"],
    ["` (backtick)", "`"],
  ])("reads the apostrophe look-alike %s as '", (_case, mark) => {
    expect(
      verifySchema.safeParse({ ...valid, responsavel: `Maria D${mark}Ávila` })
        .data?.responsavel,
    ).toBe("Maria D'Ávila");
  });

  it.each([
    ["markup", "Maria <b>Silva</b>"],
    ["digits", "Maria Silva 2"],
    ["a control character", "Maria\u0000 Silva"],
    ["an emoji", "Maria Silva 😀"],
    ["more than 120 characters", `Maria ${"a".repeat(120)}`],
  ])(
    "rejects a tampered name with %s (the field never sends one)",
    (_case, responsavel) => {
      expect(issues(verifySchema.safeParse({ ...valid, responsavel }))).toEqual(
        ["responsavel:invalid"],
      );
    },
  );

  it("accepts a name of exactly 120 characters", () => {
    const responsavel = `Maria ${"a".repeat(114)}`;

    expect(verifySchema.safeParse({ ...valid, responsavel }).success).toBe(
      true,
    );
  });

  it.each([
    ["a control character", "onboarding\u0000"],
    ["a tab", "a\tb"],
    ["non-ASCII", "ação"],
    ["a newline", "a\nb"],
  ])("drops ref and ext_id with %s, never echoing them", (_case, value) => {
    const result = verifySchema.safeParse({
      ...valid,
      ref: value,
      ext_id: value,
    });

    expect(result.success).toBe(true);
    expect(result.data?.ref).toBeUndefined();
    expect(result.data?.ext_id).toBeUndefined();
  });

  it("keeps printable ASCII ref and ext_id", () => {
    expect(
      verifySchema.safeParse({
        ...valid,
        ref: "utm=x&y=1",
        ext_id: "SELLER-42_a.b~c",
      }).data,
    ).toMatchObject({ ref: "utm=x&y=1", ext_id: "SELLER-42_a.b~c" });
  });
});

describe("contactEmailSchema", () => {
  it("accepts and trims a valid address", () => {
    expect(
      contactEmailSchema.safeParse({ email: " joao@empresa.com.br " }).data,
    ).toEqual({
      email: "joao@empresa.com.br",
    });
  });

  it.each([
    ["empty", ""],
    ["empty", "  "],
    ["empty", undefined],
    ["invalid", "joao@"],
    ["invalid", "joao empresa.com.br"],
  ])("gives a distinct %s issue for %j", (reason, email) => {
    expect(issues(contactEmailSchema.safeParse({ email }))).toEqual([
      `email:${reason}`,
    ]);
  });
});

describe("schemas.ts", () => {
  it("imports zod/mini only, to keep client bundles small (ADR-0003)", () => {
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../schemas.ts"),
      "utf8",
    );

    expect(source).toMatch(/from "zod\/mini"/);
    expect(source).not.toMatch(/from "zod"/);
  });
});
