import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const expire = vi.hoisted(() => vi.fn());
vi.mock("@/features/panel-shell/use-session-expiry", () => ({
  useSessionExpiry: () => expire,
}));

import { DocumentList } from "@/features/panel-fila/components/document-list";
import { documentFilename } from "@/features/panel-fila/document-file";

const CASE = "caso_0000000000000001";
const DOC = "doc_00000000000000001";
const DOCS = [
  { id: DOC, tipo: "CARTAO_CNPJ", enviadoEm: "2026-10-05T13:37:00Z" },
] as const;

const fetchMock = vi.fn();
const clicked: { href: string; download: string }[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  clicked.length = 0;
  vi.stubGlobal("fetch", fetchMock);
  URL.createObjectURL = vi.fn(() => "blob:kybr/doc");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push({ href: this.href, download: this.download });
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderAttachment() {
  return render(
    <DocumentList caseId={CASE} documentos={DOCS} mode="attachment" />,
  );
}

describe("documentFilename (F4)", () => {
  it("documento-<tipo>.<ext>, the type in lower-case kebab", () => {
    expect(documentFilename("CONTRATO_SOCIAL_OU_CCMEI", "pdf")).toBe(
      "documento-contrato-social-ou-ccmei.pdf",
    );
  });
});

describe("DocumentList in attachment mode (Q19, F4)", () => {
  it("Baixar is a button: no link, no new tab, no new-tab suffix", () => {
    renderAttachment();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Baixar" })).toBeInTheDocument();
    expect(screen.queryByText(/abre em outra aba/)).not.toBeInTheDocument();
  });

  it("fetches the panel's document route without following redirects, saves the blob under the server-built name and revokes it", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    fetchMock.mockResolvedValue(
      new Response(new Blob(["%PDF-"]), {
        status: 200,
        headers: { "Content-Type": "application/pdf" },
      }),
    );
    renderAttachment();
    fireEvent.click(screen.getByRole("button", { name: "Baixar" }));
    await vi.waitFor(() => expect(clicked).toHaveLength(1));
    expect(fetchMock).toHaveBeenCalledWith(
      `/fila/${CASE}/documentos/${DOC}`,
      expect.objectContaining({ redirect: "manual", cache: "no-store" }),
    );
    expect(clicked[0]).toEqual({
      href: "blob:kybr/doc",
      download: "documento-cartao-cnpj.pdf",
    });
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:kybr/doc");
  });

  it("is busy while fetching, with its label unchanged", async () => {
    let resolve: (value: Response) => void = () => undefined;
    fetchMock.mockReturnValue(
      new Promise<Response>((r) => {
        resolve = r;
      }),
    );
    renderAttachment();
    const button = screen.getByRole("button", { name: "Baixar" });
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-busy", "true");
    fireEvent.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolve(new Response(null, { status: 502 }));
    await waitFor(() => expect(button).not.toHaveAttribute("aria-busy"));
  });

  it("a 502 → export.error inline as an alert, nothing saved", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 502 }));
    renderAttachment();
    fireEvent.click(screen.getByRole("button", { name: "Baixar" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Não conseguimos gerar o arquivo. Tente de novo.",
    );
    // DDR-0003 pt 4: red text is for form-field errors and form alerts only.
    expect(alert).toHaveClass("text-ink");
    expect(alert).not.toHaveClass("text-danger-ink");
    expect(clicked).toEqual([]);
  });

  it("a type the handler never sends → export.error, nothing saved", async () => {
    fetchMock.mockResolvedValue(
      new Response("<html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );
    renderAttachment();
    fireEvent.click(screen.getByRole("button", { name: "Baixar" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(clicked).toEqual([]);
  });

  it("an opaque redirect is the session ending", async () => {
    fetchMock.mockResolvedValue({ type: "opaqueredirect", ok: false });
    renderAttachment();
    fireEvent.click(screen.getByRole("button", { name: "Baixar" }));
    await waitFor(() => expect(expire).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
