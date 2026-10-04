"use client";

import { useRouter } from "next/navigation";
import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type JSX,
} from "react";

import { Button } from "@/components/ui/button";
import { LiveRegion } from "@/components/ui/live-region";
import { TextField } from "@/components/ui/text-field";
import {
  saveContactEmail,
  type SaveContactEmailResult,
} from "@/features/seller-link/actions";
import { emailCopy } from "@/features/seller-link/copy/email";
import { fill } from "@/features/seller-link/format";
import { contactEmailSchema } from "@/features/seller-link/schemas";

type BlockError = "empty" | "invalid" | "network";

const ERROR_COPY: Record<BlockError, string> = {
  empty: emailCopy["email.error.empty"],
  invalid: emailCopy["email.error.invalid"],
  network: emailCopy["email.error.network"],
};

type Props = {
  slug: string;
  token: string;
  /** D4's email_contato_mascarado: an address saved earlier, shown masked (AC 26). */
  maskedSaved?: string | undefined;
};

/**
 * The contact e-mail block on *quase lá* and *em análise* (DDR-0001; spec
 * § E-mail block). It never blocks the rest of the page: the result and the
 * uploads stay usable whether or not an address is saved (AC 24). Saving goes
 * through saveContactEmail with a wrapper that catches a network failure, so
 * it never reaches the error boundary. A case decided meanwhile, or gone,
 * refreshes the page to what the server says now (F06a).
 */
export function ContactEmailBlock({
  slug,
  token,
  maskedSaved,
}: Props): JSX.Element {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<BlockError | undefined>();
  // The address shown as saved: the masked one from D4, or the one typed here.
  const [saved, setSaved] = useState<string | undefined>(maskedSaved);
  const [editing, setEditing] = useState(maskedSaved === undefined);
  const input = useRef<HTMLInputElement>(null);
  const change = useRef<HTMLButtonElement>(null);
  // Where focus goes after the next render: never on mount (the h1 owns it).
  const focusNext = useRef<"input" | "change" | null>(null);

  useEffect(() => {
    if (focusNext.current === "input") input.current?.focus();
    if (focusNext.current === "change") change.current?.focus();
    focusNext.current = null;
  }, [editing, error]);

  function showError(next: BlockError): void {
    setError(next);
    if (next !== "network") focusNext.current = "input";
  }

  async function save(_previous: null, address: string): Promise<null> {
    let result: SaveContactEmailResult;
    try {
      result = await saveContactEmail({ slug, token, email: address });
    } catch {
      // The action couldn't be reached (offline): the value stays for a retry.
      showError("network");
      return null;
    }
    if (result.ok) {
      setSaved(address);
      setEditing(false);
      focusNext.current = "change";
      return null;
    }
    switch (result.code) {
      case "EMAIL_INVALIDO":
        showError(result.issue);
        return null;
      case "CASO_DECIDIDO":
      case "CASO_NAO_ENCONTRADO":
        router.refresh();
        return null;
      case "UNAVAILABLE":
        showError("network");
        return null;
    }
  }

  const [, dispatch, isPending] = useActionState(save, null);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (isPending) return;
    const parsed = contactEmailSchema.safeParse({ email });
    if (!parsed.success) {
      showError(
        parsed.error.issues[0]?.message === "empty" ? "empty" : "invalid",
      );
      return;
    }
    setError(undefined);
    startTransition(() => dispatch(parsed.data.email));
  }

  function reopen(): void {
    setEditing(true);
    focusNext.current = "input";
  }

  const fieldError =
    error === "empty" || error === "invalid" ? error : undefined;

  return (
    <div className="flex flex-col gap-3">
      {/* Always mounted, so "E-mail salvo" is announced when it appears. */}
      <LiveRegion className="text-body text-ink">
        {!editing && saved !== undefined
          ? fill(emailCopy["email.saved"], { email: saved })
          : ""}
      </LiveRegion>
      {editing ? (
        <form
          action={() => {}}
          onSubmit={submit}
          noValidate
          className="flex flex-col gap-3"
        >
          <TextField
            ref={input}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            label={emailCopy["email.label"]}
            hint={emailCopy["email.hint"]}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setError(undefined);
            }}
            {...(fieldError !== undefined && { error: ERROR_COPY[fieldError] })}
          />
          <LiveRegion
            politeness="alert"
            className="text-secondary text-danger-ink"
          >
            {error === "network" ? ERROR_COPY.network : ""}
          </LiveRegion>
          <Button
            type="submit"
            variant="secondary"
            busy={isPending}
            busyLabel={emailCopy["email.busy"]}
            className="self-start"
          >
            {emailCopy["email.submit"]}
          </Button>
        </form>
      ) : (
        <Button
          ref={change}
          variant="secondary"
          onClick={reopen}
          className="self-start"
        >
          {emailCopy["email.change"]}
        </Button>
      )}
    </div>
  );
}
