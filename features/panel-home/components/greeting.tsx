import type { JSX } from "react";

import { homeCopy } from "@/features/panel-home/copy";
import { firstName, greetingKey } from "@/features/panel-home/greeting";
import { fill } from "@/features/panel-shell/format";

type Props = {
  /** The /me name; only the first word shows. */
  nome: string;
  now: Date;
};

/** home.greet.* as Início's h1 (S9). */
export function Greeting({ nome, now }: Props): JSX.Element {
  return (
    <h1 className="text-title font-title text-ink">
      {fill(homeCopy[greetingKey(now)], { nome: firstName(nome) })}
    </h1>
  );
}
