import { formatHora } from "@/features/panel-shell/format";

// Início's greeting (spec S9, AC 53): the time of day in America/Sao_Paulo,
// whatever the server's or the browser's zone.

export type GreetingKey =
  "home.greet.morning" | "home.greet.afternoon" | "home.greet.evening";

/** 06:00–11:59 morning, 12:00–17:59 afternoon, otherwise evening. */
export function greetingKey(now: Date): GreetingKey {
  const hour = Number(formatHora(now.getTime()).slice(0, 2));
  if (hour >= 6 && hour < 12) return "home.greet.morning";
  if (hour >= 12 && hour < 18) return "home.greet.afternoon";
  return "home.greet.evening";
}

/** The first word of the /me name. */
export function firstName(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? "";
}
