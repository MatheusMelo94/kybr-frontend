import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

import { DocumentUpload } from "@/features/seller-link/components/case/document-upload";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const UPLOAD_URL =
  "https://api.kybr.test/public/v/loja-exemplo/cases/tokpendente0000000000000/documents";
const TITLE = "Contrato social ou procuração";

const pdf = (name = "contrato.pdf"): File =>
  new File(["%PDF-1.4 synthetic"], name, { type: "application/pdf" });
const photo = (name: string): File =>
  new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], name, {
    type: "image/jpeg",
  });

function created(documentosEnviados: number): Response {
  return new Response(
    JSON.stringify({
      tipo: "RESPONSAVEL",
      documentos_enviados: documentosEnviados,
    }),
    { status: 201, headers: { "content-type": "application/json" } },
  );
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function renderUpload(enviados = 0) {
  return render(
    <>
      <h2 id="item-title">{TITLE}</h2>
      <DocumentUpload
        uploadUrl={UPLOAD_URL}
        tipo="RESPONSAVEL"
        enviados={enviados}
        describedBy="item-title"
      />
    </>,
  );
}

function fileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("no file input");
  return input;
}

let fetchSpy: MockInstance<typeof fetch>;

beforeEach(() => {
  router.refresh.mockReset();
  fetchSpy = vi.spyOn(globalThis, "fetch");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DocumentUpload: happy path (T30, AC 21)", () => {
  it("idle: upload.cta, described by the item title and upload.hint; a hidden picker for PDF/JPEG/PNG with no capture", () => {
    const { container } = renderUpload();

    const button = screen.getByRole("button", { name: "Enviar documento" });
    expect(button).toHaveAccessibleDescription(
      `${TITLE} PDF ou fotos, até 10 MB no total.`,
    );
    const input = fileInput(container);
    expect(input).toHaveAttribute(
      "accept",
      "application/pdf,image/jpeg,image/png",
    );
    expect(input).toHaveAttribute("multiple");
    expect(input).not.toHaveAttribute("capture");
    expect(input).not.toBeVisible();
  });

  it("the button opens the phone's picker", async () => {
    const user = userEvent.setup();
    const { container } = renderUpload();
    const click = vi.spyOn(fileInput(container), "click");

    await user.click(screen.getByRole("button", { name: "Enviar documento" }));

    expect(click).toHaveBeenCalledTimes(1);
  });

  it("one PDF: multipart POST straight to the API, busy keeps the button, then upload.received.one, announced, no upload.add, and a refresh", async () => {
    const user = userEvent.setup();
    const response = deferred<Response>();
    fetchSpy.mockReturnValue(response.promise);
    const { container } = renderUpload();

    await user.upload(fileInput(container), pdf());

    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe(UPLOAD_URL);
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("omit");
    const body = init?.body as FormData;
    expect(body.get("tipo")).toBe("RESPONSAVEL");
    expect(body.getAll("arquivos")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Enviando…" })).toHaveAttribute(
      "aria-busy",
      "true",
    );

    response.resolve(created(1));
    const received = await screen.findByText("Recebido: 1 arquivo");
    expect(received.closest('[role="status"]')).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: "Adicionar página" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Enviar documento" }),
    ).toBeNull();
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("several photos: upload.received.many and upload.add; adding a page sends only the new photo", async () => {
    const user = userEvent.setup();
    fetchSpy
      .mockResolvedValueOnce(created(2))
      .mockResolvedValueOnce(created(3));
    const { container } = renderUpload();

    await user.upload(fileInput(container), [photo("p1.jpg"), photo("p2.jpg")]);
    expect(await screen.findByText("Recebido: 2 arquivos")).toBeInTheDocument();
    const add = screen.getByRole("button", { name: "Adicionar página" });
    expect(add).toHaveAccessibleDescription(TITLE);

    await user.upload(fileInput(container), photo("p3.jpg"));
    expect(await screen.findByText("Recebido: 3 arquivos")).toBeInTheDocument();
    const second = fetchSpy.mock.calls[1]?.[1]?.body as FormData;
    expect(second.getAll("arquivos")).toHaveLength(1);
  });

  it("on reload, files already received show their count and upload.add", () => {
    renderUpload(2);

    expect(screen.getByText("Recebido: 2 arquivos")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Adicionar página" }),
    ).toBeInTheDocument();
  });

  it("a newer count from the server (after the refresh) wins over the local one", async () => {
    const { rerender } = renderUpload(1);

    rerender(
      <>
        <h2 id="item-title">{TITLE}</h2>
        <DocumentUpload
          uploadUrl={UPLOAD_URL}
          tipo="RESPONSAVEL"
          enviados={4}
          describedBy="item-title"
        />
      </>,
    );

    await waitFor(() =>
      expect(screen.getByText("Recebido: 4 arquivos")).toBeInTheDocument(),
    );
  });
});
