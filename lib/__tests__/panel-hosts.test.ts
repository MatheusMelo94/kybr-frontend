import { describe, expect, it } from "vitest";

import {
  PUBLIC_PANEL_PATHS,
  classifyHost,
  hostConfigFromEnv,
  isProtectedPanelPath,
  usesTurnstile,
  type HostConfig,
} from "@/lib/panel-hosts";

const E2E: HostConfig = {
  panelHost: "127.0.0.1:3000",
  linkHosts: ["localhost:3000"],
};

describe("classifyHost (ADR-0008 rule 1)", () => {
  it.each([
    ["127.0.0.1:3000", "panel"],
    ["localhost:3000", "link"],
    ["LOCALHOST:3000", "link"],
    ["localhost:3001", "unknown"],
    ["localhost", "unknown"],
    ["127.0.0.1", "unknown"],
    ["kybr-abc.vercel.app", "unknown"],
    ["", "unknown"],
    [null, "unknown"],
  ] as const)("%s → %s (case-insensitive, port-exact)", (host, kind) => {
    expect(classifyHost(host, E2E)).toBe(kind);
  });

  it("never answers panel when PANEL_HOST is unset", () => {
    const off: HostConfig = { linkHosts: ["kybr.com.br"] };

    expect(classifyHost("app.kybr.com.br", off)).toBe("unknown");
    expect(classifyHost("kybr.com.br", off)).toBe("link");
    expect(classifyHost(undefined, off)).toBe("unknown");
  });
});

describe("hostConfigFromEnv", () => {
  it("uses LINK_HOST and PANEL_HOST", () => {
    expect(
      hostConfigFromEnv({
        LINK_HOST: "kybr.com.br",
        PANEL_HOST: "app.kybr.com.br",
      }),
    ).toEqual({ panelHost: "app.kybr.com.br", linkHosts: ["kybr.com.br"] });
  });

  it("adds Vercel's deployment and branch URLs as link hosts on Preview only", () => {
    const vercel = {
      LINK_HOST: "kybr.com.br",
      VERCEL_URL: "kybr-abc123.vercel.app",
      VERCEL_BRANCH_URL: "kybr-git-x.vercel.app",
    };

    expect(hostConfigFromEnv({ ...vercel, VERCEL_ENV: "preview" })).toEqual({
      linkHosts: [
        "kybr.com.br",
        "kybr-abc123.vercel.app",
        "kybr-git-x.vercel.app",
      ],
    });
    // Production's *.vercel.app aliases are unknown hosts (P03.1).
    expect(hostConfigFromEnv({ ...vercel, VERCEL_ENV: "production" })).toEqual({
      linkHosts: ["kybr.com.br"],
    });
  });

  it("has no link host at all when nothing is configured", () => {
    expect(hostConfigFromEnv({})).toEqual({ linkHosts: [] });
  });
});

describe("isProtectedPanelPath (ADR-0009 rule 6; AC 13)", () => {
  it.each([
    "/entrar",
    "/cadastro",
    "/cadastro/confirmar",
    "/senha/esqueci",
    "/senha/nova",
  ])("%s is public", (path) => {
    expect(isProtectedPanelPath(path)).toBe(false);
  });

  it.each([
    "/",
    "/fila",
    "/fila/abc",
    "/comecar",
    "/lote",
    "/monitoramento/x",
    "/configuracoes",
  ])("the panel screen %s is protected", (path) => {
    expect(isProtectedPanelPath(path)).toBe(true);
  });

  // AC 13: an unknown path renders the panel's not-found, logged in or not.
  it.each([
    "/qualquer",
    "/entrar/x",
    "/entrarx",
    "/filas",
    "/senha",
    "/ENTRAR",
    "/v/x",
  ])(
    "the unknown path %s isn't redirected (the panel's not-found answers it)",
    (path) => {
      expect(isProtectedPanelPath(path)).toBe(false);
    },
  );

  it("lists exactly the five public paths", () => {
    expect([...PUBLIC_PANEL_PATHS].sort()).toEqual(
      [
        "/cadastro",
        "/cadastro/confirmar",
        "/entrar",
        "/senha/esqueci",
        "/senha/nova",
      ].sort(),
    );
  });
});

describe("usesTurnstile (ADR-0009 rule 13, P03.4)", () => {
  it.each(["/entrar", "/cadastro", "/cadastro/confirmar", "/senha/esqueci"])(
    "%s renders Turnstile",
    (path) => {
      expect(usesTurnstile(path)).toBe(true);
    },
  );

  it.each(["/senha/nova", "/fila", "/", "/comecar", "/entrar/x"])(
    "%s doesn't",
    (path) => {
      expect(usesTurnstile(path)).toBe(false);
    },
  );
});
