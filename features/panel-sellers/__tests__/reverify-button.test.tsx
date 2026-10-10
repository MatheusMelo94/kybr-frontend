import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { ToastProvider } from "@/components/panel/toast";
import type { ReverifyResult } from "@/features/panel-sellers/actions";
import { ReverifyButton } from "@/features/panel-sellers/components/reverify-button";
import { SellersProvider } from "@/features/panel-sellers/components/sellers-provider";
import { SessionExpiryProvider } from "@/features/panel-shell/components/session-expiry-provider";

// T141 (AC 56, plan-m8 D6, Q2): Reverificar spends a credit, so it confirms
// first, keeps the intent key across an unknown outcome and shows the
// pending state from ok or a 409.

const reverifyAction = vi.hoisted(() => vi.fn());
vi.mock("@/features/panel-sellers/actions", () => ({ reverifyAction }));
const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

// jsdom has no showModal()/close() (see dialog.test.tsx).
const proto = HTMLDialogElement.prototype;
const original = { showModal: proto.showModal, close: proto.close };
beforeAll(() => {
  proto.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  proto.close = vi.fn(function (this: HTMLDialogElement) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  });
});
afterAll(() => {
  proto.showModal = original.showModal;
  proto.close = original.close;
});

const SELLER = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const NETWORK_ERROR =
  "Não conseguimos falar com o servidor. Confira sua conexão e tente de novo.";
const EXHAUSTED =
  "As verificações do plano acabaram. Contrate para continuar verificando.";

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/vendedores");
});

function renderButton(
  props: Partial<Parameters<typeof ReverifyButton>[0]> = {},
) {
  return render(
    <SessionExpiryProvider>
      <ToastProvider closeLabel="Fechar">
        <SellersProvider>
          <ReverifyButton
            sellerId={SELLER}
            razaoSocial="Loja Exemplo Ltda"
            cnpj="12.345.***/****-90"
            {...props}
          />
        </SellersProvider>
      </ToastProvider>
    </SessionExpiryProvider>,
  );
}

function openDialog(): void {
  fireEvent.click(screen.getByRole("button", { name: "Reverificar" }));
}

function submitButton(): HTMLElement {
  const dialog = screen.getByRole("dialog", { hidden: true });
  const buttons = dialog.querySelectorAll<HTMLButtonElement>(
    "button[type=submit]",
  );
  return buttons[0] as HTMLElement;
}

describe("ReverifyButton", () => {
  it("opens the confirmation and sends nothing before it is confirmed", () => {
    renderButton();
    openDialog();
    expect(
      screen.getByRole("heading", {
        name: "Reverificar Loja Exemplo Ltda?",
        hidden: true,
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Consultamos a Receita de novo agora. Isso consome 1 verificação do seu plano.",
      ),
    ).toBeTruthy();
    expect(reverifyAction).not.toHaveBeenCalled();
  });

  it("mounts its dialog only once opened (a page holds 50 rows)", () => {
    renderButton();
    expect(screen.queryByRole("dialog", { hidden: true })).toBeNull();
    openDialog();
    expect(screen.getByRole("dialog", { hidden: true })).toBeTruthy();
  });

  it("names the masked CNPJ when there is no razão social (G3)", () => {
    renderButton({ razaoSocial: null });
    openDialog();
    expect(
      screen.getByRole("heading", {
        name: "Reverificar 12.345.***/****-90?",
        hidden: true,
      }),
    ).toBeTruthy();
  });

  it("is busy while the call is in flight", async () => {
    let finish: (result: ReverifyResult) => void = () => {};
    reverifyAction.mockReturnValue(
      new Promise<ReverifyResult>((resolve) => {
        finish = resolve;
      }),
    );
    renderButton();
    openDialog();
    fireEvent.click(submitButton());
    expect(submitButton().getAttribute("aria-busy")).toBe("true");
    await act(async () => finish({ ok: true }));
  });

  it("ok: the toast, the pending state and a re-read", async () => {
    reverifyAction.mockResolvedValue({ ok: true });
    renderButton();
    openDialog();
    await act(async () => {
      fireEvent.click(submitButton());
    });
    expect(reverifyAction).toHaveBeenCalledWith({
      sellerId: SELLER,
      idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    expect(
      screen.getByText("Reverificação pedida: Loja Exemplo Ltda"),
    ).toBeTruthy();
    expect(screen.getByText("Reverificando…")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reverificar" })).toBeNull();
    expect(router.refresh).toHaveBeenCalled();
  });

  it("a retry after NETWORK reuses the intent key", async () => {
    reverifyAction
      .mockResolvedValueOnce({ ok: false, code: "NETWORK" })
      .mockResolvedValueOnce({ ok: true });
    renderButton();
    openDialog();
    await act(async () => {
      fireEvent.click(submitButton());
    });
    expect(screen.getByRole("alert", { hidden: true }).textContent).toBe(
      NETWORK_ERROR,
    );
    await act(async () => {
      fireEvent.click(submitButton());
    });
    const [first, second] = reverifyAction.mock.calls.map(
      (call) => (call[0] as { idempotencyKey: string }).idempotencyKey,
    );
    expect(second).toBe(first);
  });

  it("a definitive outcome spends the key: the next intent gets a fresh one", async () => {
    reverifyAction.mockResolvedValue({ ok: false, code: "SEM_SALDO" });
    renderButton();
    openDialog();
    await act(async () => {
      fireEvent.click(submitButton());
    });
    await act(async () => {
      fireEvent.click(submitButton());
    });
    const [first, second] = reverifyAction.mock.calls.map(
      (call) => (call[0] as { idempotencyKey: string }).idempotencyKey,
    );
    expect(second).not.toBe(first);
  });

  it("409: the pending state, with no error", async () => {
    reverifyAction.mockResolvedValue({
      ok: false,
      code: "REVERIFICACAO_EM_ANDAMENTO",
    });
    renderButton();
    openDialog();
    await act(async () => {
      fireEvent.click(submitButton());
    });
    expect(screen.getByText("Reverificando…")).toBeTruthy();
    expect(screen.queryByText(NETWORK_ERROR)).toBeNull();
  });

  it("SEM_SALDO: plan.exhausted inline", async () => {
    reverifyAction.mockResolvedValue({ ok: false, code: "SEM_SALDO" });
    renderButton();
    openDialog();
    await act(async () => {
      fireEvent.click(submitButton());
    });
    expect(screen.getByRole("alert", { hidden: true }).textContent).toBe(
      EXHAUSTED,
    );
  });

  it("the allowance used up: disabled and described by plan.exhausted", () => {
    renderButton({ exhausted: { describedBy: "sem-saldo" } });
    const button = screen.getByRole("button", { name: "Reverificar" });
    expect(button).toHaveProperty("disabled", true);
    expect(button.getAttribute("aria-describedby")).toBe("sem-saldo");
  });

  it("a pending reverify from the server shows the pending word, no button", () => {
    renderButton({ pending: true });
    expect(screen.getByText("Reverificando…")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reverificar" })).toBeNull();
  });
});
