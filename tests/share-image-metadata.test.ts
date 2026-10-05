// @vitest-environment node
import { describe, expect, it } from "vitest";

import { metadata as linkMetadata } from "@/app/(link)/layout";
import { metadata as panelMetadata } from "@/app/(panel)/painel/layout";

// Brand v1 B3 (DDR-0002; panel AC 75): the share image is the panel's, on
// the panel host's origin; the link never has one (Decision 4).
// The vitest env: PANEL_HOST app.kybr.test, no loopback http.


describe("the share image", () => {
  it("the panel layout declares it: 1200 × 630, its alt, title, description, a large Twitter card, on the panel origin", () => {
    expect(panelMetadata.metadataBase).toEqual(new URL("https://app.kybr.test"));
    expect(panelMetadata.openGraph).toEqual({
      title: "Kybr",
      description: "Verificação de empresas por link.",
      images: [
        {
          url: "/brand/kybr-og-1200x630.png",
          width: 1200,
          height: 630,
          alt: "kybr. Saiba com quem você vende.",
        },
      ],
    });
    expect(panelMetadata.twitter).toEqual({ card: "summary_large_image" });
  });

  it("the link layout has none (no og:image or twitter:image on /v/*)", () => {
    expect(linkMetadata.openGraph).toBeUndefined();
    expect(linkMetadata.twitter).toBeUndefined();
  });
});
