export interface JobEnvelope<TPayload = unknown> {
  jobRunId: string;
  organizationId: string;
  payload: TPayload;
}
