import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { connection } from "next/server";
import type { JSX, ReactNode } from "react";

// Inter variable, self-hosted at build (Constitution v2 § Brand). Swapping to a
// licensed Saans later is a next/font/local change in this one place.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

// One icon set for both hosts (DDR-0002; link AC 41, panel AC 75), static
// files in public/: the 16/32/48 .ico, the dotless "k" SVG, the 180 px
// apple-touch "k.". No web manifest (no install use case).
export const metadata: Metadata = {
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/brand/kybr-icon.svg", type: "image/svg+xml" },
    ],
    apple: "/brand/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  // Justified one-off raw hex (§ Styling): the browser UI color must be a literal
  // here. These mirror --color-surface (light / dark) in app/tokens.css; a test
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
      {/* A word longer than the column (a title at 200 % text on a phone) breaks
          instead of scrolling the page sideways (WCAG 1.4.4 / 1.4.10). */}
      <body className="wrap-break-word">{children}</body>
    </html>
  );
}
