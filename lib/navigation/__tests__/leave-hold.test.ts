import { afterEach, describe, expect, it, vi } from "vitest";

import { holdLeave, setLeaveHolder } from "@/lib/navigation/leave-hold";

afterEach(() => {
  setLeaveHolder(null);
});

describe("leave-hold (P8-005, P8-013)", () => {
  it("no holder: nothing is held", () => {
    expect(holdLeave(() => {})).toBe(false);
  });

  it("a registered holder keeps proceed and holds the leave", () => {
    const holder = vi.fn(() => true);
    setLeaveHolder(holder);
    const proceed = () => {};
    expect(holdLeave(proceed)).toBe(true);
    expect(holder).toHaveBeenCalledWith(proceed);
  });

  it("its unregister clears it", () => {
    const unregister = setLeaveHolder(() => true);
    unregister();
    expect(holdLeave(() => {})).toBe(false);
  });

  it("P8-013: an older unregister running after a newer register leaves the newer holder in place", () => {
    const unregisterOld = setLeaveHolder(() => true);
    const newer = vi.fn(() => true);
    setLeaveHolder(newer);
    unregisterOld();
    expect(holdLeave(() => {})).toBe(true);
    expect(newer).toHaveBeenCalledOnce();
  });
});
