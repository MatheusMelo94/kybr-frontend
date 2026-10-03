import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PollCaseViewResult } from "@/features/seller-link/actions";
import { CaseLiveStatus } from "@/features/seller-link/components/case/case-live-status";

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

let hidden = false;

/** Advances fake time and lets the awaited checks settle. */
async function elapse(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function setHidden(value: boolean): void {
  hidden = value;
  document.dispatchEvent(new Event("visibilitychange"));
}

function renderSwitch(msUntilTimeout = 10_000): ReturnType<typeof render> {
  return render(
    <CaseLiveStatus
      mode="switch"
      slug={SLUG}
      token={TOKEN}
      msUntilTimeout={msUntilTimeout}
      verifying={<h1>verificando</h1>}
      analysis={<h1>em análise</h1>}
      analysisAnnouncement="em análise"
    />,
  );
}

function renderWatch(): ReturnType<typeof render> {
  return render(
    <CaseLiveStatus
      mode="watch"
      slug={SLUG}
      token={TOKEN}
      viewKey="analysis-timeout"
    />,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  hidden = false;
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  });
  poll.mockReset();
  refresh.mockReset();
  poll.mockResolvedValue({ ok: true, viewKey: "verifying" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CaseLiveStatus: status checks (tech-design § 3)", () => {
  it("AC 15: checks every 2 s while verifying, with this case's slug and token", async () => {
    renderSwitch();

    await elapse(1_999);
    expect(poll).not.toHaveBeenCalled();
    await elapse(1);
    expect(poll).toHaveBeenCalledTimes(1);
    expect(poll).toHaveBeenCalledWith(SLUG, TOKEN);
    await elapse(2_000);
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it("AC 15 / AC 16: refreshes once when a check returns a result, then stops checking", async () => {
    poll
      .mockResolvedValueOnce({ ok: true, viewKey: "verifying" })
      .mockResolvedValue({ ok: true, viewKey: "approved" });
    renderSwitch();

    await elapse(4_000);
    expect(refresh).toHaveBeenCalledTimes(1);

    await elapse(30_000);
    expect(poll).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("never refreshes while the view stays the same", async () => {
    renderSwitch();

    await elapse(8_000);
    expect(poll).toHaveBeenCalledTimes(4);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("checks every 10 s once the switch has shown em análise, and ignores a late verificando", async () => {
    renderSwitch(3_000);

    await elapse(2_000); // check 1 (verifying), next one in 2 s
    await elapse(1_000); // the switch
    expect(
      screen.getByRole("heading", { name: "em análise" }),
    ).toBeInTheDocument();

    await elapse(1_000); // check 2: a late "verifying" answer is not a change
    expect(poll).toHaveBeenCalledTimes(2);
    expect(refresh).not.toHaveBeenCalled();

    await elapse(9_999);
    expect(poll).toHaveBeenCalledTimes(2);
    await elapse(1);
    expect(poll).toHaveBeenCalledTimes(3);
  });

  it("AC 17 (arrival): in watch mode, checks every 10 s and refreshes when the result arrives", async () => {
    poll.mockResolvedValue({ ok: true, viewKey: "analysis-timeout" });
    const { container } = renderWatch();
    expect(container).toBeEmptyDOMElement();

    await elapse(9_999);
    expect(poll).not.toHaveBeenCalled();
    await elapse(1);
    expect(poll).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();

    poll.mockResolvedValue({ ok: true, viewKey: "approved" });
    await elapse(10_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("AC 17: a CASO_NAO_ENCONTRADO check refreshes, so the page shows Case not found", async () => {
    poll.mockResolvedValue({ ok: false, reason: "not_found" });
    renderSwitch();

    await elapse(2_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("rule 7: a failed check stays silent and retries after 5 s", async () => {
    poll
      .mockResolvedValueOnce({ ok: false, reason: "failed" })
      .mockResolvedValue({ ok: true, viewKey: "verifying" });
    renderSwitch();

    await elapse(2_000);
    expect(poll).toHaveBeenCalledTimes(1);
    await elapse(4_999);
    expect(poll).toHaveBeenCalledTimes(1);
    await elapse(1);
    expect(poll).toHaveBeenCalledTimes(2);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("rule 6: pauses while the tab is hidden, still switches at 10 s, and checks at once when visible", async () => {
    hidden = true;
    renderSwitch(3_000);

    await elapse(20_000);
    expect(poll).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "em análise" }),
    ).toBeInTheDocument();

    await act(async () => {
      setHidden(false);
    });
    expect(poll).toHaveBeenCalledTimes(1);
  });

  it("rule 8: runs one check at a time", async () => {
    poll.mockReturnValue(new Promise(() => {}));
    renderSwitch();

    await elapse(30_000);
    expect(poll).toHaveBeenCalledTimes(1);
  });

  it("keeps re-rendering while a refresh is outstanding, and stops when replaced (Next 15.5 workaround)", async () => {
    poll.mockResolvedValue({ ok: true, viewKey: "approved" });
    const { unmount } = renderSwitch(60_000);

    expect(vi.getTimerCount()).toBe(2); // the 10 s switch and the next check
    await elapse(2_000); // the check returns a result → refresh
    expect(refresh).toHaveBeenCalledTimes(1);
    // The switch timer, plus the nudge; no check is scheduled any more.
    expect(vi.getTimerCount()).toBe(2);

    await elapse(5_000);
    expect(poll).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops checking on unmount", async () => {
    const { unmount } = renderSwitch();

    unmount();
    await elapse(30_000);
    expect(poll).not.toHaveBeenCalled();
  });
});
