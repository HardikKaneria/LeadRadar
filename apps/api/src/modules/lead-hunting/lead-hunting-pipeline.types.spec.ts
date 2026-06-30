import { determineLeadHuntingDecision, normalizeReportState } from './lead-hunting-pipeline.types';

describe('lead-hunting pipeline helpers', () => {
  it('routes spam and irrelevant posts to reject before score checks', () => {
    expect(
      determineLeadHuntingDecision({
        classification: 'spam',
        leadScore: 99,
        isActualLead: true,
      }),
    ).toBe('rejected');

    expect(
      determineLeadHuntingDecision({
        classification: 'irrelevant',
        leadScore: 70,
        isActualLead: true,
      }),
    ).toBe('rejected');
  });

  it('keeps plausible but lower-scoring leads in human review', () => {
    expect(
      determineLeadHuntingDecision({
        classification: 'service_needed',
        leadScore: 38,
        isActualLead: true,
      }),
    ).toBe('needs_review');
  });

  it('normalizes malformed report_json into the canonical empty state', () => {
    expect(normalizeReportState(null)).toEqual({
      schemaVersion: 1,
      stages: {},
    });
  });
});
