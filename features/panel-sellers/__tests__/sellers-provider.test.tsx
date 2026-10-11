import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  SellersProvider,
  useReverifyKey,
} from "@/features/panel-sellers/components/sellers-provider";

// T140 (plan-m8 D6, QA Q5): one reverify intent key per seller, kept by the
// layout across the list and the detail (a re-read can't lose it).

const A = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const B = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";

let api: ReturnType<typeof useReverifyKey> | undefined;
function Probe({ id }: { id: string }) {
  api = useReverifyKey(id);
  return <span data-testid={id}>{api.key}</span>;
}

describe("SellersProvider", () => {
  it("one stable key per seller until it is dropped", () => {
    const { rerender } = render(
      <SellersProvider>
        <Probe id={A} />
        <Probe id={B} />
      </SellersProvider>,
    );
    const first = screen.getByTestId(A).textContent;
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(screen.getByTestId(B).textContent).not.toBe(first);
    rerender(
      <SellersProvider>
        <Probe id={A} />
        <Probe id={B} />
      </SellersProvider>,
    );
    expect(screen.getByTestId(A).textContent).toBe(first);
  });

  it("drop() gives the seller a fresh key", () => {
    render(
      <SellersProvider>
        <Probe id={A} />
      </SellersProvider>,
    );
    const first = screen.getByTestId(A).textContent;
    act(() => api?.drop());
    expect(screen.getByTestId(A).textContent).not.toBe(first);
  });
});
