"use client";

import { useEffect, useRef, type JSX } from "react";

import { Notice } from "@/components/panel/notice";
import { loginCopy } from "@/features/panel-auth/copy/login";
import { resetCopy } from "@/features/panel-auth/copy/reset";
import { globalCopy } from "@/features/panel-shell/copy/global";

export type AuthBannerKind =
  "sessao" | "sessao-perdido" | "saiu" | "senha-nova";

const TEXTS: Record<AuthBannerKind, readonly string[]> = {
  sessao: [globalCopy["session.expired"]],
  "sessao-perdido": [
    globalCopy["session.expired"],
    globalCopy["session.expired.lost"],
  ],
  saiu: [loginCopy["auth.logout.done"]],
  "senha-nova": [resetCopy["reset.done"]],
};

type Props = {
  kind: AuthBannerKind;
};

/**
 * Why Renata is on /entrar (motivo=…). Text present at first paint isn't
 * announced reliably, so the banner takes focus on mount: screen readers
 * read it on load (plan § 2.8).
 */
export function AuthBanner({ kind }: Props): JSX.Element {
  const banner = useRef<HTMLDivElement>(null);
  useEffect(() => {
    banner.current?.focus();
  }, []);

  return (
    <Notice ref={banner} focusable>
      {TEXTS[kind].map((text) => (
        <p key={text}>{text}</p>
      ))}
    </Notice>
  );
}
