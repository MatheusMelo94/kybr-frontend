import type { JSX, ReactNode } from "react";

type Props = { header: ReactNode; main: ReactNode; aside: ReactNode };

/** One column below lg; at lg the alerts and the side card at ≈ 1.5 : 1 (plan-m7 § 5). */
export function MonLayout({ header, main, aside }: Props): JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      {header}
      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr] lg:items-start">
        <div className="min-w-0">{main}</div>
        <aside className="min-w-0">{aside}</aside>
      </div>
    </div>
  );
}
