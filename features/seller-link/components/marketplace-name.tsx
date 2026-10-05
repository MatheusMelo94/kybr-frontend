import type { JSX } from "react";

type Props = {
  nome: string;
};

/** The marketplace's workspace name, as text (no marketplace logo in v1). */
export function MarketplaceName({ nome }: Props): JSX.Element {
  return <p className="text-body font-strong break-words text-ink">{nome}</p>;
}
