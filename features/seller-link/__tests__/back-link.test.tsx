import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BackLink } from "@/features/seller-link/components/back-link";

const router = vi.hoisted(() => ({ back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

function setReferrer(value: string): void {
  Object.defineProperty(document, "referrer", {
    configurable: true,
    get: () => value,
  });
}

beforeEach(() => {
  router.back.mockReset();
});

afterEach(() => {
  setReferrer("");
  vi.restoreAllMocks();
});

describe("BackLink (privacy.back)", () => {
  it("is a link to the fallback page, so it works without JavaScript too", () => {
    render(<BackLink href="/v/loja-exemplo" />);

    expect(
      screen.getByRole("link", { name: "Voltar ao cadastro" }),
    ).toHaveAttribute("href", "/v/loja-exemplo");
  });

  it("goes back in history when the seller came from this site (the form or the case page)", async () => {
    setReferrer(`${location.origin}/v/loja-exemplo/c/tokpendente0000000000000`);
    window.history.pushState({}, "", "/v/loja-exemplo/privacidade");
    render(<BackLink href="/v/loja-exemplo" />);

    await userEvent.click(
      screen.getByRole("link", { name: "Voltar ao cadastro" }),
    );

    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("goes back after an in-app navigation, where the referrer still names the first page load", async () => {
    setReferrer("");
    window.history.pushState({}, "", "/v/loja-exemplo/privacidade");
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([
      {
        name: `${location.origin}/v/loja-exemplo/c/tokpendente0000000000000`,
      } as PerformanceEntry,
    ]);
    render(<BackLink href="/v/loja-exemplo" />);

    await userEvent.click(
      screen.getByRole("link", { name: "Voltar ao cadastro" }),
    );

    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("follows the link when the seller arrived from elsewhere", async () => {
    setReferrer("https://marketplace.example/onboarding");
    render(<BackLink href="/v/loja-exemplo" />);
    const link = screen.getByRole("link", { name: "Voltar ao cadastro" });
    const followed = vi.fn((event: Event) => event.preventDefault());
    link.addEventListener("click", followed);

    await userEvent.click(link);

    expect(router.back).not.toHaveBeenCalled();
    expect(followed).toHaveBeenCalled();
  });
});
