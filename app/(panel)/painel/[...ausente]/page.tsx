import { notFound } from "next/navigation";

// Every panel path no route matches, /painel/* included (the panel host
// rewrites /painel/x to /painel/painel/x): the panel's not-found (ADR-0008).
export default function UnknownPanelPath(): never {
  notFound();
}
