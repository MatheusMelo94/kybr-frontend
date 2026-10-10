import { shellCopy } from "@/features/panel-shell/copy/shell";

// The panel's navigation (spec § Screens & Surfaces). One registry, in the
// spec's order (O-15: Fila and Monitoramento in the first three, so both
// show in the first tabs at 360). An item appears only once its screen
// ships in this build: no "em breve" placeholders.

export type NavItem = { key: string; href: string; label: string };

type Entry = NavItem & { shipped: boolean };

export const NAV_ITEMS: readonly Entry[] = [
  { key: "inicio", href: "/", label: shellCopy["nav.inicio"], shipped: true },
  { key: "fila", href: "/fila", label: shellCopy["nav.fila"], shipped: true },
  {
    key: "monitor",
    href: "/monitoramento",
    label: shellCopy["nav.monitor"],
    shipped: true,
  },
  { key: "lote", href: "/lote", label: shellCopy["nav.lote"], shipped: true },
  {
    key: "vendedores",
    href: "/vendedores",
    label: shellCopy["nav.vendedores"],
    shipped: true,
  },
  {
    key: "regras",
    href: "/regras",
    label: shellCopy["nav.regras"],
    shipped: false,
  },
  {
    key: "relatorio",
    href: "/relatorio",
    label: shellCopy["nav.relatorio"],
    shipped: false,
  },
  {
    key: "integracoes",
    href: "/integracoes",
    label: shellCopy["nav.integracoes"],
    shipped: false,
  },
  {
    key: "link",
    href: "/ver-como-vendedor",
    label: shellCopy["nav.link"],
    shipped: false,
  },
];

/** The items whose screens this build has (M4: the Fila; M5: Lote; M7: Monitoramento; M8: Início). */
export function navItemsInBuild(): NavItem[] {
  return NAV_ITEMS.filter((item) => item.shipped).map(
    ({ key, href, label }) => ({ key, href, label }),
  );
}
