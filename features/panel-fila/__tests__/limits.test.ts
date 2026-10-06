import { describe, expect, it } from "vitest";

import { DECIDE_TIMEOUT_MS } from "@/features/panel-fila/limits";
import {
  FILA_NEW_CASES_INTERVAL_MS,
  POLL_TIMEOUT_MS,
} from "@/features/panel-shell/polling";

describe("the Fila's cadences and bounds", () => {
  it("polls for new cases every 60 s, with the shared 4 s poll timeout (ADR-0011 rule 3)", () => {
    expect(FILA_NEW_CASES_INTERVAL_MS).toBe(60_000);
    expect(POLL_TIMEOUT_MS).toBe(4_000);
  });

  it("F6: a decision with no result in 15 s is an unknown outcome", () => {
    expect(DECIDE_TIMEOUT_MS).toBe(15_000);
  });
});
