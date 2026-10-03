import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import RootLayout, { viewport } from "@/app/layout";

// next/font is a build-time transform; record how the layout configures it.
const fontCalls = vi.hoisted((): unknown[] => []);

// The nonce CSP (middleware.ts) needs every page rendered per request.
const connection = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("next/server", () => ({ connection }));

vi.mock("next/font/google", () => ({
  Inter: (options: unknown) => {
    fontCalls.push(options);
    return {
      className: "inter-class",
      variable: "inter-variable-class",
      style: { fontFamily: "Inter" },
    };
  },
}));

function surfaceHex(selectorMarker: string): string | undefined {
  const css = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../app/globals.css"),
    "utf8",
  );
  const start = css.indexOf(selectorMarker);
  return css.slice(start).match(/--color-surface:\s*(#[0-9a-f]{6});/)?.[1];
}

describe("RootLayout", () => {
  it("loads Inter as a self-hosted variable font: latin subset, swap, --font-inter", () => {
    expect(fontCalls).toEqual([
      { subsets: ["latin"], display: "swap", variable: "--font-inter" },
    ]);
  });

  it("renders <html lang=pt-BR> carrying the Inter variable class", async () => {
    const markup = renderToStaticMarkup(
      await RootLayout({ children: <p>conteúdo</p> }),
    );
    const html = new DOMParser().parseFromString(
      markup,
      "text/html",
    ).documentElement;

    expect(html.getAttribute("lang")).toBe("pt-BR");
    expect(html.classList.contains("inter-variable-class")).toBe(true);
    expect(html.querySelector("body p")?.textContent).toBe("conteúdo");
  });

  it("renders per request, so each response's scripts get that request's CSP nonce", async () => {
    await RootLayout({ children: null });

    expect(connection).toHaveBeenCalledTimes(1);
  });

  it("declares both color schemes", () => {
    expect(viewport.colorScheme).toBe("light dark");
  });

  it("sets the browser theme color to the light and dark surface tokens", () => {
    expect(viewport.themeColor).toEqual([
      { media: "(prefers-color-scheme: light)", color: surfaceHex("@theme {") },
      {
        media: "(prefers-color-scheme: dark)",
        color: surfaceHex(':root:not([data-theme="light"]) {'),
      },
    ]);
  });
});
