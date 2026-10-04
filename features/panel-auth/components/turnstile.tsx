"use client";

import Script from "next/script";
import { useEffect, useRef, useState, type JSX } from "react";

// Cloudflare Turnstile (ADR-0009 rule 13, U-P2 BUY). The widget proves a
// person is there; the token goes in the action body and on to the API,
// which verifies it (siteverify). The script is the panel's only
// third-party code: auth pages only (the CSP allows its origin there and
// nowhere else, P03.4), loaded after the form is interactive.

const SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "error-callback": () => void;
      "expired-callback": () => void;
      theme: "auto";
      language: string;
      size: "flexible";
    },
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

type Props = {
  /** Public runtime config (TURNSTILE_SITE_KEY), never NEXT_PUBLIC_*. */
  siteKey: string;
  /** This request's CSP nonce (x-nonce), read by the page on the server. */
  nonce: string | undefined;
  onToken: (token: string | null) => void;
  /** The widget failed, or its script never loaded: the form shows auth.error.turnstile. */
  onError: () => void;
  /** Change it after each submit: a token is single-use, so the widget resets. */
  resetKey?: number;
};

export function Turnstile({
  siteKey,
  nonce,
  onToken,
  onError,
  resetKey = 0,
}: Props): JSX.Element {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState("");
  // The latest callbacks, so the widget (rendered once) never calls stale ones.
  const handlers = useRef({ onToken, onError });
  handlers.current = { onToken, onError };

  useEffect(() => {
    const api = window.turnstile;
    if (!ready || !api || !container.current || widget.current) return;
    widget.current = api.render(container.current, {
      sitekey: siteKey,
      callback: (value) => {
        setToken(value);
        handlers.current.onToken(value);
      },
      "error-callback": () => {
        setToken("");
        handlers.current.onToken(null);
        handlers.current.onError();
      },
      "expired-callback": () => {
        setToken("");
        handlers.current.onToken(null);
      },
      theme: "auto",
      language: "pt-br",
      size: "flexible",
    });
    return () => {
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [ready, siteKey]);

  const firstReset = useRef(resetKey);
  useEffect(() => {
    if (resetKey === firstReset.current) return;
    firstReset.current = resetKey;
    if (widget.current) window.turnstile?.reset(widget.current);
    setToken("");
    handlers.current.onToken(null);
  }, [resetKey]);

  return (
    <>
      <Script
        src={SCRIPT_URL}
        strategy="afterInteractive"
        nonce={nonce}
        onReady={() => setReady(true)}
        onError={() => handlers.current.onError()}
      />
      {/* The widget's own frame carries its accessible name and keyboard path. */}
      <div ref={container} data-testid="turnstile" className="min-h-16" />
      <input type="hidden" name="turnstile" value={token} />
    </>
  );
}
