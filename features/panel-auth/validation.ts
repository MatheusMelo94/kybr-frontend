// The auth forms' field rules as plain functions, for the client leaves.
// The panel's client bundles never import zod: webpack keeps a shared
// module's used exports for every chunk that loads it, so a panel form's
// zod calls would grow the zod chunk the link's form loads (+11.7 kB on
// /v/[slug], ADR-0010). The Server Actions' zod schemas (schemas.ts) are
// built from these same rules, so there's still one source of truth.

/** U-P8: at least 12 characters, at most 128, no composition rules. */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const NAME_MAX_LENGTH = 120;
export const WORKSPACE_MAX_LENGTH = 80;
export const EMAIL_MAX_LENGTH = 254;

/** A plain e-mail address (the same pattern zod's z.email() uses). */
export const EMAIL_PATTERN =
  /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

export function isEmail(value: string): boolean {
  const email = value.trim();
  return email.length <= EMAIL_MAX_LENGTH && EMAIL_PATTERN.test(email);
}

export type SignupField = "nome" | "workspace" | "email" | "senha" | "aceite";
export const SIGNUP_FIELDS: readonly SignupField[] = [
  "nome",
  "workspace",
  "email",
  "senha",
  "aceite",
];

type SignupValues = {
  nome: string;
  workspace: string;
  email: string;
  senha: string;
  aceite: boolean;
};

/** The sign-up fields that break a rule, in form order. */
export function signupFieldIssues(values: SignupValues): SignupField[] {
  const nome = values.nome.trim();
  const workspace = values.workspace.trim();
  const broken: Record<SignupField, boolean> = {
    nome: nome.length === 0 || nome.length > NAME_MAX_LENGTH,
    workspace:
      workspace.length === 0 || workspace.length > WORKSPACE_MAX_LENGTH,
    email: !isEmail(values.email),
    senha:
      values.senha.length < PASSWORD_MIN_LENGTH ||
      values.senha.length > PASSWORD_MAX_LENGTH,
    aceite: !values.aceite,
  };
  return SIGNUP_FIELDS.filter((field) => broken[field]);
}
