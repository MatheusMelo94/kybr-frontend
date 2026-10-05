import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import GlobalError from "@/app/global-error";

// Link AC 40 names every /v/* screen for the Kybr footer, but global-error
// stays minimal (brand v1 B9): it ships to the client, and a failed root
// layout gets the error and the retry only.

describe("app/global-error", () => {
  it("renders the load error without the Kybr footer", () => {
    const html = renderToStaticMarkup(
      <GlobalError error={new Error("x")} reset={() => {}} />,
    );

    expect(html).toContain("<main");
    expect(html).not.toContain("<footer");
    expect(html).not.toMatch(/aria-label="Kybr"/);
  });
});
