import "server-only";

import { headers } from "next/headers";
import { z } from "zod";

import { env } from "@/lib/env";
import { LIST_VALUED_IP_HEADERS } from "@/lib/env-schema";

const ipSchema = z.union([z.ipv4(), z.ipv6()]);

export type ClientIpResult =
  | { ok: true; ip: string }
  | {
      ok: false;
      reason: "missing" | "too_few_entries" | "not_an_ip" | "not_single_value";
    };

/** How the configured header carries the IP (threat model F02). */
type HeaderShape =
  { listValued: true; trustedHops: number } | { listValued: false };

/** "203.0.113.7:51234" → "203.0.113.7"; "[2001:db8::1]:443" → "2001:db8::1". A bare IPv6 stays. */
function stripPort(entry: string): string {
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(entry);
  if (bracketed?.[1] !== undefined) return bracketed[1];
  const ipv4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(entry);
  return ipv4WithPort?.[1] ?? entry;
}

/**
 * The client IP from the trusted header's value.
 * - List-valued (X-Forwarded-For): the client writes the left entries and each
 *   trusted proxy appends one on the right, so the client's IP is the entry
 *   `trustedHops` from the right. Anything further left can be spoofed.
 * - Single-value platform header: exactly one value, or nothing.
 */
export function parseClientIp(
  value: string | null,
  shape: HeaderShape,
): ClientIpResult {
  const entries = (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length === 0) return { ok: false, reason: "missing" };
  if (!shape.listValued && entries.length > 1)
    return { ok: false, reason: "not_single_value" };

  const hops = shape.listValued ? shape.trustedHops : 1;
  const entry = entries.at(-hops);
  if (entry === undefined || entries.length < hops)
    return { ok: false, reason: "too_few_entries" };

  const ip = stripPort(entry);
  return ipSchema.safeParse(ip).success
    ? { ok: true, ip }
    : { ok: false, reason: "not_an_ip" };
}

let underivedCount = 0;

/**
 * The current request's client IP, for X-Kybr-Client-IP (contract X2). When it
 * can't be derived, the header is omitted and a shape-only counter is logged,
 * so an alert can catch a misconfigured host.
 */
export async function getClientIp(): Promise<string | undefined> {
  const requestHeaders = await headers();
  const shape: HeaderShape =
    LIST_VALUED_IP_HEADERS.has(env.CLIENT_IP_HEADER) &&
    env.CLIENT_IP_TRUSTED_HOPS !== undefined
      ? { listValued: true, trustedHops: env.CLIENT_IP_TRUSTED_HOPS }
      : { listValued: false };
  const result = parseClientIp(requestHeaders.get(env.CLIENT_IP_HEADER), shape);
  if (result.ok) return result.ip;

  underivedCount += 1;
  console.warn("[kybr-api] client ip not derived", {
    header: env.CLIENT_IP_HEADER,
    reason: result.reason,
    count: underivedCount,
  });
  return undefined;
}
