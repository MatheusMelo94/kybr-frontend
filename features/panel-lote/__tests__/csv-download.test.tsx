import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const expire = vi.hoisted(() => vi.fn());
vi.mock("@/features/panel-shell/use-session-expiry", () => ({
  useSessionExpiry: () => expire,
}));

import { CsvDownload } from "@/features/panel-lote/components/csv-download";
import { csvFilename } from "@/features/panel-lote/csv-filename";

const ID = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";
// 23:30 in São Paulo on the 5th: already the 6th in UTC.
const DONE = "2026-10-06T02:30:00Z";

const fetchMock = vi.fn();
const clicked: { href: string; download: string }[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  clicked.length = 0;
  vi.stubGlobal("fetch", fetchMock);
  URL.createObjectURL = vi.fn(() => "blob:kybr/1");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
    function (this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download });
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderDownload(kind: "result" | "errors" = "result") {
  return render(<CsvDownload batchId={ID} kind={kind} concluidoEm={DONE} />);
}

const deferred = () => {
  let resolve: (value: Response) => void = () => undefined;
  const promise = new Promise<Response>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

describe("csvFilename (Security C9)", () => {
  it("is built from the batch's end in São Paulo, never from a header", () => {
    expect(csvFilename("result", new Date(DONE))).toBe(
      "kybr-lote-2026-10-05-resultado.csv",
    );
    expect(csvFilename("errors", new Date(DONE))).toBe(
      "kybr-lote-2026-10-05-erros.csv",
    );
  });
});

describe("CsvDownload (AC 21, P08)", () => {
  it("Baixar resultado: busy while fetching (manual redirects, same origin), then a blob download with the constant name, revoked after", async () => {
    const pending = deferred();
    fetchMock.mockReturnValueOnce(pending.promise);
    renderDownload();
    const button = screen.getByRole("button", {
      name: "Baixar resultado (CSV)",
    });
    fireEvent.click(button);
    expect(fetchMock).toHaveBeenCalledWith(`/lote/${ID}/resultado.csv`, {
      redirect: "manual",
      credentials: "same-origin",
      cache: "no-store",
    });
    expect(button).toHaveAttribute("aria-busy", "true");
    fireEvent.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve(
        new Response("﻿\"CNPJ\"\r\n", {
          status: 200,
          headers: {
            "Content-Disposition": 'attachment; filename="evil.html"',
          },
        }),
      );
    });
    expect(clicked).toEqual([
      { href: "blob:kybr/1", download: "kybr-lote-2026-10-05-resultado.csv" },
    ]);
    await waitFor(() =>
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:kybr/1"),
    );
    expect(document.querySelector("a[download]")).toBeNull();
    expect(button).not.toHaveAttribute("aria-busy");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("Baixar erros fetches erros.csv", async () => {
    fetchMock.mockResolvedValueOnce(new Response("x", { status: 200 }));
    renderDownload("errors");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Baixar erros (CSV)" }));
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/lote/${ID}/erros.csv`);
    expect(clicked[0]?.download).toBe("kybr-lote-2026-10-05-erros.csv");
  });

  it("a non-2xx → export.error next to it (alert); the button stays usable and a retry clears it", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 502 }));
    renderDownload();
    const button = screen.getByRole("button", {
      name: "Baixar resultado (CSV)",
    });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não conseguimos gerar o arquivo. Tente de novo.",
    );
    expect(clicked).toEqual([]);
    expect(button).not.toHaveAttribute("aria-busy");

    fetchMock.mockResolvedValueOnce(new Response("x", { status: 200 }));
    await act(async () => {
      fireEvent.click(button);
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(clicked).toHaveLength(1);
  });

  it("a network failure → export.error", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderDownload();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Baixar resultado (CSV)" }),
      );
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não conseguimos gerar o arquivo.",
    );
  });

  it("an opaque redirect (the session ended) → the session-expiry path, no file, no error", async () => {
    fetchMock.mockResolvedValueOnce({
      type: "opaqueredirect",
      ok: false,
      status: 0,
    } as Response);
    renderDownload();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Baixar resultado (CSV)" }),
      );
    });
    expect(expire).toHaveBeenCalledTimes(1);
    expect(clicked).toEqual([]);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
