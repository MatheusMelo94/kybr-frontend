import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CopyLinkButton } from "@/components/panel/copy-link-button";
import { ToastProvider } from "@/components/panel/toast";

// T132: the copy button promoted from M6's RequestLinkPanel (F9 kept: the
// link is only an input's value; the clipboard is only written, on click).

const LINK = "https://kybr.test/v/loja-exemplo";
const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
});
afterEach(() => {
  // @ts-expect-error: the test's own property.
  delete navigator.clipboard;
});

function renderButton(inputVisible: "always" | "on-error") {
  return render(
    <ToastProvider closeLabel="Fechar">
      <CopyLinkButton
        value={LINK}
        label="Copiar link de cadastro"
        inputLabel="Link de cadastro"
        inputVisible={inputVisible}
      />
    </ToastProvider>,
  );
}

const button = () =>
  screen.getByRole("button", { name: "Copiar link de cadastro" });
const toastText = () => screen.queryByRole("status")?.textContent ?? "";

describe("CopyLinkButton", () => {
  it("on-error: no input until a copy fails; a success toasts toast.link_copied without the link", async () => {
    writeText.mockResolvedValueOnce(undefined);
    renderButton("on-error");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(writeText).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(button()));
    expect(writeText).toHaveBeenCalledWith(LINK);
    expect(toastText()).toContain("Link copiado");
    expect(toastText()).not.toContain(LINK);
  });

  it("a denial: copy.error and the URL shown, focused and selected for a manual copy", async () => {
    writeText.mockRejectedValueOnce(new Error("NotAllowedError"));
    renderButton("on-error");
    await act(async () => fireEvent.click(button()));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não conseguimos copiar. Selecione o link e copie manualmente.",
    );
    const input = screen.getByRole<HTMLInputElement>("textbox", {
      name: "Link de cadastro",
    });
    expect(input).toHaveValue(LINK);
    expect(input).toHaveFocus();
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(LINK.length);
  });

  it("always: the input is there from the start, read-only", () => {
    renderButton("always");
    expect(
      screen.getByRole("textbox", { name: "Link de cadastro" }),
    ).toHaveAttribute("readonly");
  });

  it("F9: the link is never an href, a title or a label", () => {
    const { container } = renderButton("always");
    for (const attribute of ["href", "title", "aria-label", "data-value"])
      for (const element of container.querySelectorAll(`[${attribute}]`))
        expect(element.getAttribute(attribute)).not.toContain(LINK);
  });
});
