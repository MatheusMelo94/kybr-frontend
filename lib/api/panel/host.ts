import "server-only";

import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { env } from "@/lib/env";
import { reportMarker } from "@/lib/monitoring";

/**
 * Defense in depth for the panel's host routing (ADR-0008 rule 8, P03.2):
 * middleware isn't a boundary, and every Server Action id works on every
 * host. The panel's layout, its DAL and every panel action call this first,
 * before any API call: off the panel host (or with the panel off), the
 * request is a 404 and a shape-only marker.
 */
export async function assertPanelHost(): Promise<void> {
  const host = (await headers()).get("host")?.toLowerCase();
  if (env.PANEL_HOST !== undefined && host === env.PANEL_HOST) return;
  reportMarker("PANEL_HOST_MISMATCH", {});
  notFound();
}
