import type { JSX } from "react";

import { SuccessPill } from "@/features/seller-link/components/case/seal";

type Props = {
  label: string;
  value: string;
};

/** One *tudo certo* confirmation: what was checked, and a pill with the outcome. */
export function ConfirmationRow({ label, value }: Props): JSX.Element {
  return (
    <li className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
      <span className="text-body text-ink">{label}</span>
      <SuccessPill>{value}</SuccessPill>
    </li>
  );
}
