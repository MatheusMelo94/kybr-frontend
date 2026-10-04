import type { JSX, ReactNode } from "react";

import { AuthColumn } from "@/features/panel-auth/components/auth-column";

type Props = {
  children: ReactNode;
};

// S1–S4: one centered column (plan § 2.2, the "(focus)" shell).
export default function FocusLayout({ children }: Props): JSX.Element {
  return <AuthColumn>{children}</AuthColumn>;
}
