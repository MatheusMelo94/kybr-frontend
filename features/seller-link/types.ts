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

/**
 * What the case page shows (plan § 4). The only case data that crosses into a
 * client component: the raw resultado never does.
 */
export type CaseViewKey =
  | "verifying"
  | "analysis-timeout"
  | "analysis-notfound"
  | "approved"
  | "pending"
  | "blocked";

export type CaseView = {
  viewKey: CaseViewKey;
  /** The step indicator: 2 while verifying or in analysis, 3 on a result. */
  step: 2 | 3;
  /** Time left until verifying switches to analysis-timeout; never negative. */
  msUntilTimeout: number;
};
