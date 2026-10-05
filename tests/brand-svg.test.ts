// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";

// Security 0002 (INFO): the SVGs served from public/brand/ are static art.
// They carry their own sandboxing CSP (next.config.ts); this keeps the files
// themselves free of anything active.

const SVGS = readdirSync("public/brand")
  .filter((file) => file.endsWith(".svg"))
  .map((file) => `public/brand/${file}`);

describe("the brand SVG files", () => {
  it("exist", () => {
    expect(SVGS).toEqual(["public/brand/kybr-icon.svg"]);
  });

  it.each(SVGS)(
    "%s has no script, foreignObject, href, event handler or external reference",
    (file) => {
      const svg = readFileSync(file, "utf8");
      expect(svg).not.toMatch(/<script|<foreignObject|href=|\son\w+=|url\(/i);
    },
  );
});
