import type { Viewport } from "next";
import { Inter } from "next/font/google";
import { connection } from "next/server";
import type { JSX, ReactNode } from "react";

import "./globals.css";

// Inter variable, self-hosted at build (Constitution v2 § Brand). Swapping to a
// licensed Saans later is a next/font/local change in this one place.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const viewport: Viewport = {
  colorScheme: "light dark",
  // Justified one-off raw hex (§ Styling): the browser UI color must be a literal
  // here. These mirror --color-surface (light / dark) in app/globals.css; a test
  // keeps them in sync.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#111111" },
  ],
};

type Props = {
  children: ReactNode;
};

export default async function RootLayout({
  children,
}: Props): Promise<JSX.Element> {
  // middleware.ts sets a fresh CSP nonce on every request, and Next stamps it on
  // the page's scripts. A prerendered page would carry scripts without this
  // request's nonce, and the CSP would block them. So every page renders per
  // request (ADR-0001: a nonce CSP makes every page dynamic).
  await connection();

  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
