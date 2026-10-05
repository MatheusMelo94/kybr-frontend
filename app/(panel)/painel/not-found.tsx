import type { Metadata } from "next";
import type { JSX } from "react";

import { AuthColumn } from "@/features/panel-auth/components/auth-column";
import { PanelNotFound } from "@/features/panel-shell/components/panel-not-found";
import { globalCopy } from "@/features/panel-shell/copy/global";

// A notFound() render doesn't carry the layout's stylesheet: import it here.
import "./panel.css";

export const metadata: Metadata = { title: globalCopy["notfound.h1"] };

// S16 (AC 13): every unknown panel path, logged in or not, in the plain
// column (no shell: it works without a session).
export default function PanelNotFoundPage(): JSX.Element {
  return (
    <AuthColumn>
      <PanelNotFound />
    </AuthColumn>
  );
}
