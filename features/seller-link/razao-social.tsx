import type { JSX } from "react";

import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { sharedCopy } from "@/features/seller-link/copy/shared";
import { CPF_MASK, maskCpf } from "@/lib/cpf";

// A razão social on the link (spec v3 § Company data on the link). Any CPF in
// it is shown masked, read to screen readers as a11y.cpf_masked rather than as
// asterisks, and masked again here as the last backstop. Reused by the company
// block (T16) and the result views (T21–T23).

type Props = {
  value: string;
};

/** The name with each masked CPF aria-hidden and read as "CPF oculto". */
export function RazaoSocial({ value }: Props): JSX.Element {
  const parts = maskCpf(value).split(CPF_MASK);
  if (parts.length === 1) return <>{parts[0]}</>;
  return (
    <>
      {parts.map((part, index) => (
        // Positional parts of one fixed string: the index is the identity.
        <span key={index}>
          {part}
          {index < parts.length - 1 && (
            <>
              <span aria-hidden="true">{CPF_MASK}</span>
              <VisuallyHidden>{sharedCopy["a11y.cpf_masked"]}</VisuallyHidden>
            </>
          )}
        </span>
      ))}
    </>
  );
}

/** The name as plain text for announcements, with each CPF as "CPF oculto". */
export function razaoSocialText(value: string): string {
  return maskCpf(value).split(CPF_MASK).join(sharedCopy["a11y.cpf_masked"]);
}
