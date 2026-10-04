import type { JSX } from "react";

import { ExternalLink } from "@/components/ui/external-link";
import { BackLink } from "@/features/seller-link/components/back-link";
import { SECONDARY_ACTION_LINK } from "@/features/seller-link/components/case/action-link-styles";
import { privacyCopy } from "@/features/seller-link/copy/privacy";
import { sharedCopy } from "@/features/seller-link/copy/shared";
import { fill } from "@/features/seller-link/format";
import type { PublicLink } from "@/lib/api/schemas/public-link";

type Props = {
  slug: string;
  /** D1's link info, or null when it failed to load (the partial state). */
  link: PublicLink | null;
};

/**
 * The plain-language LGPD notice (spec § Privacy notice, AC 31): the
 * marketplace is the controller, Kybr the operator. When the link info failed,
 * the strings that name the marketplace switch to their .fallback versions and
 * the contact action is hidden (spec v3), so no sentence starts in lower case.
 */
export function PrivacyNotice({ slug, link }: Props): JSX.Element {
  const marketplace = link?.nome;
  const sections = [
    {
      heading: privacyCopy["privacy.who.h2"],
      body:
        marketplace === undefined
          ? privacyCopy["privacy.who.fallback"]
          : fill(privacyCopy["privacy.who"], { marketplace }),
    },
    {
      heading: privacyCopy["privacy.what.h2"],
      body: privacyCopy["privacy.what"],
    },
    {
      heading: privacyCopy["privacy.why.h2"],
      body: privacyCopy["privacy.why"],
    },
    {
      heading: privacyCopy["privacy.time.h2"],
      body:
        marketplace === undefined
          ? privacyCopy["privacy.time.fallback"]
          : fill(privacyCopy["privacy.time"], { marketplace }),
    },
    {
      heading: privacyCopy["privacy.rights.h2"],
      body:
        marketplace === undefined
          ? privacyCopy["privacy.rights.fallback"]
          : fill(privacyCopy["privacy.rights"], { marketplace }),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-title font-title">{privacyCopy["privacy.h1"]}</h1>
      {sections.map(({ heading, body }) => (
        <section key={heading} className="flex flex-col gap-2">
          <h2 className="text-body font-strong text-ink">{heading}</h2>
          <p className="text-body text-ink-muted">{body}</p>
        </section>
      ))}
      {link !== null && <Contact link={link} />}
      <BackLink href={`/v/${slug}`} />
    </div>
  );
}

/** "Falar com {marketplace}": the mail app for an e-mail, a new tab for a URL (plan § 9). */
function Contact({ link }: { link: PublicLink }): JSX.Element {
  const label = fill(privacyCopy["privacy.contact"], {
    marketplace: link.nome,
  });
  const contact = link.contato_vendedor;
  return contact.tipo === "email" ? (
    <a href={`mailto:${contact.valor}`} className={SECONDARY_ACTION_LINK}>
      {label}
    </a>
  ) : (
    <ExternalLink
      href={contact.valor}
      srSuffix={sharedCopy["external.sr"]}
      className={SECONDARY_ACTION_LINK}
    >
      {label}
    </ExternalLink>
  );
}
