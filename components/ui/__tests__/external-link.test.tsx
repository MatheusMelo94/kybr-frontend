import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ExternalLink } from "@/components/ui/external-link";
import { toSafeHttpsUrl } from "@/lib/safe-url";

const receita = toSafeHttpsUrl("https://www.gov.br/receitafederal")!;

describe("ExternalLink", () => {
  it("opens the URL in a new tab without handing over the opener or referrer", () => {
    render(
      <ExternalLink href={receita} srSuffix="(abre em outra aba)">
        Regularizar na Receita Federal
      </ExternalLink>,
    );

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://www.gov.br/receitafederal");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("ends its accessible name with the screen-reader suffix", () => {
    render(
      <ExternalLink href={receita} srSuffix="(abre em outra aba)">
        Regularizar na Receita Federal
      </ExternalLink>,
    );

    expect(
      screen.getByRole("link", {
        name: "Regularizar na Receita Federal (abre em outra aba)",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("(abre em outra aba)")).toHaveClass("sr-only");
  });

  it("is a 44 px target with a focus-visible ring, and merges extra classes", () => {
    render(
      <ExternalLink
        href={receita}
        srSuffix="(abre em outra aba)"
        className="w-full"
      >
        Como regularizar
      </ExternalLink>,
    );

    expect(screen.getByRole("link")).toHaveClass(
      "min-h-11",
      "focus-visible:outline-focus",
      "w-full",
    );
  });

  it("accepts only a SafeHttpsUrl", () => {
    render(
      // @ts-expect-error: a plain string is not a SafeHttpsUrl.
      <ExternalLink href="javascript:alert(1)" srSuffix="(abre em outra aba)">
        x
      </ExternalLink>,
    );
  });
});
