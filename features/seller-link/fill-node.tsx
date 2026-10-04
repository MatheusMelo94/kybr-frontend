import { Fragment, isValidElement, type ReactNode } from "react";

import { endsSentence, type Placeholders } from "@/features/seller-link/format";
import { RazaoSocial } from "@/features/seller-link/razao-social";

/**
 * Fills a copy template's `{placeholder}`s with text or elements, such as
 * <RazaoSocial> (spec v3: a masked CPF read as "CPF oculto"). The sentence
 * stays one string in the copy deck, never stitched from fragments (DC § UX
 * Writing). For server-rendered views; plain strings use fill().
 *
 * A value that already ends with a period ("Ltda.", "S.A.") ends the sentence
 * itself: the template's period right after it is dropped, so there's no
 * "Ltda.." (T23a; the same rule as fill(), via endsSentence). The value is
 * never changed.
 */
export function fillNode<S extends string>(
  template: S,
  values: Record<Placeholders<S>, ReactNode>,
): ReactNode[] {
  const lookup = values as Record<string, ReactNode>;
  const parts = template.split(/(\{\w+\})/);
  return parts.map((part, index) => {
    const name = /^\{(\w+)\}$/.exec(part)?.[1];
    const previous = /^\{(\w+)\}$/.exec(parts[index - 1] ?? "")?.[1];
    const text =
      previous !== undefined &&
      previous in lookup &&
      endsSentence(trailingText(lookup[previous]), part)
        ? part.slice(1)
        : part;
    return (
      // Positional parts of one fixed template: the index is the identity.
      <Fragment key={index}>
        {name !== undefined && name in lookup ? lookup[name] : text}
      </Fragment>
    );
  });
}

/**
 * The text a node ends with: a string itself, the last child of an element or
 * array, or <RazaoSocial>'s `value` (masking a CPF never changes the name's
 * last character). No other element's `value` is read (review 0027).
 */
function trailingText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return `${node}`;
  if (Array.isArray(node)) {
    for (let i = node.length - 1; i >= 0; i--) {
      const text = trailingText(node[i] as ReactNode);
      if (text !== "") return text;
    }
    return "";
  }
  if (isValidElement<{ children?: ReactNode; value?: unknown }>(node)) {
    const { children, value } = node.props;
    if (children !== undefined) return trailingText(children);
    if (node.type === RazaoSocial && typeof value === "string") return value;
  }
  return "";
}
