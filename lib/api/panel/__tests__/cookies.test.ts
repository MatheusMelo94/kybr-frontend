// @vitest-environment node
import { ResponseCookies } from "next/dist/compiled/@edge-runtime/cookies";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => ({
  headers: new Headers(),
  requestCookies: new Map<string, string>(),
}));
const requestHeaders = vi.hoisted(() => ({ value: new Headers() }));
vi.mock("next/headers", async () => {
  const { ResponseCookies: Cookies } =
    await import("next/dist/compiled/@edge-runtime/cookies");
  return {
    headers: async () => requestHeaders.value,
    cookies: async () => {
      const response = new Cookies(jar.headers);
      return {
        get: (name: string) =>
          jar.requestCookies.has(name)
            ? { name, value: jar.requestCookies.get(name) }
            : undefined,
        set: response.set.bind(response),
        delete: response.delete.bind(response),
      };
    },
  };
});

import {
  deleteSessionCookie,
  deleteSignupCookie,
  readSessionToken,
  readSignupCookie,
  setSessionCookie,
  setSignupCookie,
} from "@/lib/api/panel/cookies";

const NOW = Date.parse("2026-10-04T12:00:00Z");
const SEVEN_DAYS = 7 * 24 * 60 * 60;

function setCookieHeader(): string {
  return jar.headers.get("set-cookie") ?? "";
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  jar.headers = new Headers();
  jar.requestCookies = new Map();
  requestHeaders.value = new Headers({ host: "app.kybr.test" });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("the session cookie (ADR-0009 rule 3, P02)", () => {
  it("production shape: __Host-, HttpOnly, Secure, SameSite=Lax, Path=/, Max-Age from expira_em, no Domain", async () => {
    await setSessionCookie({
      id: "sessao-sintetica-0123456789",
      expira_em: new Date(NOW + 3600_000).toISOString(),
    });

    const header = setCookieHeader();
    expect(header).toMatch(/^__Host-kybr_session=sessao-sintetica-0123456789;/);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toMatch(/SameSite=lax/i);
    expect(header).toContain("Path=/");
    expect(header).toContain("Max-Age=3600");
    expect(header).not.toMatch(/Domain=/i);
  });

  it("caps Max-Age at 7 days", async () => {
    await setSessionCookie({
      id: "sessao-sintetica-0123456789",
      expira_em: new Date(NOW + 30 * 86_400_000).toISOString(),
    });

    expect(setCookieHeader()).toContain(`Max-Age=${SEVEN_DAYS}`);
  });

  it("uses kybr_session without Secure on loopback http, behind the local-only flag", async () => {
    vi.stubEnv("API_ALLOW_LOOPBACK_HTTP", "true");
    vi.resetModules();
    requestHeaders.value = new Headers({ host: "127.0.0.1:3000" });
    const cookies = await import("@/lib/api/panel/cookies");

    await cookies.setSessionCookie({
      id: "sessao-sintetica-0123456789",
      expira_em: new Date(NOW + 60_000).toISOString(),
    });

    const header = setCookieHeader();
    expect(header).toMatch(/^kybr_session=/);
    expect(header).not.toContain("Secure");
    expect(header).toContain("HttpOnly");
  });

  it("never drops Secure on loopback without the flag", async () => {
    requestHeaders.value = new Headers({ host: "127.0.0.1:3000" });
    await setSessionCookie({
      id: "sessao-sintetica-0123456789",
      expira_em: new Date(NOW + 60_000).toISOString(),
    });

    expect(setCookieHeader()).toMatch(/^__Host-kybr_session=.*Secure/);
  });

  it("reads only the cookie name of this mode: a non-__Host- copy is ignored in production", async () => {
    jar.requestCookies.set("kybr_session", "jogada-de-subdominio-012345");
    expect(await readSessionToken()).toBeUndefined();

    jar.requestCookies.set(
      "__Host-kybr_session",
      "sessao-sintetica-0123456789",
    );
    expect(await readSessionToken()).toBe("sessao-sintetica-0123456789");
  });

  it("ignores a cookie value that isn't a token", async () => {
    jar.requestCookies.set("__Host-kybr_session", "a b\u0001");
    expect(await readSessionToken()).toBeUndefined();
  });

  it("deletes it", async () => {
    await deleteSessionCookie();

    expect(setCookieHeader()).toMatch(
      /^__Host-kybr_session=;.*(Max-Age=0|Expires=Thu, 01 Jan 1970)/,
    );
  });
});

describe("the sign-up cookie (ADR-0009 rule 10, P19)", () => {
  const pending = {
    ticket: "ticket-sintetico-0123456789",
    nome: "Pessoa Exemplo",
    workspace: "Plataforma Exemplo",
    email: "pessoa@exemplo.test",
  };

  it("holds the ticket and the prefill for 30 minutes, with the session's flags, and never a password", async () => {
    await setSignupCookie({ ...pending, ...({ senha: "x" } as object) });

    const header = setCookieHeader();
    expect(header).toMatch(/^__Host-kybr_signup=/);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("Max-Age=1800");
    const value =
      new ResponseCookies(jar.headers).get("__Host-kybr_signup")?.value ?? "";
    jar.requestCookies.set("__Host-kybr_signup", value);
    expect(await readSignupCookie()).toEqual(pending);
    expect(Buffer.from(value, "base64url").toString()).not.toContain("senha");
  });

  it("reads null for a missing or tampered cookie", async () => {
    expect(await readSignupCookie()).toBeNull();
    jar.requestCookies.set("__Host-kybr_signup", "nao-e-json");
    expect(await readSignupCookie()).toBeNull();
  });

  it("deletes it", async () => {
    await deleteSignupCookie();
    expect(setCookieHeader()).toMatch(/^__Host-kybr_signup=;/);
  });
});
