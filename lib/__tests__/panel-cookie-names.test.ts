import { describe, expect, it } from "vitest";

import { panelCookieNames } from "@/lib/panel-cookie-names";

describe("panelCookieNames (ADR-0009 rule 3)", () => {
  it("is the __Host- pair with Secure everywhere but local http", () => {
    expect(panelCookieNames(false)).toEqual({
      session: "__Host-kybr_session",
      signup: "__Host-kybr_signup",
      secure: true,
    });
  });

  it("drops the prefix and Secure on local http only", () => {
    expect(panelCookieNames(true)).toEqual({
      session: "kybr_session",
      signup: "kybr_signup",
      secure: false,
    });
  });
});
