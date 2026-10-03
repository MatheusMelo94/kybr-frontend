import { act, render, screen } from "@testing-library/react";
import { Profiler, type JSX, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PollCaseViewResult } from "@/features/seller-link/actions";
import { CaseLiveStatus } from "@/features/seller-link/components/case/case-live-status";
import { CaseViewTransition } from "@/features/seller-link/components/case/case-view-transition";

const poll = vi.hoisted(() =>
  vi.fn<(slug: unknown, token: unknown) => Promise<PollCaseViewResult>>(),
);
vi.mock("@/features/seller-link/actions", () => ({ pollCaseViewAction: poll }));

// Stable, like Next's useRouter().
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
const refresh = router.refresh;
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const SLUG = "loja-exemplo";
const TOKEN = "tokaprovado0000000000000";
const BANNER = "Sem conexão. Assim que a internet voltar, continuamos daqui.";

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

let hidden = false;
let onLine = true;
/** Fake-clock times (ms since the test started) at which each check was sent. */
let sentAt: number[] = [];
let startedAt = 0;
/** Commits of the CaseLiveStatus subtree: a re-render shows up here. */
let commits = 0;

/** Advances fake time and lets the awaited checks settle. */
async function elapse(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function setOnLine(value: boolean): Promise<void> {
  onLine = value;
  await act(async () => {
    window.dispatchEvent(new Event(value ? "online" : "offline"));
  });
}

async function setHidden(value: boolean): Promise<void> {
  hidden = value;
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

/** Gaps between consecutive checks, in seconds. */
function gaps(): number[] {
  return sentAt
    .slice(1)
    .map((at, index) => (at - (sentAt[index] ?? 0)) / SECOND);
}

function Counted({ children }: { children: ReactNode }): JSX.Element {
  return (
    <Profiler id="live" onRender={() => (commits += 1)}>
      {children}
    </Profiler>
  );
}

function switchStatus(msUntilTimeout = 10 * SECOND): JSX.Element {
  return (
    <CaseLiveStatus
      mode="switch"
      slug={SLUG}
      token={TOKEN}
      offlineBanner={BANNER}
      msUntilTimeout={msUntilTimeout}
      verifying={<h1>verificando</h1>}
      analysis={<h1>em análise</h1>}
      analysisAnnouncement="em análise"
    />
  );
}

function watchStatus(): JSX.Element {
  return (
    <CaseLiveStatus
      mode="watch"
      slug={SLUG}
      token={TOKEN}
      offlineBanner={BANNER}
      viewKey="analysis-timeout"
    />
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  startedAt = Date.now();
  sentAt = [];
  commits = 0;
  hidden = false;
  onLine = true;
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  });
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => onLine,
  });
  poll.mockReset();
  refresh.mockReset();
  poll.mockImplementation(async () => {
    sentAt.push(Date.now() - startedAt);
    return { ok: true, viewKey: "verifying" };
  });
});

afterEach(() => {
  vi.useRealTimers();
});

/** Makes the next answers `result` (each call still records its time). */
function answer(result: PollCaseViewResult | Error): void {
  poll.mockImplementation(async () => {
    sentAt.push(Date.now() - startedAt);
    if (result instanceof Error) throw result;
    return result;
  });
}

