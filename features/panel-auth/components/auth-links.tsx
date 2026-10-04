import Link from "next/link";
import type { JSX } from "react";

type Props = {
  links: readonly { href: string; label: string }[];
};

/** The secondary paths under an auth form ("Esqueci minha senha", "Criar conta"…). */
export function AuthLinks({ links }: Props): JSX.Element {
  return (
    <ul className="flex flex-col gap-1">
      {links.map((link) => (
        <li key={link.href}>
          <Link
            href={link.href}
            className="inline-flex min-h-11 items-center text-secondary text-ink underline underline-offset-4 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {link.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
