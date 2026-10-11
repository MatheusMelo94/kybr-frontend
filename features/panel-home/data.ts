import "server-only";

import { redirect } from "next/navigation";

import { AppError } from "@/lib/api/errors";
import { getDashboard } from "@/lib/api/panel/home";
import { sessionExpiredUrl } from "@/lib/api/panel/session";
import type { Dashboard } from "@/lib/api/schemas/panel/home";

/**
 * Início's one read (plan-m8 D2): D-H1. An ended session → /entrar (a
 * navigation: ADR-0011 Addendum 2 rule 5); any other failure of the whole
 * call throws to error.tsx (PH4). Missing cards are the page's to show.
 */
export async function loadHome(): Promise<Dashboard> {
  try {
    return await getDashboard();
  } catch (error) {
    if (error instanceof AppError && error.code === "SESSAO_EXPIRADA")
      redirect(await sessionExpiredUrl());
    throw error;
  }
}
