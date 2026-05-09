export const LEAD_STATUSES = [
  'new',
  'interested',
  'applied',
  'follow_up',
  'won',
  'lost',
  'ignored',
] as const

export type LeadStatus = (typeof LEAD_STATUSES)[number]

export interface LeadRecord {
  id: string
  platform: string
  external_id: string | null
  title: string
  description: string | null
  url: string
  budget_text: string | null
  budget_min: number | null
  budget_max: number | null
  currency: string | null
  posted_at: string | null
  first_seen_at: string | null
  score: number
  score_reason: string | null
  matched_keywords: string[] | null
  status: LeadStatus
  raw_payload: Record<string, unknown> | null
  created_by: string | null
  created_at: string | null
  updated_at: string | null
}

export interface LeadNoteRecord {
  id: string
  lead_id: string | null
  user_id: string | null
  note: string
  created_at: string | null
}

export interface LeadActivityRecord {
  id: string
  lead_id: string | null
  user_id: string | null
  action: string
  old_value: string | null
  new_value: string | null
  created_at: string | null
}

export interface ProfileRecord {
  id: string
  full_name: string | null
  role: string | null
  is_active: boolean | null
  created_at: string | null
}

export interface SettingsRecord {
  id: string
  key: string
  value: unknown
  updated_at: string | null
}

export interface LeadScoringRule {
  keyword: string
  score: number
}

export interface LeadScoringConfig {
  hotLeadThreshold: number
  rules: LeadScoringRule[]
}

export interface LeadScoreResult {
  matchedKeywords: string[]
  reason: string
  score: number
}

export const DEFAULT_HOT_LEAD_THRESHOLD = 80

export const DEFAULT_PLATFORM_OPTIONS = [
  'Upwork',
  'LinkedIn',
  'Freelancer',
  'Contra',
  'Clutch',
  'Referral',
  'Website',
  'Other',
] as const

export const DEFAULT_LEAD_SCORING_RULES: LeadScoringRule[] = [
  // Positive Keywords
  { keyword: 'react', score: 10 },
  { keyword: 'next.js', score: 10 },
  { keyword: 'node.js', score: 10 },
  { keyword: 'nestjs', score: 10 },
  { keyword: 'wordpress', score: 10 },
  { keyword: 'woocommerce', score: 10 },
  { keyword: 'shopify', score: 10 },
  { keyword: 'php', score: 10 },
  { keyword: 'laravel', score: 10 },
  { keyword: 'prisma', score: 10 },
  { keyword: 'postgresql', score: 10 },
  { keyword: 'mysql', score: 10 },
  { keyword: 'saas', score: 15 },
  { keyword: 'dashboard', score: 15 },
  { keyword: 'billing', score: 10 },
  { keyword: 'invoice', score: 10 },
  { keyword: 'crm', score: 15 },
  { keyword: 'erp', score: 15 },
  { keyword: 'api integration', score: 15 },
  { keyword: 'admin panel', score: 15 },
  { keyword: 'marketplace', score: 15 },
  { keyword: 'booking system', score: 15 },
  { keyword: 'automation', score: 10 },
  { keyword: 'website redesign', score: 10 },
  { keyword: 'web application', score: 15 },

  // Negative Keywords
  { keyword: 'cheap', score: -30 },
  { keyword: 'very low budget', score: -30 },
  { keyword: 'free test', score: -50 },
  { keyword: 'unpaid', score: -50 },
  { keyword: 'commission only', score: -50 },
  { keyword: 'adult', score: -50 },
  { keyword: 'gambling', score: -50 },
  { keyword: 'crypto spam', score: -50 },
  { keyword: 'academic cheating', score: -50 },
  { keyword: 'data entry only', score: -50 },
]

export function getDefaultScoringConfig(): LeadScoringConfig {
  return {
    hotLeadThreshold: DEFAULT_HOT_LEAD_THRESHOLD,
    rules: DEFAULT_LEAD_SCORING_RULES,
  }
}

function normalize(text: string): string {
  return text.trim().toLowerCase()
}

export function resolveScoringConfig(
  partialConfig?: Partial<LeadScoringConfig>,
): LeadScoringConfig {
  const normalizedRules =
    partialConfig?.rules?.filter((rule) => normalize(rule.keyword).length > 0) ??
    DEFAULT_LEAD_SCORING_RULES

  return {
    hotLeadThreshold:
      partialConfig?.hotLeadThreshold ?? DEFAULT_HOT_LEAD_THRESHOLD,
    rules: normalizedRules,
  }
}

export function calculateLeadScore(
  input: {
    budgetText?: string | null
    description?: string | null
    platform?: string | null
    title?: string | null
  },
  partialConfig?: Partial<LeadScoringConfig>,
): LeadScoreResult {
  const config = resolveScoringConfig(partialConfig)
  const haystack = [
    input.title ?? '',
    input.description ?? '',
    input.budgetText ?? '',
    input.platform ?? '',
  ]
    .join(' ')
    .toLowerCase()

  const matchedKeywords: string[] = []
  let score = 0

  for (const rule of config.rules) {
    const keyword = normalize(rule.keyword)

    if (!keyword || !haystack.includes(keyword)) {
      continue
    }

    matchedKeywords.push(rule.keyword)
    score += rule.score
  }

  const cappedScore = Math.max(0, Math.min(100, score))

  return {
    matchedKeywords,
    reason:
      matchedKeywords.length > 0
        ? `Matched keywords: ${matchedKeywords.join(', ')}`
        : 'No matching keywords from the current scoring rules.',
    score: cappedScore,
  }
}

export function isHotLead(score: number, threshold = DEFAULT_HOT_LEAD_THRESHOLD) {
  return score >= threshold
}
