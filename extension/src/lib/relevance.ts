// Client-side relevance scorer for captured items.
// Scores based on hiring/freelance signals found in the post text.
// Returns a tier: 'hot' | 'warm' | 'cold' | 'skip'

export type RelevanceTier = 'hot' | 'warm' | 'cold' | 'skip';

const HIRE_SIGNALS: [RegExp, number][] = [
  // High-value explicit hiring
  [/\bhiring\b/i, 4],
  [/\bwe'?re hiring\b/i, 5],
  [/\bjob opportunity\b/i, 4],
  [/\bopen (position|role|vacancy)\b/i, 4],
  [/\blooking for (a |an )?(senior|junior|mid|full.?stack|front.?end|back.?end|react|node|developer|engineer|designer)/i, 5],
  [/\bseeking (a |an )?(developer|engineer|freelancer|contractor)/i, 5],
  [/\bneed (a |an )?(developer|engineer|freelancer|contractor|expert)/i, 5],
  [/\bwork with us\b/i, 3],
  [/\bapply (now|today|here|below)\b/i, 3],
  [/\bsend (me|us) (your |a )?(cv|resume|portfolio|proposal|dm|message)\b/i, 3],
  [/\bdm me\b/i, 3],
  [/\breach out\b/i, 2],

  // Freelance / contract signals
  [/\bfreelance (project|work|opportunity|developer|role|contract)\b/i, 5],
  [/\bcontract (role|work|project|position|developer)\b/i, 4],
  [/\bremote (position|role|work|contract|opportunity)\b/i, 3],
  [/\bproject (available|opportunity|budget|scope)\b/i, 3],
  [/\bclient (looking|needs|seeking|requires)\b/i, 3],

  // Budget signals
  [/\b(budget|rate|compensation|pay|salary)[\s:]*[$€£]?\d/i, 4],
  [/\b\$\d{2,}/i, 3],
  [/\bpaid (project|work|opportunity)\b/i, 3],
  [/\b(hourly|monthly|weekly) rate\b/i, 3],
  [/\bper (hour|month|week|day)\b/i, 2],

  // Urgency
  [/\b(urgent|immediately|asap|right away)\b/i, 2],
  [/\bstart (immediately|asap|next week|monday)\b/i, 2],

  // Soft signals
  [/\bfull.?stack\b/i, 1],
  [/\bfront.?end\b/i, 1],
  [/\bback.?end\b/i, 1],
  [/\breact\.?js?\b/i, 1],
  [/\bnode\.?js?\b/i, 1],
  [/\bnext\.?js?\b/i, 1],
  [/\bshopify (developer|expert|partner)\b/i, 2],
  [/\bwordpress (developer|expert)\b/i, 2],
];

// Anti-signals — personal announcements, not opportunities
const ANTI_SIGNALS: [RegExp, number][] = [
  [/\b(excited|thrilled|happy|pleased|proud) to (announce|share|join|start)\b/i, -5],
  [/\bjust (joined|started|accepted|got hired|got the job|signed)\b/i, -5],
  [/\bnew (chapter|role|position|job|opportunity) at\b/i, -4],
  [/\bi (got|landed|secured) (a |the )?(job|offer|role|position)\b/i, -5],
  [/\bday \d+ (of|at)\b/i, -3],
  [/\bstarting (my new|a new) role\b/i, -4],
  [/\bpromotion|promoted to\b/i, -3],
  [/\b(congratulations|congrats)\b/i, -2],
  [/\bthank(ing)? (everyone|you all|my team)\b/i, -2],
  [/\bgrateful (for|to)\b/i, -2],
  [/\binspiring (story|post|content)\b/i, -2],
  [/\bmotivational (story|content|post)\b/i, -2],
];

export function scoreRelevance(text: string): { score: number; tier: RelevanceTier; matched: string[] } {
  const matched: string[] = [];
  let score = 0;

  for (const [pattern, weight] of HIRE_SIGNALS) {
    const m = text.match(pattern);
    if (m) {
      score += weight;
      matched.push(m[0]);
    }
  }

  for (const [pattern, weight] of ANTI_SIGNALS) {
    const m = text.match(pattern);
    if (m) {
      score += weight; // weight is already negative
      matched.push(`⛔ ${m[0]}`);
    }
  }

  const tier: RelevanceTier = score >= 6 ? 'hot' : score >= 3 ? 'warm' : score >= 1 ? 'cold' : 'skip';
  return { score, tier, matched };
}

export const TIER_LABEL: Record<RelevanceTier, string> = {
  hot:  '🔥 Hot lead',
  warm: '👍 Possible lead',
  cold: '❄️ Low signal',
  skip: '✗ Not a lead',
};

export const TIER_COLOR: Record<RelevanceTier, string> = {
  hot:  '#3ddc97',
  warm: '#f5a623',
  cold: '#8aa296',
  skip: '#4a3a3a',
};
