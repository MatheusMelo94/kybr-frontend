import { act, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { Dialog } from "@/components/panel/dialog";
import { SessionExpiryProvider } from "@/features/panel-shell/components/session-expiry-provider";
import { useSessionExpiry } from "@/features/panel-shell/use-session-expiry";

// jsdom has no showModal()/close(): a minimal stand-in that toggles `open`
// and fires `close`. The real modality (inert background, top layer) and the
// motion are read in a browser (tests/e2e/panel/primitives.spec.ts).
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

const assign = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("location", {
    ...window.location,
    pathname: "/fila/abc",
    search: "",
    assign,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function Harness({
  busy = false,
  dirty = false,
  withInitialFocus = false,
}: {
  busy?: boolean;
  dirty?: boolean;
  withInitialFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const note = useRef<HTMLTextAreaElement>(null);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Bloquear
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Bloquear Empresa Exemplo Ltda?"
        closeLabel="Fechar"
        busy={busy}
        dirty={dirty}
        {...(withInitialFocus ? { initialFocus: note } : {})}
      >
        <p>O vendedor vê o motivo no link.</p>
        <label htmlFor="motivo">Motivo</label>
        <input id="motivo" />
        <label htmlFor="nota">Mensagem</label>
        <textarea id="nota" ref={note} />
        <button type="submit">Bloquear vendedor</button>
      </Dialog>
    </>
  );
}

function openDialog() {
  const trigger = screen.getByRole("button", { name: "Bloquear" });
  trigger.focus();
  act(() => trigger.click());
  return trigger;
}

function Expire() {
  const expire = useSessionExpiry();
  return (
    <button type="button" onClick={expire}>
      expirar
    </button>
  );
}

describe("Dialog (T94, spec § Accessibility Acceptance › Dialogs)", () => {
  it("is closed until opened, then shown modally, labelled by its heading", () => {
    render(<Harness />);
    expect(screen.queryByRole("dialog")).toBeNull();

    openDialog();

    const dialog = screen.getByRole("dialog", {
      name: "Bloquear Empresa Exemplo Ltda?",
    });
    expect(proto.showModal).toHaveBeenCalledTimes(1);
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(
      screen.getByRole("heading", { name: "Bloquear Empresa Exemplo Ltda?" }),
    ).toBeInTheDocument();
  });

  it("moves focus to the first field on open", () => {
    render(<Harness />);
    openDialog();
    expect(screen.getByLabelText("Motivo")).toHaveFocus();
  });

  it("moves focus to initialFocus when given", () => {
    render(<Harness withInitialFocus />);
    openDialog();
    expect(screen.getByLabelText("Mensagem")).toHaveFocus();
  });

  it("Esc closes it and focus returns to the trigger", () => {
    render(<Harness />);
    const trigger = openDialog();

    fireEvent.keyDown(screen.getByLabelText("Motivo"), { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(proto.close).toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  it("a cancel request (the platform's close) closes it through onClose", () => {
    render(<Harness />);
    const trigger = openDialog();
    const cancel = new Event("cancel", { cancelable: true });

    act(() => {
      screen.getByRole("dialog").dispatchEvent(cancel);
    });

    expect(cancel.defaultPrevented).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("the close button (common.close) closes it", () => {
    render(<Harness />);
    openDialog();
    act(() => screen.getByRole("button", { name: "Fechar" }).click());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("while busy, Esc, a cancel request and the close button do nothing", () => {
    render(<Harness busy />);
    openDialog();

    fireEvent.keyDown(screen.getByLabelText("Motivo"), { key: "Escape" });
    act(() => {
      screen
        .getByRole("dialog")
        .dispatchEvent(new Event("cancel", { cancelable: true }));
    });
    const close = screen.getByRole("button", { name: "Fechar" });
    expect(close).toBeDisabled();
    act(() => close.click());

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(proto.close).not.toHaveBeenCalled();
  });

  it("an open dialog with unsent input sets perdido=1 on session expiry (AC 7)", () => {
    render(
      <SessionExpiryProvider>
        <Harness dirty />
        <Expire />
      </SessionExpiryProvider>,
    );
    openDialog();
    act(() => screen.getByRole("button", { name: "expirar" }).click());

    expect(assign).toHaveBeenCalledWith(
      expect.stringContaining("&perdido=1"),
    );
  });

  it("a closed dialog's draft doesn't count", () => {
    render(
      <SessionExpiryProvider>
        <Harness dirty />
        <Expire />
      </SessionExpiryProvider>,
    );
    act(() => screen.getByRole("button", { name: "expirar" }).click());

    expect(assign).toHaveBeenCalledWith(
      expect.not.stringContaining("perdido"),
    );
  });
});
