// Seller-link feature types shared by components and the Server Actions
// (frontend-architecture-conventions.md § App Router Layout).

/** The company block's projection: never a street address (U-E, spec v3). */
export type CompanySummary = {
  razaoSocial: string;
  atividade: string;
  municipio: string;
  uf: string;
};

export type CompanyBlockState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "found"; company: CompanySummary }
  | { status: "not_found" }
  | { status: "failed" };
