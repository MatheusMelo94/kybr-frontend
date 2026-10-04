import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { saveContactEmail } from "@/features/seller-link/actions";
import { ContactEmailBlock } from "@/features/seller-link/components/case/contact-email-block";

vi.mock("@/features/seller-link/actions", () => ({
  saveContactEmail: vi.fn(),
}));
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const save = vi.mocked(saveContactEmail);
const SLUG = "loja-exemplo";
const TOKEN = "tokpendente0000000000000";
const EMAIL = "maria@empresa-exemplo.test";

function field(): HTMLInputElement {
  return screen.getByRole("textbox", { name: "Seu e-mail para avisos" });
}

function saveButton(): HTMLElement {
  return screen.getByRole("button", { name: "Salvar e-mail" });
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  save.mockReset();
  router.refresh.mockReset();
});

describe("ContactEmailBlock (DDR-0001)", () => {
  it("empty state: label, hint, an e-mail field and the save button", () => {
    render(<ContactEmailBlock slug={SLUG} token={TOKEN} />);

    expect(field()).toHaveAttribute("type", "email");
    expect(field()).toHaveAttribute("autocomplete", "email");
    expect(field()).toHaveAccessibleDescription(
      "Só usamos para falar sobre este cadastro.",
    );
    expect(saveButton()).toBeInTheDocument();
  });

  it("AC 24: empty input shows email.error.empty, linked to the field and focused, with no request", async () => {
    const user = userEvent.setup();
    render(<ContactEmailBlock slug={SLUG} token={TOKEN} />);

    await user.click(saveButton());

    expect(field()).toHaveAttribute("aria-invalid", "true");
    expect(field()).toHaveAccessibleDescription(
      expect.stringContaining("Informe um e-mail."),
    );
    expect(field()).toHaveFocus();
    expect(save).not.toHaveBeenCalled();
  });

  it("AC 24: invalid input shows email.error.invalid, with no request", async () => {
    const user = userEvent.setup();
    render(<ContactEmailBlock slug={SLUG} token={TOKEN} />);

    await user.type(field(), "maria@");
    await user.click(saveButton());

    expect(
      screen.getByText("Confira o e-mail. Exemplo: nome@empresa.com.br"),
    ).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("AC 24: saving keeps the button's width with email.busy, then shows and announces email.saved with the typed address", async () => {
    const user = userEvent.setup();
    const pending = deferred<{ ok: true }>();
    save.mockReturnValue(pending.promise);
    render(<ContactEmailBlock slug={SLUG} token={TOKEN} />);

    await user.type(field(), EMAIL);
    await user.click(saveButton());

    expect(save).toHaveBeenCalledWith({
      slug: SLUG,
      token: TOKEN,
      email: EMAIL,
    });
    expect(screen.getByRole("button", { name: "Salvando…" })).toHaveAttribute(
      "aria-busy",
      "true",
    );

    pending.resolve({ ok: true });
    const status = await screen.findByText(
      `E-mail salvo. Vamos avisar em ${EMAIL}.`,
    );
    expect(status.closest('[role="status"]')).not.toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Trocar e-mail" }),
      ).toHaveFocus(),
    );
  });

  it("AC 24: Trocar e-mail reopens the field and focuses it", async () => {
    const user = userEvent.setup();
    save.mockResolvedValue({ ok: true });
    render(<ContactEmailBlock slug={SLUG} token={TOKEN} />);

    await user.type(field(), EMAIL);
    await user.click(saveButton());
    await user.click(
      await screen.findByRole("button", { name: "Trocar e-mail" }),
    );

    expect(field()).toHaveFocus();
    expect(field()).toHaveValue(EMAIL);
  });

  it("AC 26: after a reload the masked address from D4 shows as saved", () => {
    render(
      <ContactEmailBlock
        slug={SLUG}
        token={TOKEN}
        maskedSaved="m•••@empresa-exemplo.test"
      />,
    );

    expect(
      screen.getByText(
        "E-mail salvo. Vamos avisar em m•••@empresa-exemplo.test.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
    // Not focused on mount: the case page's h1 owns the initial focus.
    expect(
      screen.getByRole("button", { name: "Trocar e-mail" }),
    ).not.toHaveFocus();
  });

  it("AC 24: a network failure shows email.error.network and keeps the value for a retry", async () => {
    const user = userEvent.setup();
    save.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<ContactEmailBlock slug={SLUG} token={TOKEN} />);

    await user.type(field(), EMAIL);
    await user.click(saveButton());

    const error = await screen.findByText(
      "Não conseguimos salvar o e-mail. Tente de novo.",
    );
    expect(field()).toHaveValue(EMAIL);
    // Review 0015: polite, not an alert, and part of the field's and the
    // button's description while it stands.
    expect(error.closest('[role="status"]')).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(field()).toHaveAccessibleDescription(
      expect.stringContaining("Não conseguimos salvar o e-mail."),
    );
    expect(saveButton()).toHaveAccessibleDescription(
      expect.stringContaining("Não conseguimos salvar o e-mail."),
    );

    save.mockResolvedValueOnce({ ok: true });
    await user.click(saveButton());
    expect(
      await screen.findByText(`E-mail salvo. Vamos avisar em ${EMAIL}.`),
    ).toBeInTheDocument();
  });

  it("review 0015: the network error stops describing the field once the address changes", async () => {
    const user = userEvent.setup();
    save.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<ContactEmailBlock slug={SLUG} token={TOKEN} />);

    await user.type(field(), EMAIL);
    await user.click(saveButton());
    await screen.findByText("Não conseguimos salvar o e-mail. Tente de novo.");
    await user.type(field(), "x");

    expect(field()).not.toHaveAccessibleDescription(
      expect.stringContaining("Não conseguimos salvar"),
    );
    expect(saveButton()).not.toHaveAccessibleDescription(
      expect.stringContaining("Não conseguimos salvar"),
    );
  });

  it("an UNAVAILABLE answer uses the network copy too", async () => {
    const user = userEvent.setup();
    save.mockResolvedValue({ ok: false, code: "UNAVAILABLE" });
    render(<ContactEmailBlock slug={SLUG} token={TOKEN} />);

    await user.type(field(), EMAIL);
    await user.click(saveButton());

    expect(
      await screen.findByText(
        "Não conseguimos salvar o e-mail. Tente de novo.",
      ),
    ).toBeInTheDocument();
  });

  it("the API's EMAIL_INVALIDO shows email.error.invalid on the field", async () => {
    const user = userEvent.setup();
    save.mockResolvedValue({
      ok: false,
      code: "EMAIL_INVALIDO",
      issue: "invalid",
    });
    render(<ContactEmailBlock slug={SLUG} token={TOKEN} />);

    await user.type(field(), EMAIL);
    await user.click(saveButton());

    await waitFor(() =>
      expect(field()).toHaveAttribute("aria-invalid", "true"),
    );
    expect(
      screen.getByText("Confira o e-mail. Exemplo: nome@empresa.com.br"),
    ).toBeInTheDocument();
  });

  it.each(["CASO_DECIDIDO", "CASO_NAO_ENCONTRADO"] as const)(
    "%s refreshes the page, so the decided result (or Case not found) replaces it",
    async (code) => {
      const user = userEvent.setup();
      save.mockResolvedValue({ ok: false, code });
      render(<ContactEmailBlock slug={SLUG} token={TOKEN} />);

      await user.type(field(), EMAIL);
      await user.click(saveButton());

      await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    },
  );
});
