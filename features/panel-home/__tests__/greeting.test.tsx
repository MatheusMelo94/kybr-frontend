import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Greeting } from "@/features/panel-home/components/greeting";
import { firstName, greetingKey } from "@/features/panel-home/greeting";

// T131/T132 (AC 53): home.greet.* by the America/Sao_Paulo hour (UTC−3).

describe("greetingKey", () => {
  it.each([
    ["2026-10-10T08:59:00Z", "home.greet.evening"], // 05:59
    ["2026-10-10T09:00:00Z", "home.greet.morning"], // 06:00
    ["2026-10-10T14:59:00Z", "home.greet.morning"], // 11:59
    ["2026-10-10T15:00:00Z", "home.greet.afternoon"], // 12:00
    ["2026-10-10T20:59:00Z", "home.greet.afternoon"], // 17:59
    ["2026-10-10T21:00:00Z", "home.greet.evening"], // 18:00
    ["2026-10-11T02:30:00Z", "home.greet.evening"], // 23:30
    ["2026-10-11T03:00:00Z", "home.greet.evening"], // 00:00
  ])("%s → %s", (iso, key) => {
    expect(greetingKey(new Date(iso))).toBe(key);
  });
});

describe("firstName", () => {
  it.each([
    ["Renata Exemplo", "Renata"],
    ["  Ana  Maria ", "Ana"],
    ["Única", "Única"],
  ])("%j → %j", (nome, first) => {
    expect(firstName(nome)).toBe(first);
  });
});

describe("Greeting", () => {
  it("is the page's h1, with the first name", () => {
    render(
      <Greeting nome="Renata Exemplo" now={new Date("2026-10-10T13:00:00Z")} />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Bom dia, Renata." }),
    ).toBeInTheDocument();
  });
});
