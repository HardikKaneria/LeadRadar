export type ScoreResult = {
    score: number;
    matched_keywords: string[];
    score_reason: string;
  };
  
  const positiveKeywords = [
    "react",
    "next.js",
    "nextjs",
    "node.js",
    "nodejs",
    "nestjs",
    "wordpress",
    "woocommerce",
    "shopify",
    "php",
    "laravel",
    "prisma",
    "postgresql",
    "mysql",
    "saas",
    "dashboard",
    "billing",
    "invoice",
    "crm",
    "erp",
    "api integration",
    "admin panel",
    "marketplace",
    "booking system",
    "automation",
    "website redesign",
    "web application"
  ];
  
  const negativeKeywords = [
    "cheap",
    "very low budget",
    "free test",
    "unpaid",
    "commission only",
    "adult",
    "gambling",
    "crypto spam",
    "academic cheating",
    "data entry only"
  ];
  
  export function scoreLead(input: {
    title: string;
    description?: string | null;
    budgetText?: string | null;
  }): ScoreResult {
    const text = `${input.title} ${input.description ?? ""} ${
      input.budgetText ?? ""
    }`.toLowerCase();
  
    const matchedPositive = positiveKeywords.filter((keyword) =>
      text.includes(keyword)
    );
  
    const matchedNegative = negativeKeywords.filter((keyword) =>
      text.includes(keyword)
    );
  
    let score = 20;
  
    score += matchedPositive.length * 8;
    score -= matchedNegative.length * 15;
  
    if (text.includes("long term") || text.includes("long-term")) score += 10;
    if (text.includes("urgent")) score += 5;
    if (text.includes("fixed price") || text.includes("hourly")) score += 5;
    if (text.includes("api")) score += 8;
    if (text.includes("full stack") || text.includes("full-stack")) score += 8;
  
    score = Math.max(0, Math.min(100, score));
  
    const scoreLabel =
      score >= 80
        ? "Hot Lead"
        : score >= 60
          ? "Good Fit"
          : score >= 40
            ? "Review"
            : "Low Priority";
  
    const score_reason =
      matchedPositive.length > 0
        ? `${scoreLabel}: Matched Hkrafted service keywords: ${matchedPositive.join(
            ", "
          )}.`
        : `${scoreLabel}: No strong service keywords matched. Review manually.`;
  
    return {
      score,
      matched_keywords: matchedPositive,
      score_reason
    };
  }