describe("verificando (tech-design § 3 rules 1–3)", () => {
  it("AC 15: checks every 2 s while verifying, with this case's slug and token, and never refreshes while the view is the same", async () => {
    render(switchStatus());

    await elapse(1_999);
    expect(poll).not.toHaveBeenCalled();
    await elapse(6_001);
    expect(sentAt).toEqual([2_000, 4_000, 6_000, 8_000]);
    expect(poll).toHaveBeenCalledWith(SLUG, TOKEN);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("switches to em análise at msUntilTimeout, then checks on the 10 s rung; a late verificando is no change (Q4)", async () => {
    render(switchStatus(3_000));

    await elapse(3_000);
    expect(
      screen.getByRole("heading", { name: "em análise" }),
    ).toBeInTheDocument();
    await elapse(30_000);

    // 2 s and 4 s while verifying (the 4 s answer is a late "verifying": no
    // change), then the 10 s rung from the switch.
    expect(sentAt).toEqual([2_000, 4_000, 14_000, 24_000]);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("AC 16: refreshes once when a check returns another view, and doesn't check while the refresh is pending", async () => {
    answer({ ok: true, viewKey: "approved" });
    render(<Counted>{switchStatus(60 * SECOND)}</Counted>);

    await elapse(2_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    await elapse(9_000);
    expect(poll).toHaveBeenCalledTimes(1);
  });

  it("AC 17: a not_found check refreshes, so the page shows Case not found or Link not found", async () => {
    answer({ ok: false, reason: "not_found" });
    render(switchStatus());

    await elapse(2_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("em análise: the visible-time ladder (Architect, M2-02)", () => {
  it("checks every 10 s for the first 5 min, 30 s until 30 min, 60 s until 2 h", async () => {
    answer({ ok: true, viewKey: "analysis-timeout" });
    render(watchStatus());

    await elapse(5 * MINUTE);
    expect(sentAt).toHaveLength(30);
    expect(new Set(gaps())).toEqual(new Set([10]));

    sentAt = [];
    await elapse(25 * MINUTE);
    expect(new Set(gaps())).toEqual(new Set([30]));

    sentAt = [];
    await elapse(90 * MINUTE);
    expect(new Set(gaps())).toEqual(new Set([60]));
  });

  it("counts visible time only: hidden time doesn't move the ladder, and visible again checks at once", async () => {
    answer({ ok: true, viewKey: "analysis-timeout" });
    render(watchStatus());
    await elapse(2 * MINUTE);
    const before = sentAt.length;

    await setHidden(true);
    await elapse(60 * MINUTE);
    expect(sentAt).toHaveLength(before);

    await setHidden(false);
    expect(sentAt).toHaveLength(before + 1);
    sentAt = sentAt.slice(-1);
    await elapse(60 * SECOND);
    // Still under 5 visible minutes: the 10 s rung.
    expect(new Set(gaps())).toEqual(new Set([10]));
  });

  it("stops at 2 h of visible time with no timer and no banner; visible again restarts the ladder at 10 s", async () => {
    answer({ ok: true, viewKey: "analysis-timeout" });
    render(watchStatus());

    await elapse(2 * HOUR);
    const last = sentAt.at(-1) ?? 0;
    expect(last).toBeLessThan(2 * HOUR);
    await elapse(3 * HOUR);
    expect(sentAt.at(-1)).toBe(last);
    expect(screen.queryByText(BANNER)).toBeNull();

    const stoppedWith = sentAt.length;
    await setHidden(true);
    await setHidden(false);
    expect(sentAt).toHaveLength(stoppedWith + 1);
    expect(sentAt.at(-1)).toBeGreaterThan(last);
    sentAt = sentAt.slice(-1);
    await elapse(30 * SECOND);
    expect(new Set(gaps())).toEqual(new Set([10]));
  });

  it("after the stop, `online` also checks at once and restarts the ladder", async () => {
    answer({ ok: true, viewKey: "analysis-timeout" });
    render(watchStatus());
    await elapse(2 * HOUR + MINUTE);
    const stoppedWith = sentAt.length;

    await setOnLine(true);

    expect(sentAt).toHaveLength(stoppedWith + 1);
  });

  it("the ladder starts at the client switch in switch mode", async () => {
    render(switchStatus(4_000));
    await elapse(4_000); // the switch, 2 checks while verifying
    answer({ ok: true, viewKey: "analysis-timeout" });
    sentAt = [];

    await elapse(5 * MINUTE + 30 * SECOND);

    // 10 s rung until 5 min after the switch, then 30 s.
    expect(gaps().slice(0, 5)).toEqual([10, 10, 10, 10, 10]);
    expect(gaps().at(-1)).toBe(30);
  });
});

describe("failures (rule 7, M2-04, Q2)", () => {
  it("backs off quietly after non-network failures: max(cadence, 5 s × 2^(n−1)), capped at 60 s, reset on success", async () => {
    answer({ ok: false, reason: "failed" });
    render(switchStatus(HOUR));

    await elapse(2_000 + 5_000 + 10_000 + 20_000 + 40_000 + 60_000 + 60_000);
    expect(gaps()).toEqual([5, 10, 20, 40, 60, 60]);
    expect(screen.queryByText(BANNER)).toBeNull();

    answer({ ok: true, viewKey: "verifying" });
    await elapse(60_000 + 2_000);
    expect(gaps().slice(-1)).toEqual([2]);
  });

  it("M2-04: a rejected call that isn't a network TypeError (a WAF 429, a 5xx page) is silent and backs off", async () => {
    answer(new Error("An unexpected response was received from the server."));
    render(switchStatus(HOUR));

    await elapse(2_000 + 5_000 + 10_000);

    expect(gaps()).toEqual([5, 10]);
    expect(screen.queryByText(BANNER)).toBeNull();
  });

  it("Q2: a network TypeError while the browser says online shows the banner and retries at the cadence, no backoff; a success hides it", async () => {
    answer(new TypeError("Failed to fetch"));
    render(switchStatus(HOUR));

    await elapse(2_000);
    expect(screen.getByRole("status")).toHaveTextContent(BANNER);
    await elapse(6_000);
    expect(gaps()).toEqual([2, 2, 2]);
    expect(refresh).not.toHaveBeenCalled();

    answer({ ok: true, viewKey: "verifying" });
    await elapse(2_000);
    expect(screen.queryByText(BANNER)).toBeNull();
  });
});

describe("offline (rule 5; AC 29)", () => {
  it("going offline shows offline.banner as a status and pauses checks", async () => {
    render(switchStatus());
    await elapse(2_000);

    await setOnLine(false);

    expect(screen.getByRole("status")).toHaveTextContent(BANNER);
    await elapse(30_000);
    expect(poll).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("back online, the banner goes and a check runs at once", async () => {
    render(watchStatus());
    await setOnLine(false);

    await setOnLine(true);

    expect(screen.queryByText(BANNER)).toBeNull();
    expect(poll).toHaveBeenCalledTimes(1);
  });

  it("starts offline when the page opens without a connection, and checks nothing", async () => {
    onLine = false;
    render(switchStatus());
    await elapse(0);

    expect(screen.getByRole("status")).toHaveTextContent(BANNER);
    await elapse(10_000);
    expect(poll).not.toHaveBeenCalled();
  });

  it("the 10 s switch to em análise still happens while offline", async () => {
    render(switchStatus(3_000));
    await setOnLine(false);

    await elapse(3_000);

    expect(
      screen.getByRole("heading", { name: "em análise" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(BANNER);
  });

  it("keeps the status region mounted, so the banner is announced when it appears", async () => {
    render(switchStatus());
    const region = screen.getByRole("status");

    await setOnLine(false);

    expect(screen.getByRole("status")).toBe(region);
  });

  it("pauses while the tab is hidden, still switches, and checks at once when visible (rule 6)", async () => {
    hidden = true;
    render(switchStatus(3_000));

    await elapse(20_000);
    expect(poll).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "em análise" }),
    ).toBeInTheDocument();

    await setHidden(false);
    expect(poll).toHaveBeenCalledTimes(1);
  });
});

describe("the refresh nudge (tech-design § 3 rule 11; review 0010, 0014)", () => {
  it("same view after the refresh (replica lag): it re-renders until a 10 s cap, then checks resume and re-refresh", async () => {
    answer({ ok: true, viewKey: "approved" });
    render(<Counted>{switchStatus(HOUR)}</Counted>);
    await elapse(2_000);
    expect(refresh).toHaveBeenCalledTimes(1);

    const atRefresh = commits;
    await elapse(5_000);
    expect(commits).toBeGreaterThan(atRefresh); // nudging
    expect(poll).toHaveBeenCalledTimes(1); // and not checking

    await elapse(5_000); // the cap: 40 ticks × 250 ms
    const atCap = commits;
    await elapse(1_000);
    expect(poll).toHaveBeenCalledTimes(2); // checks resumed…
    expect(refresh).toHaveBeenCalledTimes(2); // …and the view still differs
    expect(commits).toBeGreaterThan(atCap);
  });

  it("stops once the cap is reached when checks find nothing new", async () => {
    answer({ ok: true, viewKey: "approved" });
    render(<Counted>{switchStatus(HOUR)}</Counted>);
    await elapse(2_000);
    answer({ ok: true, viewKey: "verifying" }); // the server caught up the other way

    await elapse(10_000 + 2_100);
    const settled = commits;
    await elapse(6_000);

    expect(commits).toBe(settled);
  });

  it("never ticks while the tab is hidden", async () => {
    answer({ ok: true, viewKey: "approved" });
    render(<Counted>{switchStatus(HOUR)}</Counted>);
    await elapse(2_000);

    await setHidden(true);
    const hiddenAt = commits;
    await elapse(30_000);

    expect(commits).toBe(hiddenAt);
  });

  it("reuse path: the server's em análise remounts the island (keyed wrapper), so the nudge ends and checks run on the 10 s rung", async () => {
    answer({ ok: true, viewKey: "analysis-timeout" });
    const { rerender } = render(
      <CaseViewTransition viewKey="verifying" announcement="Consultando…">
        <Counted>{switchStatus(HOUR)}</Counted>
      </CaseViewTransition>,
    );
    await elapse(2_000);
    expect(refresh).toHaveBeenCalledTimes(1);

    rerender(
      <CaseViewTransition viewKey="analysis-timeout" announcement="em análise">
        <Counted>{watchStatus()}</Counted>
      </CaseViewTransition>,
    );
    sentAt = [];
    const afterSwap = commits;
    await elapse(5_000);
    expect(commits).toBe(afterSwap); // no nudging

    await elapse(25_000);
    expect(gaps()).toEqual([10, 10]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("leaves nothing running after unmount", async () => {
    answer({ ok: true, viewKey: "approved" });
    const { unmount } = render(switchStatus(HOUR));
    await elapse(2_000);

    unmount();
    await elapse(60_000);

    expect(poll).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
