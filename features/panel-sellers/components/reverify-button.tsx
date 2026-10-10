"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type JSX } from "react";

import { Dialog } from "@/components/panel/dialog";
import { FormAlert } from "@/components/panel/form-alert";
import { useToast } from "@/components/panel/toast";
import { Button } from "@/components/ui/button";
import { callAction } from "@/features/panel-fila/call-action";
import { reverifyAction } from "@/features/panel-sellers/actions";
import { useReverifyKey } from "@/features/panel-sellers/components/sellers-provider";
import { sellersCopy } from "@/features/panel-sellers/copy";
import { globalCopy } from "@/features/panel-shell/copy/global";
import { shellCopy } from "@/features/panel-shell/copy/shell";
import { fill } from "@/features/panel-shell/format";
import { useSessionExpiry } from "@/features/panel-shell/use-session-expiry";
import { useNavigationGuard } from "@/lib/navigation/navigation-guard";
import { useRefreshUntil } from "@/lib/navigation/refresh-until";

type Props = {
  sellerId: string;
  razaoSocial: string | null;
  /** Masked by the data layer (O-F4); the name when there's no razão social (G3). */
  cnpj: string;
  /** The server's reverificacao_pendente. */
  pending?: boolean | undefined;
  /** The allowance is used up or none was granted: disabled, described by plan.exhausted. */
  exhausted?: { describedBy: string } | undefined;
};

/**
 * Reverificar (AC 56, plan-m8 D6): it spends a credit, so a Dialog confirms
 * it first (Q2); the credit line is display-only (O-F7). The call carries
 * the seller's intent key from SellersProvider: ok, SEM_SALDO and a 409 spend
 * it; NETWORK and UNAVAILABLE keep it for the retry (M6C-01). ok and a 409
 * show sellers.reverify.pending until the server's flag takes over; there's
 * no poll (Q4).
 */
export function ReverifyButton({
  sellerId,
  razaoSocial,
  cnpj,
  pending = false,
  exhausted,
}: Props): JSX.Element {
  const { key, drop } = useReverifyKey(sellerId);
  const { show } = useToast();
  const router = useRouter();
  const arm = useNavigationGuard();
  const expire = useSessionExpiry();
  const refreshUntil = useRefreshUntil(() => pending);
  const [open, setOpen] = useState(false);
  // Mounted on the first open and kept (Dialog returns focus on close): a
  // page of 50 rows doesn't carry 50 closed dialogs.
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [requested, setRequested] = useState(false);
  const [failure, setFailure] = useState<"network" | "exhausted" | null>(null);
  const name = razaoSocial ?? cnpj;

  function close(): void {
    setOpen(false);
    setFailure(null);
  }

  function markPending(here: boolean): void {
    close();
    setRequested(true);
    if (here) refreshUntil();
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;
    const guard = arm();
    setBusy(true);
    setFailure(null);
    const result = await callAction(reverifyAction, {
      sellerId,
      idempotencyKey: key,
    });
    setBusy(false);
    const here = guard.stillHere();
    if (result.ok) {
      drop();
      show(fill(sellersCopy["toast.reverify"], { razao_social: name }));
      markPending(here);
      return;
    }
    switch (result.code) {
      case "SESSAO_EXPIRADA":
        expire();
        return;
      case "REVERIFICACAO_EM_ANDAMENTO":
        drop();
        markPending(here);
        return;
      case "SEM_SALDO":
        drop();
        setFailure("exhausted");
        // The shell's plan usage then disables every Reverificar.
        if (here) router.refresh();
        return;
      case "NETWORK":
      case "UNAVAILABLE":
        // Unknown outcome: the key is kept and the list re-read, so an
        // applied reverify shows as pending instead of a second credit.
        setFailure("network");
        if (here) router.refresh();
        return;
      default:
        drop();
        setFailure("network");
    }
  }

  if (pending || requested)
    return (
      <span className="text-secondary text-ink-muted">
        {sellersCopy["sellers.reverify.pending"]}
      </span>
    );

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="panel"
        disabled={exhausted !== undefined}
        aria-describedby={exhausted?.describedBy}
        onClick={() => {
          setOpened(true);
          setOpen(true);
        }}
      >
        {sellersCopy["sellers.reverify"]}
      </Button>
      {opened && (
        <Dialog
          open={open}
          onClose={close}
          title={fill(sellersCopy["sellers.reverify.h"], {
            razao_social: name,
          })}
          closeLabel={globalCopy["common.close"]}
          busy={busy}
        >
          <form noValidate onSubmit={submit} className="flex flex-col gap-6">
            <p className="text-body text-ink">
              {sellersCopy["sellers.reverify.body"]}
            </p>
            <FormAlert>
              {failure === "network" && globalCopy["error.network"]}
              {failure === "exhausted" && shellCopy["plan.exhausted"]}
            </FormAlert>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="panel"
                disabled={busy}
                onClick={close}
              >
                {globalCopy["common.cancel"]}
              </Button>
              <Button type="submit" size="panel" busy={busy}>
                {sellersCopy["sellers.reverify.submit"]}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
