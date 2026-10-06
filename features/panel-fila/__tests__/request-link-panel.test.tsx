import { act, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, type JSX } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/panel/toast";
import {
  FilaProvider,
  useFila,
} from "@/features/panel-fila/components/fila-provider";
import { RequestLinkPanel } from "@/features/panel-fila/components/request-link-panel";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const LINK = "https://kybr.test/v/loja-exemplo/c/AAAAAAAAAAAAAAAAAAAAAA";
const FRESH = "https://kybr.test/v/loja-exemplo/c/BBBBBBBBBBBBBBBBBBBBBB";

const writeText = vi.fn<(text: string) => Promise<void>>();
const readText = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText, readText },
  });
});
afterEach(() => {
  // @ts-expect-error: the test's own property.
  delete navigator.clipboard;
});

/** T108's no-e-mail success, as RequestDocumentsDialog sets it. */
function Requested({ link }: { link: string | undefined }): null {
  const { setFlash } = useFila();
  useEffect(() => {
    setFlash("caso-a", { kind: "requested", link });
  }, [setFlash, link]);
  return null;
}

function Screen({
  link,
  requested,
}: {
  link: string | undefined;
  requested?: { link: string | undefined };
}): JSX.Element {
  return (
    <ToastProvider closeLabel="Fechar">
      <FilaProvider renderedAt={1}>
        {requested && <Requested link={requested.link} />}
        <RequestLinkPanel caseId="caso-a" link={link} />
      </FilaProvider>
    </ToastProvider>
  );
}

const nextFrame = () =>
  act(
    async () =>
      new Promise<void>((done) => requestAnimationFrame(() => done())),
  );
const heading = () =>
  screen.queryByRole("heading", {
    name: "Pedido criado. Envie este link ao vendedor:",
  });
const input = () =>
  screen.getByRole("textbox", {
    name: "Pedido criado. Envie este link ao vendedor:",
  }) as HTMLInputElement;
const copy = () => screen.getByRole("button", { name: "Copiar link" });
const toastText = () => screen.getByRole("status").textContent;

describe("RequestLinkPanel (T109; AC 37 after half; D11; F9)", () => {
  it("no link: nothing renders", () => {
    render(<Screen link={undefined} />);
    expect(heading()).toBeNull();
  });

  it("a case with link_vendedor (a later visit): doc.link.h, the link in a read-only input, Copiar link; no focus moves", () => {
    render(<Screen link={LINK} />);
    expect(heading()).toBeInTheDocument();
    expect(heading()).toHaveAttribute("tabIndex", "-1");
    expect(heading()).not.toHaveFocus();
    expect(input()).toHaveValue(LINK);
    expect(copy()).toBeInTheDocument();
  });

  it("right after a no-e-mail request: the action's link shows at once and focus lands on doc.link.h", async () => {
    render(<Screen link={undefined} requested={{ link: FRESH }} />);
    await nextFrame();
    expect(input()).toHaveValue(FRESH);
    expect(heading()).toHaveFocus();
  });

  it("the server's link wins once the case re-renders with one", async () => {
    const { rerender } = render(
      <Screen link={undefined} requested={{ link: FRESH }} />,
    );
    await act(async () => undefined);
    rerender(<Screen link={LINK} requested={{ link: FRESH }} />);
    expect(input()).toHaveValue(LINK);
  });

  it("F8: a request whose link was dropped (no link anywhere): no panel", async () => {
    render(<Screen link={undefined} requested={{ link: undefined }} />);
    await act(async () => undefined);
    expect(heading()).toBeNull();
  });

  it("F9: the input is readOnly, autoComplete off, spellCheck false, autoCorrect off; the link is no href, title or aria-label", () => {
    const { container } = render(<Screen link={LINK} />);
    expect(input()).toHaveAttribute("readOnly");
    expect(input()).toHaveAttribute("autoComplete", "off");
    expect(input()).toHaveAttribute("spellCheck", "false");
    expect(input()).toHaveAttribute("autoCorrect", "off");
    for (const attribute of ["href", "title", "aria-label"])
      for (const element of container.querySelectorAll(`[${attribute}]`))
        expect(element.getAttribute(attribute)).not.toContain(LINK);
  });

  it("Copiar link: writes the link to the clipboard (only on click) and toasts toast.link_copied without the link", async () => {
    writeText.mockResolvedValueOnce(undefined);
    render(<Screen link={LINK} />);
    expect(writeText).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(copy()));
    expect(writeText).toHaveBeenCalledWith(LINK);
    expect(toastText()).toBe("Link copiado");
    expect(readText).not.toHaveBeenCalled();
  });

  it("a clipboard rejection: copy.error (role=alert) and the whole link selected", async () => {
    writeText.mockRejectedValueOnce(new Error("NotAllowedError"));
    render(<Screen link={LINK} />);
    await act(async () => fireEvent.click(copy()));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não conseguimos copiar. Selecione o link e copie manualmente.",
    );
    expect(input()).toHaveFocus();
    expect(input().selectionStart).toBe(0);
    expect(input().selectionEnd).toBe(LINK.length);
    expect(toastText()).toBe("");
  });

  it("no clipboard API at all: the same copy.error path", async () => {
    // @ts-expect-error: the test's own property.
    delete navigator.clipboard;
    render(<Screen link={LINK} />);
    await act(async () => fireEvent.click(copy()));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não conseguimos copiar.",
    );
  });

  it("a later success clears copy.error", async () => {
    writeText.mockRejectedValueOnce(new Error("x"));
    writeText.mockResolvedValueOnce(undefined);
    render(<Screen link={LINK} />);
    await act(async () => fireEvent.click(copy()));
    await act(async () => fireEvent.click(copy()));
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });
});
