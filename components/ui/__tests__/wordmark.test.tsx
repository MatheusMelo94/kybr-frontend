import { readFileSync } from "node:fs";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Wordmark } from "@/components/ui/wordmark";

// Brand v1 B4 (identity.md › Logo): the supplied artwork as inline SVG.

describe("Wordmark", () => {
  it("is an image named Kybr (the brand in prose), never focusable", () => {
    render(<Wordmark variant="lockup" />);

    const mark = screen.getByRole("img", { name: "Kybr" });
    expect(mark).toHaveAttribute("focusable", "false");
    expect(mark.querySelector("path")).toHaveAttribute("fill", "currentColor");
  });

  it("takes another accessible name", () => {
    render(<Wordmark variant="inline" aria-label="Marca Kybr" />);
    expect(screen.getByRole("img", { name: "Marca Kybr" })).toBeInTheDocument();
  });

  it("lockup takes a width (the height follows the viewBox)", () => {
    render(<Wordmark variant="lockup" width={80} />);
    expect(screen.getByRole("img")).toHaveAttribute("width", "80");
    expect(screen.getByRole("img")).not.toHaveAttribute("height");
  });

  it("lockup keeps the source viewBox, clear space included", () => {
    render(<Wordmark variant="lockup" />);
    expect(screen.getByRole("img")).toHaveAttribute("viewBox", "0 0 4964 2727");
  });

  it("inline crops to the glyphs, so it can sit on the text's baseline", () => {
    render(<Wordmark variant="inline" />);
    expect(screen.getByRole("img")).toHaveAttribute(
      "viewBox",
      "409.6 409.6 4144.6 1908",
    );
  });

  it("keeps its paths at one decimal (the source has 17)", () => {
    const { container } = render(<Wordmark variant="lockup" />);
    const d = container.querySelector("path")?.getAttribute("d") ?? "";
    expect(d).not.toMatch(/\d\.\d{2}/);
  });
});

describe("the logo components are server-safe by construction", () => {
  it.each(["components/ui/wordmark.tsx", "components/panel/symbol.tsx"])(
    "%s has no 'use client' and imports nothing from features/",
    (file) => {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/^\s*["']use client["']/m);
      expect(source).not.toMatch(/from ["']@\/features\//);
    },
  );
});
