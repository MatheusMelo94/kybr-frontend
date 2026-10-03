import type { Metadata } from "next";
import type { JSX } from "react";

// Any unknown path. It also makes the app router (and so the per-request root
// layout with the CSP nonce) own every 404, instead of a static Pages Router
// page whose scripts the CSP would block.
// Copy is spec § Content & Copy notfound.* verbatim; T13 moves it into the
// copy module and the LinkNotFound component.

export const metadata: Metadata = { title: "Link não encontrado" };

export default function NotFound(): JSX.Element {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-link flex-col justify-center gap-3 px-4 py-12">
      <h1 className="text-title font-title">Link não encontrado</h1>
      <p className="text-body text-ink-muted">
        Este link de cadastro não existe ou foi desativado. Peça o link certo à
        plataforma onde você está se cadastrando.
      </p>
    </main>
  );
}
