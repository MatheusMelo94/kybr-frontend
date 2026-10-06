import { fireEvent, render, screen } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { Listbox } from "@/components/panel/listbox";

// jsdom has no layout: scrollIntoView is a spy here.
const scrollIntoView = vi.fn();
const original = Element.prototype.scrollIntoView;
beforeAll(() => {
  Element.prototype.scrollIntoView = scrollIntoView;
});
afterAll(() => {
  Element.prototype.scrollIntoView = original;
});

const OPTIONS = [
  { id: "c1", content: <span>Empresa Um Ltda</span> },
  { id: "c2", content: <span>Empresa Dois Ltda</span> },
  { id: "c3", content: <span>Empresa Três Ltda</span> },
];

const onOpen = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
});

function renderListbox(
  props: { selectedId?: string | null; disabled?: boolean } = {},
) {
  render(
    <Listbox
      label="Para decidir"
      options={OPTIONS}
      onOpen={onOpen}
      {...props}
    />,
  );
  return screen.getByRole("listbox", { name: "Para decidir" });
}

function activeName(listbox: HTMLElement): string | null {
  const id = listbox.getAttribute("aria-activedescendant");
  return id ? (document.getElementById(id)?.textContent ?? null) : null;
}

const key = (listbox: HTMLElement, name: string) =>
  fireEvent.keyDown(listbox, { key: name });

describe("Listbox (T95, spec AC 45)", () => {
  it("is one tab stop, named, with option roles, stable ids and aria-selected on selectedId", () => {
    const listbox = renderListbox({ selectedId: "c2" });
    expect(listbox).toHaveAttribute("tabindex", "0");

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);
    for (const option of options) {
      expect(option).not.toHaveAttribute("tabindex");
      expect(option.id).not.toBe("");
    }
    expect(options.map((o) => o.getAttribute("aria-selected"))).toEqual([
      "false",
      "true",
      "false",
    ]);
  });

  it("keeps option ids stable across renders", () => {
    const { rerender } = render(
      <Listbox label="Para decidir" options={OPTIONS} onOpen={onOpen} />,
    );
    const before = screen.getAllByRole("option").map((o) => o.id);
    rerender(
      <Listbox
        label="Para decidir"
        options={OPTIONS}
        onOpen={onOpen}
        selectedId="c3"
      />,
    );
    expect(screen.getAllByRole("option").map((o) => o.id)).toEqual(before);
  });

  it("the active descendant starts at the selected option, else the first", () => {
    expect(activeName(renderListbox({ selectedId: "c3" }))).toBe(
      "Empresa Três Ltda",
    );
  });

  it("starts at the first option without a selection", () => {
    expect(activeName(renderListbox())).toBe("Empresa Um Ltda");
  });

  it("Down/Up move the active option without wrapping", () => {
    const listbox = renderListbox();
    key(listbox, "ArrowUp");
    expect(activeName(listbox)).toBe("Empresa Um Ltda");
    key(listbox, "ArrowDown");
    key(listbox, "ArrowDown");
    expect(activeName(listbox)).toBe("Empresa Três Ltda");
    key(listbox, "ArrowDown");
    expect(activeName(listbox)).toBe("Empresa Três Ltda");
    key(listbox, "ArrowUp");
    expect(activeName(listbox)).toBe("Empresa Dois Ltda");
  });

  it("Home and End jump to the first and last", () => {
    const listbox = renderListbox({ selectedId: "c2" });
    key(listbox, "End");
    expect(activeName(listbox)).toBe("Empresa Três Ltda");
    key(listbox, "Home");
    expect(activeName(listbox)).toBe("Empresa Um Ltda");
  });

  it("scrolls the active option into view (block: nearest)", () => {
    const listbox = renderListbox();
    key(listbox, "ArrowDown");
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "nearest" });
  });

  it("Enter and Space open the active option", () => {
    const listbox = renderListbox();
    key(listbox, "ArrowDown");
    key(listbox, "Enter");
    expect(onOpen).toHaveBeenLastCalledWith("c2");
    key(listbox, "ArrowDown");
    key(listbox, " ");
    expect(onOpen).toHaveBeenLastCalledWith("c3");
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("a click opens that option and makes it active", () => {
    const listbox = renderListbox();
    fireEvent.click(screen.getByText("Empresa Três Ltda"));
    expect(onOpen).toHaveBeenCalledWith("c3");
    expect(activeName(listbox)).toBe("Empresa Três Ltda");
  });

  it("letter keys do nothing (WCAG 2.1.4)", () => {
    const listbox = renderListbox();
    key(listbox, "e");
    key(listbox, "j");
    key(listbox, "k");
    expect(activeName(listbox)).toBe("Empresa Um Ltda");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("disabled: aria-disabled, and neither keys nor clicks open", () => {
    const listbox = renderListbox({ disabled: true });
    expect(listbox).toHaveAttribute("aria-disabled", "true");
    key(listbox, "Enter");
    key(listbox, " ");
    fireEvent.click(screen.getByText("Empresa Dois Ltda"));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("falls back to the selected (or first) option when the active one leaves", () => {
    const { rerender } = render(
      <Listbox label="Para decidir" options={OPTIONS} onOpen={onOpen} />,
    );
    const listbox = screen.getByRole("listbox");
    key(listbox, "End");
    rerender(
      <Listbox
        label="Para decidir"
        options={OPTIONS.slice(0, 2)}
        onOpen={onOpen}
        selectedId="c2"
      />,
    );
    expect(activeName(listbox)).toBe("Empresa Dois Ltda");
  });

  it("has no active descendant when empty", () => {
    render(<Listbox label="Para decidir" options={[]} onOpen={onOpen} />);
    expect(screen.getByRole("listbox")).not.toHaveAttribute(
      "aria-activedescendant",
    );
  });
});
