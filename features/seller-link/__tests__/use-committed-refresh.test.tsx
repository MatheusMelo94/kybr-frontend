import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LIVE_STATUS_SCHEDULE } from "@/features/seller-link/components/case/case-live-status";
import {
  REFRESH_NUDGE,
  useCommittedRefresh,
} from "@/features/seller-link/components/case/use-committed-refresh";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

let renders = 0;
let request: () => void = () => {};

function Probe({ settled }: { settled: boolean }): null {
  renders += 1;
  request = useCommittedRefresh(settled);
  return null;
}

/** One act per tick, so each nudge commits its own render. */
function tick(times: number): void {
  for (let i = 0; i < times; i += 1)
    act(() => vi.advanceTimersByTime(REFRESH_NUDGE.everyMs));
}

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  router.refresh.mockReset();
  renders = 0;
  setHidden(false);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useCommittedRefresh (tech-design § 3 rule 11 workaround)", () => {
  it("refreshes once per request, from a committed render", () => {
    render(<Probe settled={false} />);
    expect(router.refresh).not.toHaveBeenCalled();

    act(() => request());

    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("re-renders every 250 ms while not settled, at most 40 times", () => {
    render(<Probe settled={false} />);
    act(() => request());
    const before = renders;

    tick(100);

    expect(renders - before).toBe(REFRESH_NUDGE.maxTicks);
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("stops as soon as the server's render shows the change", () => {
    const { rerender } = render(<Probe settled={false} />);
    act(() => request());
    tick(2);

    rerender(<Probe settled />);
    const before = renders;
    tick(10);

    expect(renders).toBe(before);
  });

  it("never nudges while the tab is hidden, or before a request", () => {
    render(<Probe settled={false} />);
    const idle = renders;
    tick(10);
    expect(renders).toBe(idle);

    setHidden(true);
    act(() => request());
    const before = renders;
    tick(10);

    expect(renders).toBe(before);
  });

  it("stops on unmount", () => {
    const { unmount } = render(<Probe settled={false} />);
    act(() => request());
    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("REFRESH_NUDGE", () => {
  it("is CaseLiveStatus's rule 11 nudge itself, one source of truth", () => {
    expect(REFRESH_NUDGE).toBe(LIVE_STATUS_SCHEDULE.nudge);
  });
});
