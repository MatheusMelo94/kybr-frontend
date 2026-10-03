import { describe, expect, it } from "vitest";

import { maskCnpj, normalizeCnpj, validateCnpj } from "@/lib/cnpj";

// Spec v2 § CNPJ field behavior (IN RFB 2.229/2024).
describe("normalizeCnpj", () => {
  it.each([
    "12.abc.345/01de-35",
    "12ABC34501DE35",
    "12 ABC 345 01DE 35",
    "12abc34501de35",
  ])("turns %j into 12ABC34501DE35", (raw) => {
    expect(normalizeCnpj(raw)).toBe("12ABC34501DE35");
  });

  it("drops accented letters, ç and ß instead of folding or expanding them", () => {
    expect(normalizeCnpj("1É2ç3ß4")).toBe("1234");
  });

  it("cuts to 14 characters", () => {
    expect(normalizeCnpj("12ABC34501DE35XYZ99")).toBe("12ABC34501DE35");
  });

  it("doesn't correct look-alike characters (O/0, I/1)", () => {
    expect(normalizeCnpj("I2.ABC.345/O1DE-35")).toBe("I2ABC345O1DE35");
  });

  it("returns an empty string for nothing usable", () => {
    expect(normalizeCnpj(" ./-")).toBe("");
  });
});

describe("maskCnpj", () => {
  it.each([
    ["12ABC34501DE35", "12.ABC.345/01DE-35"],
    ["11222333000181", "11.222.333/0001-81"],
  ])("masks %s as %s", (normalized, masked) => {
    expect(maskCnpj(normalized)).toBe(masked);
  });

  it.each([
    ["", ""],
    ["1", "1"],
    ["12", "12"],
    ["123", "12.3"],
    ["12345", "12.345"],
    ["123456", "12.345.6"],
    ["12345678", "12.345.678"],
    ["123456789", "12.345.678/9"],
    ["123456789012", "12.345.678/9012"],
    ["1234567890123", "12.345.678/9012-3"],
  ])(
    "masks partial input %j as %j, with no trailing separator",
    (normalized, masked) => {
      expect(maskCnpj(normalized)).toBe(masked);
    },
  );
});

describe("validateCnpj", () => {
  it.each([
    "11.222.333/0001-81",
    "12.345.678/0001-95",
    "98.765.432/0001-98",
    "12.ABC.345/01DE-35",
  ])("accepts %s", (cnpj) => {
    expect(validateCnpj(normalizeCnpj(cnpj))).toBe("ok");
  });

  it.each([
    ["wrong check digits", "12.ABC.345/01DE-36"],
    ["wrong numeric check digits", "11.222.333/0001-80"],
    ["14 identical digits", "11.111.111/1111-11"],
    ["14 zeros", "00.000.000/0000-00"],
  ])("rejects %s as invalid", (_case, cnpj) => {
    expect(validateCnpj(normalizeCnpj(cnpj))).toBe("invalid");
  });

  it.each([
    ["a letter in the last position", "12.ABC.345/01DE-3A"],
    ["a letter in the 13th position", "12.ABC.345/01DE-A5"],
    ["14 identical letters", "AA.AAA.AAA/AAAA-AA"],
  ])("reports %s as check_letters", (_case, cnpj) => {
    expect(validateCnpj(normalizeCnpj(cnpj))).toBe("check_letters");
  });

  it.each(["1", "12.ABC", "12.ABC.345/01DE-3"])(
    "reports %j as incomplete",
    (cnpj) => {
      expect(validateCnpj(normalizeCnpj(cnpj))).toBe("incomplete");
    },
  );

  it("reports nothing as empty", () => {
    expect(validateCnpj("")).toBe("empty");
  });

  it("rejects 14 characters that weren't normalized first", () => {
    expect(validateCnpj("12abc34501de35")).toBe("invalid");
  });
});
