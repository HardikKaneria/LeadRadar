import {
  parseLeadHuntingArchiveOutput,
  parseLeadHuntingClassifierOutput,
  parseLeadHuntingScoreOutput,
} from './lead-hunting';

describe('lead-hunting AI parsers', () => {
  it('parses the classifier output into a strict structured shape', () => {
    expect(
      parseLeadHuntingClassifierOutput({
        classification: 'actual_requirement',
        isActualLead: true,
        urgency: 'urgent',
        serviceMatch: [
          { service: 'Web Development', confidence: 0.92, isPriority: true, reason: 'Explicit website rebuild ask' },
        ],
        reasons: ['Explicit requirement in post text'],
        recommendedAction: 'Move this into the review queue immediately.',
        summary: 'The author is actively looking for an agency to rebuild the company website.',
      }),
    ).toEqual({
      classification: 'actual_requirement',
      isActualLead: true,
      urgency: 'urgent',
      serviceMatch: [
        { service: 'Web Development', confidence: 0.92, isPriority: true, reason: 'Explicit website rebuild ask' },
      ],
      reasons: ['Explicit requirement in post text'],
      recommendedAction: 'Move this into the review queue immediately.',
      summary: 'The author is actively looking for an agency to rebuild the company website.',
    });
  });

  it('clamps score output and preserves compact reasons', () => {
    expect(
      parseLeadHuntingScoreOutput({
        leadScore: 121,
        leadQuality: 'very_high',
        reasons: ['Specific ask', 'Target-service fit'],
      }),
    ).toEqual({
      leadScore: 100,
      leadQuality: 'very_high',
      reasons: ['Specific ask', 'Target-service fit'],
    });
  });

  it('requires archive summaries and reasons', () => {
    expect(() =>
      parseLeadHuntingArchiveOutput({
        archiveCategory: 'market_insight',
        topic: 'Hiring trend',
        keywords: ['hiring'],
        marketSignalScore: 63,
      }),
    ).toThrow('summary');
  });
});
