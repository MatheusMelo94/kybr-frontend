import { Fragment, type ReactNode } from "react";

import type { Placeholders } from "@/features/seller-link/format";

/**
 * Fills a copy template's `{placeholder}`s with text or elements, such as
 * <RazaoSocial> (spec v3: a masked CPF read as "CPF oculto"). The sentence
 * stays one string in the copy deck, never stitched from fragments (DC § UX
 * Writing). For server-rendered views; plain strings use fill().
 */
export function fillNode<S extends string>(
  template: S,
  values: Record<Placeholders<S>, ReactNode>,
): ReactNode[] {
  const lookup = values as Record<string, ReactNode>;
  return template.split(/(\{\w+\})/).map((part, index) => {
    const name = /^\{(\w+)\}$/.exec(part)?.[1];
    return (
      // Positional parts of one fixed template: the index is the identity.
      <Fragment key={index}>
        {name !== undefined && name in lookup ? lookup[name] : part}
      </Fragment>
    );
  });
}
