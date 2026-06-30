export * from './enums';
export * from './permissions';
export * from './knowledge';
export * from './dto';
export * from './notifications';
export * from './forecast';
export * from './integrations';
export * from './billing';
export * from './lead-hunting';
// Re-export new P10-14 cost intelligence symbols (already exported via lead-hunting wildcard, listed here for discoverability)
// EXTERNAL_COST_RULE_SCOPES, ExternalCostRuleScope, EXTERNAL_BILLING_EVENTS, ExternalBillingEvent,
// EXTERNAL_COST_SOURCES, ExternalCostSource, EXTERNAL_ROUTE_BEHAVIOR_MODES, ExternalRouteBehaviorMode,
// EXTERNAL_COST_ADJUSTMENT_TYPES, ExternalCostAdjustmentType, ExternalCostBreakdown,
// ExternalCostRuleAdminDto, ExternalOptionMultiplierAdminDto, ExternalEndpointCatalogAdminDto,
// ExternalCostAdjustmentAdminDto, ExternalCostSimulatorInput, ExternalCostSimulatorResult

/** Queue names — producers (api) and consumers (worker) share these. */
export const QUEUES = {
  demo: 'demo',
  ingestManual: 'ingest-manual',
  analyzeDiscovery: 'analyze-discovery',
  generateEmbedding: 'generate-embedding',
  researchCompany: 'research-company',
  generateProposal: 'generate-proposal',
  importCsv: 'import-csv',
  processExtensionBatch: 'process-extension-batch',
  researchRawPost: 'research-raw-post',
  buildDigest: 'build-digest',
  recomputeScoring: 'recompute-scoring',
  recomputeHeat: 'recompute-heat',
  generateWeeklyInsight: 'generate-weekly-insight',
  generateOpportunityEmbedding: 'generate-opportunity-embedding',
  resurrectLeads: 'resurrect-leads',
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
