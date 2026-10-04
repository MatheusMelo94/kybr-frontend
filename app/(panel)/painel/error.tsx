"use client";

import type { JSX } from "react";

import { AuthColumn } from "@/features/panel-auth/components/auth-column";
import { PanelFatalError } from "@/features/panel-shell/components/panel-fatal-error";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

// S16 unexpected error, for anything below the panel's root layout.
export default function PanelError({ reset }: Props): JSX.Element {
  return (
    <AuthColumn>
      <PanelFatalError reset={reset} />
    </AuthColumn>
  );
}
