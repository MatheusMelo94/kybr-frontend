import { act, render } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Turnstile } from "@/features/panel-auth/components/turnstile";

type RenderOptions = {
  sitekey: string;
  callback: (token: string) => void;
  "error-callback": () => void;
  "expired-callback": () => void;
};

const scripts = vi.hoisted(() => ({
  props: [] as Record<string, unknown>[],
  mode: "ready" as "ready" | "error" | "pending",
}));
vi.mock("next/script", () => ({
  default: (props: Record<string, unknown>) => {
    scripts.props.push(props);
    queueMicrotask(() => {
      if (scripts.mode === "ready") (props.onReady as () => void)?.();
      if (scripts.mode === "error") (props.onError as () => void)?.();
    });
    return null;
  },
}));

let options: RenderOptions | undefined;
const turnstile = {
  render: vi.fn((_el: HTMLElement, opts: RenderOptions) => {
    options = opts;
    return "widget-1";
  }),
  reset: vi.fn(),
  remove: vi.fn(),
};

function renderWidget(props: Partial<ComponentProps<typeof Turnstile>> = {}) {
  const onToken = vi.fn();
  const onError = vi.fn();
  const result = render(
    <Turnstile
      siteKey="1x00000000000000000000AA"
      nonce="nonce-123"
      onToken={onToken}
      onError={onError}
      {...props}
    />,
  );
  return { onToken, onError, ...result };
}

beforeEach(() => {
  scripts.props = [];
  scripts.mode = "ready";
  options = undefined;
  (window as unknown as { turnstile?: unknown }).turnstile = turnstile;
  vi.clearAllMocks();
});

afterEach(() => {
  delete (window as unknown as { turnstile?: unknown }).turnstile;
});

describe("Turnstile (ADR-0009 rule 13)", () => {
  it("loads Cloudflare's script through next/script, with the nonce, after the page is interactive", async () => {
    renderWidget();
    await act(async () => {});

    expect(scripts.props[0]).toMatchObject({
      src: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
      strategy: "afterInteractive",
      nonce: "nonce-123",
    });
  });

  it("renders the widget with the runtime site key once the script is ready", async () => {
    renderWidget();
    await act(async () => {});

    expect(turnstile.render).toHaveBeenCalledOnce();
    expect(options?.sitekey).toBe("1x00000000000000000000AA");
  });

  it("hands the token to the form: a hidden input named turnstile, and onToken", async () => {
    const { onToken, container } = renderWidget();
    await act(async () => {});

    act(() => options?.callback("XXXX.DUMMY.TOKEN.XXXX"));

    expect(
      container.querySelector('input[type="hidden"][name="turnstile"]'),
    ).toHaveValue("XXXX.DUMMY.TOKEN.XXXX");
    expect(onToken).toHaveBeenLastCalledWith("XXXX.DUMMY.TOKEN.XXXX");
  });

  it("reports a widget error and clears the token", async () => {
    const { onError, onToken } = renderWidget();
    await act(async () => {});

    act(() => options?.["error-callback"]());

    expect(onError).toHaveBeenCalledOnce();
    expect(onToken).toHaveBeenLastCalledWith(null);
  });

  it("clears the token when it expires", async () => {
    const { onToken } = renderWidget();
    await act(async () => {});
    act(() => options?.callback("tok"));

    act(() => options?.["expired-callback"]());

    expect(onToken).toHaveBeenLastCalledWith(null);
  });

  it("reports a script that never loads as an error (the form still works)", async () => {
    scripts.mode = "error";
    delete (window as unknown as { turnstile?: unknown }).turnstile;
    const { onError } = renderWidget();
    await act(async () => {});

    expect(onError).toHaveBeenCalledOnce();
    expect(turnstile.render).not.toHaveBeenCalled();
  });

  it("resets after each submit (a new resetKey): new challenge, empty token", async () => {
    const props = { onToken: vi.fn(), onError: vi.fn() };
    const { rerender, container } = render(
      <Turnstile siteKey="k" nonce={undefined} resetKey={0} {...props} />,
    );
    await act(async () => {});
    act(() => options?.callback("tok"));

    rerender(
      <Turnstile siteKey="k" nonce={undefined} resetKey={1} {...props} />,
    );

    expect(turnstile.reset).toHaveBeenCalledWith("widget-1");
    expect(container.querySelector('input[name="turnstile"]')).toHaveValue("");
    expect(props.onToken).toHaveBeenLastCalledWith(null);
  });

  // The 64 px reserved before the script loads: primitives.spec (Playwright).
  it("removes the widget on unmount", async () => {
    const { unmount } = renderWidget();
    await act(async () => {});

    unmount();
    expect(turnstile.remove).toHaveBeenCalledWith("widget-1");
  });
});
