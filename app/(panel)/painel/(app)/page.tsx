import { redirect } from "next/navigation";

// MVP home = the Fila (spec S9 MVP note); Início replaces it in M8.
export default function PanelHome(): never {
  redirect("/fila");
}
