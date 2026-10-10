import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const expire = vi.hoisted(() => vi.fn());
vi.mock("@/features/panel-shell/use-session-expiry", () => ({
  useSessionExpiry: () => expire,
}));

import { ProofDownload } from "@/features/panel-fila/components/proof-download";
import { proofFilename } from "@/features/panel-fila/proof-filename";

const CASE = "caso_0000000000000001";

const fetchMock = vi.fn();
const clicked: { href: string; download: string }[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  clicked.length = 0;
  vi.stubGlobal("fetch", fetchMock);
  URL.createObjectURL = vi.fn(() => "blob:kybr/prova");
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

describe("proofFilename (AC 42, P08)", () => {
  it("kybr-comprovante-<yyyy-mm-dd>.pdf by the São Paulo date", () => {
    // 23:30 in São Paulo on the 5th: already the 6th in UTC.
    expect(proofFilename(new Date("2026-10-06T02:30:00Z"))).toBe(
      "kybr-comprovante-2026-10-05.pdf",
    );
  });
});

describe("ProofDownload (AC 42, G14, F12)", () => {
  it("fetches the case's proof route without following redirects, saves it under the dated name and revokes the blob URL", async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "Date"],
      now: new Date("2026-10-06T02:30:00Z"),
    });
    fetchMock.mockResolvedValue(
      new Response(new TextEncoder().encode("%PDF-"), {
        status: 200,
        headers: { "Content-Type": "application/pdf" },
      }),
    );
    render(<ProofDownload href={`/fila/${CASE}/comprovante`} />);
    fireEvent.click(screen.getByRole("button", { name: "Baixar comprovante" }));
    await vi.waitFor(() => expect(clicked).toHaveLength(1));
    expect(fetchMock).toHaveBeenCalledWith(
      `/fila/${CASE}/comprovante`,
      expect.objectContaining({ redirect: "manual" }),
    );
    expect(clicked[0]).toEqual({
      href: "blob:kybr/prova",
      download: "kybr-comprovante-2026-10-05.pdf",
    });
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:kybr/prova");
  });

  it("busy while fetching, the label unchanged, presses ignored", async () => {
    let resolve: (value: Response) => void = () => undefined;
    fetchMock.mockReturnValue(
      new Promise<Response>((r) => {
        resolve = r;
      }),
    );
    render(<ProofDownload href={`/fila/${CASE}/comprovante`} />);
    const button = screen.getByRole("button", { name: "Baixar comprovante" });
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAccessibleName("Baixar comprovante");
    fireEvent.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolve(new Response(null, { status: 502 }));
    await waitFor(() => expect(button).not.toHaveAttribute("aria-busy"));
  });

  it.each([404, 502])(
    "a %i → fila.proof.error next to the button (alert), nothing saved",
    async (status) => {
      fetchMock.mockResolvedValue(new Response(null, { status }));
      render(<ProofDownload href={`/fila/${CASE}/comprovante`} />);
      fireEvent.click(
        screen.getByRole("button", { name: "Baixar comprovante" }),
      );
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(
        "Não conseguimos baixar o comprovante. Tente de novo.",
      );
      // DDR-0003 pt 4: red text is for form-field errors and form alerts only.
      expect(alert).toHaveClass("text-ink");
      expect(alert).not.toHaveClass("text-danger-ink");
      expect(clicked).toEqual([]);
    },
  );

  it("a network failure → fila.proof.error", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    render(<ProofDownload href={`/fila/${CASE}/comprovante`} />);
    fireEvent.click(screen.getByRole("button", { name: "Baixar comprovante" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("an opaque redirect is the session ending", async () => {
    fetchMock.mockResolvedValue({ type: "opaqueredirect", ok: false });
    render(<ProofDownload href={`/fila/${CASE}/comprovante`} />);
    fireEvent.click(screen.getByRole("button", { name: "Baixar comprovante" }));
    await waitFor(() => expect(expire).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
