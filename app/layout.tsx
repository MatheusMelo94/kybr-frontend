import type { Viewport } from "next";
import { Inter } from "next/font/google";
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

export default function RootLayout({ children }: Props): JSX.Element {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
