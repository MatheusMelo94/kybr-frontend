import "server-only";

import { headers } from "next/headers";
import { z } from "zod";

import { env } from "@/lib/env";

const ipSchema = z.union([z.ipv4(), z.ipv6()]);

/**
 * The client IP from the trusted header's value (CLIENT_IP_HEADER, set per
 * hosting target). For a list, as in X-Forwarded-For, it takes the right-most
 * entry: the one the trusted proxy appended. Entries to its left come from
 * the client and can be spoofed (tech-design R2).
 */
export function parseClientIp(value: string | null): string | undefined {
  const candidate = value?.split(",").at(-1)?.trim();
  return candidate && ipSchema.safeParse(candidate).success
    ? candidate
    : undefined;
}

/** The current request's client IP, for X-Kybr-Client-IP (contract X2). */
export async function getClientIp(): Promise<string | undefined> {
  const requestHeaders = await headers();
  return parseClientIp(requestHeaders.get(env.CLIENT_IP_HEADER));
}
