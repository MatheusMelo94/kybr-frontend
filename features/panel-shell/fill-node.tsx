import { Fragment, type ReactNode } from "react";

/**
 * Fills a copy template's `{placeholders}` with elements (links), keeping the
 * sentence whole: the translation-safe way to put a link inside copy, never
 * by concatenating fragments.
 */
export function fillNodes(
  template: string,
  values: Record<string, ReactNode>,
): ReactNode {
  return template.split(/(\{\w+\})/g).map((part, index) => {
    const name = /^\{(\w+)\}$/.exec(part)?.[1];
    return (
      <Fragment key={index}>
        {name !== undefined && name in values ? values[name] : part}
      </Fragment>
    );
  });
}
