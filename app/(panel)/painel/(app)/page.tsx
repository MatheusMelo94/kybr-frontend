import { redirect } from "next/navigation";

import { PANEL_HOME } from "@/lib/panel-paths";

// "/" has no screen of its own: the home is PANEL_HOME (spec S9 MVP note).
export default function PanelHome(): never {
  redirect(PANEL_HOME);
}
