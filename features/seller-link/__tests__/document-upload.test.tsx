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

function apiError(status: number, code: string): Response {
  return new Response(
    JSON.stringify({ code, message: "MSG-BACKEND-NAO-EXIBIR" }),
    { status, headers: { "content-type": "application/json" } },
  );
}

const MB = 1024 * 1024;
const bigPhoto = (name: string, megabytes: number): File =>
  new File([new Uint8Array(megabytes * MB)], name, { type: "image/png" });

describe("DocumentUpload: errors (T31, AC 22)", () => {
  // The picker's `accept` is a hint only: some pickers let any file through.
  const setup = () => userEvent.setup({ applyAccept: false });

  it.each([
    [
      "over 10 MB in total",
      () => [bigPhoto("a.png", 6), bigPhoto("b.png", 5)],
      "Passou do limite de envio. Envie um PDF menor ou menos fotos.",
    ],
    [
      "another format",
      () => [
        new File(["x"], "planilha.xlsx", { type: "application/vnd.ms-excel" }),
      ],
      "Formato não aceito. Envie PDF, JPG ou PNG.",
    ],
    [
      "a PDF with photos",
      () => [pdf(), photo("p1.jpg")],
      "Cada documento aceita um único PDF ou só fotos. Escolha de novo.",
    ],
    [
      "two PDFs",
      () => [pdf("a.pdf"), pdf("b.pdf")],
      "Cada documento aceita um único PDF ou só fotos. Escolha de novo.",
    ],
  ])(
    "%s: the client check shows its copy and uploads nothing",
    async (_case, files, copy) => {
      const user = setup();
      const { container } = renderUpload();

      await user.upload(fileInput(container), files());

      const error = await screen.findByText(copy);
      expect(error.closest('[role="status"]')).not.toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(
        screen.getByRole("button", { name: "Enviar documento" }),
      ).toBeInTheDocument();
    },
  );

  it("a PDF added to photos already received is mixed, and the photos stay", async () => {
    const user = setup();
    const { container } = renderUpload(2);

    await user.upload(fileInput(container), pdf());

    expect(
      await screen.findByText(
        "Cada documento aceita um único PDF ou só fotos. Escolha de novo.",
      ),
    ).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Adicionar página" }),
    ).toBeInTheDocument();
  });

  it("the size limit counts what this page already sent for the document", async () => {
    const user = setup();
    fetchSpy.mockResolvedValueOnce(created(1));
    const { container } = renderUpload();

    await user.upload(fileInput(container), bigPhoto("a.png", 6));
    await screen.findByText("Recebido: 1 arquivo");
    await user.upload(fileInput(container), bigPhoto("b.png", 5));

    expect(
      await screen.findByText(
        "Passou do limite de envio. Envie um PDF menor ou menos fotos.",
      ),
    ).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      413,
      "ARQUIVO_GRANDE",
      "Passou do limite de envio. Envie um PDF menor ou menos fotos.",
    ],
    [
      413,
      "LIMITE_ARQUIVOS",
      "Passou do limite de envio. Envie um PDF menor ou menos fotos.",
    ],
    [415, "FORMATO_INVALIDO", "Formato não aceito. Envie PDF, JPG ou PNG."],
    [
      429,
      "LIMITE_TENTATIVAS",
      "Não conseguimos enviar o documento. Tente de novo.",
    ],
    [500, "ERRO_INTERNO", "Não conseguimos enviar o documento. Tente de novo."],
  ])(
    "API %i %s shows its copy, never the backend's message",
    async (status, code, copy) => {
      const user = setup();
      fetchSpy.mockResolvedValue(apiError(status, code));
      const { container } = renderUpload();

      await user.upload(fileInput(container), pdf());

      expect(await screen.findByText(copy)).toBeInTheDocument();
      expect(container).not.toHaveTextContent("MSG-BACKEND-NAO-EXIBIR");
      expect(router.refresh).not.toHaveBeenCalled();
    },
  );

  it("an API 415 on an added page means mixing (the earlier file may be a PDF)", async () => {
    const user = setup();
    fetchSpy.mockResolvedValue(apiError(415, "FORMATO_INVALIDO"));
    const { container } = renderUpload(1);

    await user.upload(fileInput(container), photo("p2.jpg"));

    expect(
      await screen.findByText(
        "Cada documento aceita um único PDF ou só fotos. Escolha de novo.",
      ),
    ).toBeInTheDocument();
  });

  it("409: upload.error.closed, and the button goes away", async () => {
    const user = setup();
    fetchSpy.mockResolvedValue(apiError(409, "CASO_DECIDIDO"));
    const { container } = renderUpload();

    await user.upload(fileInput(container), pdf());

    expect(
      await screen.findByText(
        "Este cadastro já foi decidido. Não é mais preciso enviar documentos.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offline: upload.error.network, and tapping again resends the same selection without the picker", async () => {
    const user = setup();
    fetchSpy
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(created(2));
    const { container } = renderUpload();
    const picker = vi.spyOn(fileInput(container), "click");

    await user.upload(fileInput(container), [photo("p1.jpg"), photo("p2.jpg")]);
    expect(
      await screen.findByText(
        "Não conseguimos enviar o documento. Tente de novo.",
      ),
    ).toBeInTheDocument();
    picker.mockClear();

    await user.click(screen.getByRole("button", { name: "Enviar documento" }));

    expect(picker).not.toHaveBeenCalled();
    expect(await screen.findByText("Recebido: 2 arquivos")).toBeInTheDocument();
    const resent = fetchSpy.mock.calls[1]?.[1]?.body as FormData;
    expect(
      resent.getAll("arquivos").map((file) => (file as File).name),
    ).toEqual(["p1.jpg", "p2.jpg"]);
  });

  it("an unknown case (404) refreshes to Case not found", async () => {
    const user = setup();
    fetchSpy.mockResolvedValue(apiError(404, "CASO_NAO_ENCONTRADO"));
    const { container } = renderUpload();

    await user.upload(fileInput(container), pdf());

    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
  });
});
