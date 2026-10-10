import { describe, expect, it } from "vitest";

import { pickMonState, type MonState } from "@/features/panel-alertas/state";
import type { Alert, Monitoring } from "@/lib/api/schemas/panel/alerts";

const ALERT = { id: "a".repeat(16) } as Alert;
const NEXT = "2026-10-12T09:00:00Z";
const LAST = "2026-10-05T09:00:00Z";

const unmonitored: Monitoring = { ativo: false, monitorados: 0 };
const nosweep: Monitoring = {
  ativo: true,
  monitorados: 5,
  proxima_varredura: NEXT,
};
const swept: Monitoring = { ...nosweep, ultima_varredura: LAST };

// plan-m7 § 3: every combination of D-M2 (failed or each shape) × alerts (0 or ≥ 1).
describe("pickMonState (plan-m7 § 3, AC 49)", () => {
  it.each<[string, Monitoring | undefined, Alert[], MonState]>([
    ["D-M2 failed, 0 alerts → error (Q3)", undefined, [], { kind: "error" }],
    [
      "D-M2 failed, alerts → success, no pill (G4)",
      undefined,
      [ALERT],
      { kind: "success" },
    ],
    ["nothing monitored, 0 alerts", unmonitored, [], { kind: "unmonitored" }],
    [
      "nothing monitored, old alerts → the list",
      unmonitored,
      [ALERT],
      { kind: "success" },
    ],
    ["monitored, no sweep yet", nosweep, [], { kind: "nosweep", data: NEXT }],
    [
      "monitored, no sweep, alerts → the list",
      nosweep,
      [ALERT],
      { kind: "success" },
    ],
    ["swept, 0 alerts", swept, [], { kind: "noalerts", data: LAST }],
    ["swept, alerts", swept, [ALERT], { kind: "success" }],
  ])("%s", (_, monitoring, alerts, expected) => {
    expect(pickMonState(monitoring, alerts)).toEqual(expected);
  });
});
