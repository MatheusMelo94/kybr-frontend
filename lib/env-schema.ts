import { z } from "zod";

import { isLoopbackHostname } from "./safe-url";

// Pure schema, with no `server-only` and no process.env read: lib/env.ts uses it
// at runtime, and next.config.ts uses it to fail the build on a bad environment.

const httpUrl = z.url({ protocol: /^https?$/ });

/** An http(s) origin spelled as just that: no userinfo, path (not even "/"), query or fragment. */
function isBareOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      value.toLowerCase() === url.origin
    );
  } catch {
    return false;
  }
}

/**
 * Client-IP headers whose value is a list that each proxy appends to (contract
 * X2, threat model F02). Every other header is a single value the hosting
 * platform overwrites (x-real-ip, cf-connecting-ip, fly-client-ip, …).
 */
export const LIST_VALUED_IP_HEADERS: ReadonlySet<string> = new Set([
  "x-forwarded-for",
]);

/**
 * The client IP header on Vercel (ADR-0005). Vercel's edge sets it to the
 * client's IP, and a proxy in front of Vercel can't rewrite it, unlike
 * x-forwarded-for and x-real-ip (F02).
 */
const VERCEL_CLIENT_IP_HEADER = "x-vercel-forwarded-for";

/** host[:port], lowercased (ADR-0008 rule 1): what a request's Host header holds. */
export const HOST_PATTERN = /^[a-z0-9.-]+(:\d+)?$/;

/** DOCUMENTS_DOMAIN_CHECKED_AT's format, the same as scripts/check-deploy-env.mjs. */
const CHECKED_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

const host = z
  .string()
  .transform((value) => value.toLowerCase())
  .pipe(z.string().regex(HOST_PATTERN, "Must be host[:port]"));

// The panel's settings that production can't go without once PANEL_HOST turns
// it on (P-U3 legal links, U-P2 Turnstile).
const PANEL_REQUIRED = [
  "LEGAL_TERMS_URL",
  "LEGAL_PRIVACY_URL",
  "LEGAL_TERMS_VERSION",
  "TURNSTILE_SITE_KEY",
] as const;

const serverEnvSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    // Kybr API base URL for calls from the Next server.
    API_BASE_URL: httpUrl,
    // Kybr API base URL the browser uploads documents to (ADR-0004b). Not secret.
    API_PUBLIC_BASE_URL: httpUrl,
    // Local and E2E production builds only: lets API_BASE_URL be http: on a
    // loopback host (the mock API). Never set in a deployed environment (F08).
    API_ALLOW_LOOPBACK_HTTP: z.enum(["true", "false"]).optional(),
    // Server-to-server secret sent as X-Kybr-BFF-Key (contract X2).
    API_BFF_KEY: z.string().min(32).optional(),
    // Header the hosting platform fills with the real client IP (contract X2).
    // Required, with no default: it depends on the host (F02).
    CLIENT_IP_HEADER: z
      .string()
      .regex(/^[A-Za-z0-9-]+$/)
      .transform((name) => name.toLowerCase()),
    // For a list-valued header: how many trusted proxies append to it, so the
    // client's IP is that many entries from the right.
    CLIENT_IP_TRUSTED_HOPS: z
      .string()
      .regex(/^\d+$/, "Must be a whole number from 1 to 10")
      .transform(Number)
      .pipe(z.number().int().min(1).max(10))
      .optional(),
    // Server-side error monitoring (T34a, threat model F10). Optional in every
    // build, production included (QA G12): unset, nothing is sent anywhere.
    SENTRY_DSN: z.url({ protocol: /^https$/ }).optional(),
    // The seller link's host (ADR-0008): every other host gets no /v/*.
    // Required in production (kybr.com.br), except on a Vercel Preview, whose
    // own URLs are link hosts.
    LINK_HOST: host.optional(),
    // The panel's host, and its release switch (ADR-0008 rule 7): unset, the
    // panel answers nowhere.
    PANEL_HOST: host.optional(),
    // Cloudflare Turnstile's site key (ADR-0009 rule 13). Public: the panel
    // passes it to the widget as a prop at runtime.
    TURNSTILE_SITE_KEY: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,128}$/)
      .optional(),
    // Where "Contratar" writes to (P-U4). Unset, the button isn't rendered.
    COMMERCIAL_CONTACT_EMAIL: z.email().optional(),
    // The sign-up's terms and privacy links (P-U3), and the version its
    // acceptance records (D-A1). Required with PANEL_HOST.
    LEGAL_TERMS_URL: httpUrl.optional(),
    LEGAL_PRIVACY_URL: httpUrl.optional(),
    LEGAL_TERMS_VERSION: z
      .string()
      .regex(/^[\x21-\x7e]{1,32}$/, "Must be 1 to 32 printable characters")
      .optional(),
    // The documents domain's origin (D-C6, F2): the only origin a signed
    // document URL may sit on. A bare origin; never the panel's, the link's
    // or under kybr.com.br. Unset, every document answers 404.
    PANEL_DOCUMENTS_ORIGIN: z
      .string()
      .transform((value, ctx) => {
        if (isBareOrigin(value)) return new URL(value).origin;
        ctx.addIssue({
          code: "custom",
          message: "Must be an origin with no path, query or fragment",
        });
        return z.NEVER;
      })
      .optional(),
    // How documents open (Q1): a 303 to the signed URL, or the panel streams
    // them as attachments (F4). Unset: attachment in production, until the
    // F3 check passes (T116).
    PANEL_DOCUMENTS_MODE: z.enum(["redirect", "attachment"]).optional(),
    // When the F3 check passed, as scripts/check-documents-domain.sh prints it.
    // Deployed production needs it before PANEL_DOCUMENTS_MODE=redirect.
    DOCUMENTS_DOMAIN_CHECKED_AT: z
      .string()
      .regex(CHECKED_AT, "Must be the UTC timestamp the F3 check prints")
      .refine((value) => !Number.isNaN(Date.parse(value)), {
        message: "Must be the UTC timestamp the F3 check prints",
      })
      .optional(),
    // Set to "1" by Vercel itself at build and run time.
    VERCEL: z.string().optional(),
    // Set by Vercel: the environment, and this deployment's own URLs (no scheme).
    VERCEL_ENV: z.string().optional(),
    VERCEL_URL: host.optional(),
    VERCEL_BRANCH_URL: host.optional(),
  })
  .superRefine((env, ctx) => {
    if (
      env.VERCEL === "1" &&
      env.CLIENT_IP_HEADER !== VERCEL_CLIENT_IP_HEADER
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["CLIENT_IP_HEADER"],
        message: `Must be ${VERCEL_CLIENT_IP_HEADER} on Vercel`,
      });
    }
    if (env.PANEL_HOST !== undefined && env.PANEL_HOST === env.LINK_HOST) {
      ctx.addIssue({
        code: "custom",
        path: ["PANEL_HOST"],
        message: "Must differ from LINK_HOST",
      });
    }
    if (env.PANEL_DOCUMENTS_ORIGIN !== undefined) {
      const documents = new URL(env.PANEL_DOCUMENTS_ORIGIN);
      const loopbackAllowed =
        (env.NODE_ENV !== "production" ||
          env.API_ALLOW_LOOPBACK_HTTP === "true") &&
        isLoopbackHostname(documents.hostname);
      // host:port, so the mock's localhost:4010 isn't the panel's localhost:3000 (Q1b).
      const sameSite =
        documents.host === env.PANEL_HOST ||
        documents.host === env.LINK_HOST ||
        documents.hostname === "kybr.com.br" ||
        documents.hostname.endsWith(".kybr.com.br");
      if (documents.protocol !== "https:" && !loopbackAllowed)
        ctx.addIssue({
          code: "custom",
          path: ["PANEL_DOCUMENTS_ORIGIN"],
          message: "Must be https: (loopback http: only for local builds)",
        });
      if (sameSite)
        ctx.addIssue({
          code: "custom",
          path: ["PANEL_DOCUMENTS_ORIGIN"],
          message:
            "Must be a separate site from the panel, the link and kybr.com.br",
        });
    }
    if (env.PANEL_HOST !== undefined) {
      for (const name of PANEL_REQUIRED) {
        if (env[name] === undefined)
          ctx.addIssue({
            code: "custom",
            path: [name],
            message: "Required when PANEL_HOST is set",
          });
      }
    }
  })
  .transform(({ CLIENT_IP_TRUSTED_HOPS, ...env }) =>
    // Hops mean nothing for a single-value header, so they're dropped.
    LIST_VALUED_IP_HEADERS.has(env.CLIENT_IP_HEADER)
      ? { ...env, CLIENT_IP_TRUSTED_HOPS }
      : { ...env, CLIENT_IP_TRUSTED_HOPS: undefined },
  )
  .superRefine((env, ctx) => {
    if (
      LIST_VALUED_IP_HEADERS.has(env.CLIENT_IP_HEADER) &&
      env.CLIENT_IP_TRUSTED_HOPS === undefined
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["CLIENT_IP_TRUSTED_HOPS"],
        message: "Required when CLIENT_IP_HEADER is a list-valued header",
      });
    }
    if (env.NODE_ENV !== "production") return;
    if (env.LINK_HOST === undefined && env.VERCEL_ENV !== "preview") {
      ctx.addIssue({
        code: "custom",
        path: ["LINK_HOST"],
        message: "Required in production",
      });
    }
    // Shown on the panel as links: https:, or loopback for local production builds.
    for (const name of ["LEGAL_TERMS_URL", "LEGAL_PRIVACY_URL"] as const) {
      const value = env[name];
      if (value === undefined) continue;
      const url = new URL(value);
      if (url.protocol !== "https:" && !isLoopbackHostname(url.hostname))
        ctx.addIssue({
          code: "custom",
          path: [name],
          message: "Must be an https: URL in production",
        });
    }
    // The F3 gate, mirroring scripts/check-deploy-env.mjs (M6C-07) for a
    // deployed production server: a local production build runs with
    // API_ALLOW_LOOPBACK_HTTP, and a Vercel Preview is staging.
    const deployedProduction =
      env.API_ALLOW_LOOPBACK_HTTP !== "true" && env.VERCEL_ENV !== "preview";
    if (deployedProduction) {
      if (
        env.PANEL_HOST !== undefined &&
        env.PANEL_DOCUMENTS_ORIGIN === undefined
      )
        ctx.addIssue({
          code: "custom",
          path: ["PANEL_DOCUMENTS_ORIGIN"],
          message: "Required when PANEL_HOST is set in production",
        });
      if (
        env.PANEL_DOCUMENTS_MODE === "redirect" &&
        env.DOCUMENTS_DOMAIN_CHECKED_AT === undefined
      )
        ctx.addIssue({
          code: "custom",
          path: ["DOCUMENTS_DOMAIN_CHECKED_AT"],
          message:
            "Required for PANEL_DOCUMENTS_MODE=redirect in production (the F3 check: scripts/check-documents-domain.sh)",
        });
    }
    if (env.API_BFF_KEY === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["API_BFF_KEY"],
        message: "Required in production",
      });
    }
    // The BFF key and the seller's data travel on API_BASE_URL (F08).
    const apiUrl = new URL(env.API_BASE_URL);
    const loopbackAllowed =
      env.API_ALLOW_LOOPBACK_HTTP === "true" &&
      isLoopbackHostname(apiUrl.hostname);
    if (apiUrl.protocol !== "https:" && !loopbackAllowed) {
      ctx.addIssue({
        code: "custom",
        path: ["API_BASE_URL"],
        message: "Must be an https: URL in production",
      });
    }
    const publicUrl = new URL(env.API_PUBLIC_BASE_URL);
    // Loopback stays allowed so a production build can run against the local mock API (E2E).
    if (
      publicUrl.protocol !== "https:" &&
      !isLoopbackHostname(publicUrl.hostname)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["API_PUBLIC_BASE_URL"],
        message: "Must be an https: URL in production",
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Parses and validates the server environment. Throws, naming each bad variable but never its value. */
export function parseServerEnv(
  source: Record<string, string | undefined>,
): ServerEnv {
  // `.env` files often leave a variable empty; that means "not set".
  const present = Object.fromEntries(
    Object.entries(source).filter(
      ([, value]) => value !== undefined && value !== "",
    ),
  );
  const result = serverEnvSchema.safeParse(present);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`,
    );
    throw new Error(
      `Invalid environment variables:\n  ${problems.join("\n  ")}`,
    );
  }
  return result.data;
}
