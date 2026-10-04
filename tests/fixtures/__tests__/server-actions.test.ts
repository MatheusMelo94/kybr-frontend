// @vitest-environment node
import { describe, expect, it } from "vitest";

import { serverActionId } from "../server-actions.ts";

// Review 0019: E2E specs recognise a status check by its Server Action id,
// read from the build's server-reference-manifest.json, never by the shape of
// its arguments (T26b adds a third one).
const manifest = {
  node: {
    "4020eff3a47102fe1507127057c4b0885f430c1279": {
      filename: "features/seller-link/actions.ts",
      exportedName: "startVerification",
    },
    "605db3dffca9f2fccb1125daee774ed79235939776": {
      filename: "features/seller-link/actions.ts",
      exportedName: "pollCaseViewAction",
    },
    "70aa00000000000000000000000000000000000000": {
      filename: "features/other/actions.ts",
      exportedName: "pollCaseViewAction",
    },
  },
  edge: {},
};

describe("serverActionId", () => {
  it("finds an action's id by its file and export name", () => {
    expect(
      serverActionId(
        manifest,
        "features/seller-link/actions.ts",
        "pollCaseViewAction",
      ),
    ).toBe("605db3dffca9f2fccb1125daee774ed79235939776");
  });

  it("fails loudly when the build has no such action, so no count passes vacuously", () => {
    expect(() =>
      serverActionId(manifest, "features/seller-link/actions.ts", "renamed"),
    ).toThrow(/renamed/);
  });
});
