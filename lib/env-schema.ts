import { z } from "zod";

import { isLoopbackHostname } from "./safe-url";

// Pure schema, with no `server-only` and no process.env read: lib/env.ts uses it
// at runtime, and next.config.ts uses it to fail the build on a bad environment.

const httpUrl = z.url({ protocol: /^https?$/ });

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
    // Set to "1" by Vercel itself at build and run time.
    VERCEL: z.string().optional(),
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
