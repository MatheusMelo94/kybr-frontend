import type { JSX } from "react";

import { LIST_ITEM_HEIGHT } from "@/features/panel-fila/components/list-skeleton";
import { listCases } from "@/lib/api/panel/cases";
import { cn } from "@/lib/utils";

/**
 * The list pane's data (D-C1). T97 renders the items plainly at the
 * skeleton's height; T98 replaces this with CaseListbox, its states and
 * "Carregar mais".
 */
export async function CaseListSection(): Promise<JSX.Element> {
  const page = await listCases({ estado: "aberto", limit: 25 });
  return (
    <ul className="flex flex-col gap-2">
      {page.itens.map((item) => (
        <li
          key={item.id}
          className={cn(LIST_ITEM_HEIGHT, "truncate text-body text-ink")}
        >
          {item.razao_social ?? item.cnpj}
        </li>
      ))}
    </ul>
  );
}
