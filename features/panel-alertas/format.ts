// The Monitoramento's dates (spec § Content & Copy › Rules › Numbers and
// dates), in Brasília time, like the Fila's. {data} is panel-shell's
// formatDate.

/** G3: `{dia_semana}, {hora}` of mon.status.on: "segunda-feira", "06:00". */
export function formatProximaVarredura(iso: string): {
  dia_semana: string;
  hora: string;
} {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
  return {
    dia_semana: parts.weekday ?? "",
    hora: `${parts.hour}:${parts.minute}`,
  };
}
