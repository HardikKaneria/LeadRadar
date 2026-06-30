/** Stage-level win-probability used in the revenue forecast model. */
export interface StageForecastRow {
  stage: string;
  /** Weighted conversion probability for this stage (0–1). */
  conversionProbability: number;
  /** Number of active leads in this stage. */
  leadCount: number;
  /** Sum of deal values in this stage (null = unestimated). */
  totalValue: number | null;
  /** Expected revenue = Σ(prob × value) for leads with a value set. */
  weightedValue: number;
  /** Leads without a deal value (excluded from weighted calc). */
  unestimatedCount: number;
}

export interface RevenueForecastResult {
  /** Total expected revenue across all stages. */
  totalWeightedValue: number;
  /** Currency used by the majority of leads (or null if mixed/empty). */
  dominantCurrency: string | null;
  /** How many active leads were included in the calculation. */
  totalActiveLeads: number;
  /** How many had no deal value set. */
  totalUnestimated: number;
  /** Per-stage breakdown. */
  byStage: StageForecastRow[];
  /** ISO timestamp of when this was computed. */
  computedAt: string;
}
