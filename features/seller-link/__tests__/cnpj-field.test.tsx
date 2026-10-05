import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type JSX } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  CNPJ_KEYBOARD,
  CnpjField,
} from "@/features/seller-link/components/cnpj-field";
import type { CnpjIssue } from "@/features/seller-link/schemas";

type HarnessProps = {
  onValidCnpj?: (cnpj: string) => void;
  onValueChange?: (cnpj: string) => void;
  submitError?: CnpjIssue;
  initial?: string;
};

function Harness({
  onValidCnpj = () => {},
  onValueChange,
  submitError,
  initial = "",
}: HarnessProps): JSX.Element {
  const [value, setValue] = useState(initial);
  return (
    <CnpjField
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange?.(next);
      }}
      onValidCnpj={onValidCnpj}
      submitError={submitError}
    />
  );
}

function input(): HTMLInputElement {
  return screen.getByRole("textbox", { name: "CNPJ da empresa" });
}

describe("CNPJ_KEYBOARD", () => {
  it("is the text keyboard in capital letters, with autocorrect off (owner decision, spec v2)", () => {
    expect(CNPJ_KEYBOARD).toEqual({
      type: "text",
      inputMode: "text",
      autoCapitalize: "characters",
      autoCorrect: "off",
      spellCheck: false,
      autoComplete: "off",
    });
  });
});

describe("CnpjField", () => {
  it("AC 5: carries the keyboard attributes and links the hint", () => {
    render(<Harness />);

    expect(input()).toHaveAttribute("type", "text");
    expect(input()).toHaveAttribute("inputmode", "text");
    expect(input()).toHaveAttribute("autocapitalize", "characters");
    expect(input()).toHaveAttribute("autocorrect", "off");
    expect(input()).toHaveAttribute("spellcheck", "false");
    expect(input()).toHaveAttribute("autocomplete", "off");
    expect(input()).toHaveAttribute("placeholder", "00.000.000/0000-00");
    expect(input()).toHaveAccessibleDescription(
      "CNPJs novos podem ter letras.",
    );
  });

  it("sets the CNPJ in tabular figures (brand v1, identity.md › Typography)", () => {
    render(<Harness />);
    // The class is the contract here: tabular-nums is font-variant-numeric.
    expect(input()).toHaveClass("tabular-nums");
  });

  it.each([
    ["12abc34501de35", "12.ABC.345/01DE-35"],
    ["11222333000181", "11.222.333/0001-81"],
  ])("AC 5: typing %j shows %j", async (typed, shown) => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(input(), typed);

    expect(input()).toHaveValue(shown);
  });

  it("AC 5: ignores characters outside A–Z and 0–9, and stops at 14", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Harness onValueChange={onValueChange} />);

    await user.type(input(), "12-ab é c!34501de35 99");

    expect(input()).toHaveValue("12.ABC.345/01DE-35");
    expect(onValueChange).toHaveBeenLastCalledWith("12ABC34501DE35");
  });

  it("AC 5: keeps the caret after the last typed character", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(input(), "12abc");
    expect(input().selectionStart).toBe("12.ABC".length);

    input().setSelectionRange(3, 3); // after "12."
    await user.keyboard("9");

    expect(input()).toHaveValue("12.9AB.C");
    expect(input().selectionStart).toBe(4); // after the 9
  });

  it.each(["12.abc.345/01de-35", "12ABC34501DE35", "12 ABC 345 01DE 35"])(
    "AC 5: pasting %j gives the same masked value",
    async (pasted) => {
      const user = userEvent.setup();
      render(<Harness />);

      await user.click(input());
      await user.paste(pasted);

      expect(input()).toHaveValue("12.ABC.345/01DE-35");
    },
  );

  it.each(["11.222.333/0001-81", "12.ABC.345/01DE-35"])(
    "AC 6: %s calls onValidCnpj once with the normalized value",
    async (cnpj) => {
      const user = userEvent.setup();
      const onValidCnpj = vi.fn();
      render(<Harness onValidCnpj={onValidCnpj} />);

      await user.type(input(), cnpj);
      await user.type(input(), "X"); // ignored: already 14

      expect(onValidCnpj).toHaveBeenCalledTimes(1);
      expect(onValidCnpj).toHaveBeenCalledWith(cnpj.replace(/[^0-9A-Z]/g, ""));
      expect(input()).not.toHaveAttribute("aria-invalid");
    },
  );

  it.each([
    [
      "wrong check digits",
      "12.ABC.345/01DE-36",
      "CNPJ inválido. Confira o que foi digitado.",
    ],
    [
      "14 identical characters",
      "11111111111111",
      "CNPJ inválido. Confira o que foi digitado.",
    ],
    [
      "a letter in the check digits",
      "12.ABC.345/01DE-3A",
      "CNPJ inválido. Os dois últimos caracteres são sempre números.",
    ],
  ])(
    "AC 6: %s shows its error linked to the field, and never calls onValidCnpj",
    async (_case, cnpj, message) => {
      const user = userEvent.setup();
      const onValidCnpj = vi.fn();
      render(<Harness onValidCnpj={onValidCnpj} />);

      await user.type(input(), cnpj);

      expect(input()).toHaveAttribute("aria-invalid", "true");
      expect(input()).toHaveAccessibleDescription(
        `CNPJs novos podem ter letras. ${message}`,
      );
      expect(onValidCnpj).not.toHaveBeenCalled();
    },
  );

  it("shows no error while fewer than 14 characters are in", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(input(), "12ABC");

    expect(input()).not.toHaveAttribute("aria-invalid");
  });

  it.each([
    ["incomplete", "O CNPJ tem 14 caracteres. Confira se falta algum."],
    ["empty", "Informe o CNPJ da empresa."],
  ] as const)(
    "shows the submit-time %s error it's given",
    (reason, message) => {
      render(
        <Harness
          submitError={reason}
          initial={reason === "empty" ? "" : "12ABC"}
        />,
      );

      expect(input()).toHaveAccessibleDescription(
        `CNPJs novos podem ter letras. ${message}`,
      );
    },
  );

  it("forwards its ref to the input", () => {
    const ref = { current: null as HTMLInputElement | null };
    render(
      <CnpjField
        value=""
        onValueChange={() => {}}
        onValidCnpj={() => {}}
        ref={ref}
      />,
    );

    expect(ref.current).toBe(input());
  });

  it("keeps characters typed before hydration (tech-design R3)", async () => {
    const onValueChange = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    container.innerHTML = renderToString(<Harness />);
    container.querySelector("input")!.value = "12abc";

    await act(async () => {
      hydrateRoot(container, <Harness onValueChange={onValueChange} />);
    });

    expect(onValueChange).toHaveBeenCalledWith("12ABC");
    expect(container.querySelector("input")).toHaveValue("12.ABC");
    container.remove();
  });
});
