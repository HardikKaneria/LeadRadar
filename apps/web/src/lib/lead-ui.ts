import {
  DEFAULT_HOT_LEAD_THRESHOLD,
  type LeadScoringConfig,
  type LeadScoringRule,
  type LeadStatus,
} from '@leadradar/shared'

export const statusLabels: Record<LeadStatus, string> = {
  new: 'New',
  interested: 'Interested',
  applied: 'Applied',
  follow_up: 'Follow Up',
  won: 'Won',
  lost: 'Lost',
  ignored: 'Ignored',
}

export const statusColors: Record<LeadStatus, string> = {
  new: 'default',
  interested: 'processing',
  applied: 'cyan',
  follow_up: 'gold',
  won: 'success',
  lost: 'error',
  ignored: 'default',
}

export const scoringSettingsKeys = {
  hotLeadThreshold: 'hot_lead_threshold',
  scoringRules: 'lead_scoring_rules',
}

const currencyMap: Record<string, string> = {
  '$': 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '₹': 'INR',
}

export function formatLeadStatus(status: LeadStatus) {
  return statusLabels[status]
}

export function getScoreTagColor(score: number, threshold = DEFAULT_HOT_LEAD_THRESHOLD) {
  if (score >= threshold) {
    return 'error' // Red for Hot Lead
  }

  if (score >= 60) {
    return 'success' // Green for Good Fit
  }

  if (score >= 40) {
    return 'warning' // Orange/Yellow for Review
  }

  return 'default' // Gray for Low Priority
}

export function formatDateTime(value?: string | null) {
  if (!value) {
    return 'Not available'
  }

  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function formatBudget(
  budgetMin?: number | null,
  budgetMax?: number | null,
  currency?: string | null,
  budgetText?: string | null,
) {
  if (budgetMin || budgetMax) {
    const formatter = new Intl.NumberFormat('en-IN', {
      currency: currency ?? 'USD',
      maximumFractionDigits: 0,
      style: 'currency',
    })

    if (budgetMin && budgetMax && budgetMin !== budgetMax) {
      return `${formatter.format(budgetMin)} - ${formatter.format(budgetMax)}`
    }

    return formatter.format(budgetMax ?? budgetMin ?? 0)
  }

  return budgetText ?? 'Not provided'
}

export function parseBudgetText(text?: string | null) {
  if (!text) {
    return {
      budgetMax: null,
      budgetMin: null,
      currency: null,
    }
  }

  const currencyMatch = text.match(/[$€£₹]/)
  const currency = currencyMatch ? currencyMap[currencyMatch[0]] : null
  const numberMatches = Array.from(
    text.matchAll(/(\d+(?:[.,]\d+)?)\s*(k)?/gi),
  ).map((match) => {
    const parsed = Number(match[1].replace(/,/g, ''))

    if (!Number.isFinite(parsed)) {
      return null
    }

    return match[2] ? parsed * 1000 : parsed
  })
  const numbers = numberMatches.filter((value): value is number => value !== null)

  if (numbers.length === 0) {
    return {
      budgetMax: null,
      budgetMin: null,
      currency,
    }
  }

  if (numbers.length === 1) {
    return {
      budgetMax: numbers[0],
      budgetMin: numbers[0],
      currency,
    }
  }

  return {
    budgetMax: Math.max(numbers[0], numbers[1]),
    budgetMin: Math.min(numbers[0], numbers[1]),
    currency,
  }
}

export function sanitizeScoringRules(rules: LeadScoringRule[]) {
  return rules
    .map((rule) => ({
      keyword: rule.keyword.trim(),
      score: Number(rule.score),
    }))
    .filter((rule) => rule.keyword.length > 0 && Number.isFinite(rule.score))
}

export function parseHotLeadThreshold(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value)

    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return DEFAULT_HOT_LEAD_THRESHOLD
}

export function parseScoringRules(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((rule) => {
      if (
        !rule ||
        typeof rule !== 'object' ||
        !('keyword' in rule) ||
        !('score' in rule)
      ) {
        return null
      }

      return {
        keyword: String(rule.keyword),
        score: Number(rule.score),
      }
    })
    .filter((rule): rule is LeadScoringRule => rule !== null)
}

export function formatScoringConfigSummary(config: LeadScoringConfig) {
  return `${config.rules.length} active rules, hot threshold at ${config.hotLeadThreshold}`
}
