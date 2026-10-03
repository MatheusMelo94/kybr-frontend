import { z } from "zod";

// Pure schema, with no `server-only` and no process.env read: lib/env.ts uses it
// at runtime, and next.config.ts uses it to fail the build on a bad environment.

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const httpUrl = z.url({ protocol: /^https?$/ });

const serverEnvSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    // Kybr API base URL for calls from the Next server.
    API_BASE_URL: httpUrl,
    // Kybr API base URL the browser uploads documents to (ADR-0004b). Not secret.
    API_PUBLIC_BASE_URL: httpUrl,
    // Server-to-server secret sent as X-Kybr-BFF-Key (contract X2).
    API_BFF_KEY: z.string().min(32).optional(),
    // Header the hosting platform fills with the real client IP (contract X2).
    CLIENT_IP_HEADER: z
      .string()
      .regex(/^[A-Za-z0-9-]+$/)
      .transform((name) => name.toLowerCase())
      .default("x-forwarded-for"),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
    if (env.API_BFF_KEY === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["API_BFF_KEY"],
        message: "Required in production",
      });
    }
    const publicUrl = new URL(env.API_PUBLIC_BASE_URL);
    // Loopback stays allowed so a production build can run against the local mock API (E2E).
    if (
      publicUrl.protocol !== "https:" &&
      !LOOPBACK_HOSTS.has(publicUrl.hostname)
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
