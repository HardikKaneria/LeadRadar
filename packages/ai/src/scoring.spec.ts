import {
  buildHeuristicScoringStrategy,
  DEFAULT_HEURISTIC_SCORING_WEIGHTS,
  normalizeHeuristicScoringWeights,
} from './scoring';

describe('normalizeHeuristicScoringWeights', () => {
  it('merges partial nested weights with the defaults', () => {
    expect(
      normalizeHeuristicScoringWeights({
        serviceMatch: 40,
        budgetFit: { below_min: -20 },
      }),
    ).toEqual({
      ...DEFAULT_HEURISTIC_SCORING_WEIGHTS,
      serviceMatch: 40,
      budgetFit: {
        ...DEFAULT_HEURISTIC_SCORING_WEIGHTS.budgetFit,
        below_min: -20,
      },
    });
  });
});

describe('buildHeuristicScoringStrategy', () => {
  it('scores an ideal opportunity at the top of the range', () => {
    const scorer = buildHeuristicScoringStrategy();

    const result = scorer.score({
      serviceMatches: [
        { service: 'WooCommerce', confidence: 1, isPriority: true },
        { service: 'Shopify', confidence: 0.6, isPriority: false },
      ],
      countryMatch: true,
      budgetFit: 'above_min',
      intent: 'high',
      urgency: 'urgent',
    });

    expect(result.score).toBe(90); // 100 - 10 (missing similarityToWon)
    expect(result.reason).toContain('High-intent');
    expect(result.reason).toContain('Priority service fit');
  });

  it('clips weak opportunities at zero and explains the negatives', () => {
    const scorer = buildHeuristicScoringStrategy();

    const result = scorer.score({
      serviceMatches: [],
      countryMatch: false,
      budgetFit: 'below_min',
      intent: 'low',
      urgency: 'none',
    });

    expect(result.score).toBe(0);
    expect(result.reason).toContain('Budget appears below the company minimum');
  });

  it('scales service factors by confidence instead of treating matches as binary', () => {
    const scorer = buildHeuristicScoringStrategy();

    const result = scorer.score({
      serviceMatches: [{ service: 'Webflow', confidence: 0.4, isPriority: true }],
      countryMatch: null,
      budgetFit: 'unknown',
      intent: 'medium',
      urgency: 'later',
    });

    const serviceFactor = result.factors.find((factor) => factor.key === 'service_match');
    const priorityFactor = result.factors.find((factor) => factor.key === 'priority_service_match');

    expect(serviceFactor?.contribution).toBe(8); // 20 * 0.4
    expect(priorityFactor?.contribution).toBe(6); // 15 * 0.4
    expect(result.score).toBe(27); // 8 + 6 + 13 (country+budget+intent+urgency defaults to 13 here)
  });
});
