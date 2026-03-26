// AI Crawlers to check in robots.txt
export const AI_CRAWLERS = [
  "GPTBot",
  "ChatGPT-User",
  "Google-Extended",
  "Googlebot",
  "Bingbot",
  "PerplexityBot",
  "ClaudeBot",
  "Anthropic-ai",
  "cohere-ai",
  "Meta-ExternalAgent",
  "Meta-ExternalFetcher",
  "Bytespider",
  "CCBot",
  "Applebot",
] as const;

// Compliance scoring weights
export const COMPLIANCE_WEIGHTS = {
  gdpr: 0.30,
  hungarian: 0.25,
  accessibility: 0.15,
  pci: 0.15,
  canspam: 0.15,
} as const;

// Grade thresholds
export function scoreToGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

// Forbidden phrases in LLM output
export const FORBIDDEN_PHRASES = [
  "teljes elvesztés",
  "gépileg vak",
  "nulla esély",
  "senki nem",
  "soha nem",
  "teljesen láthatatlan",
  "garantáltan",
  "biztosan",
] as const;

// Default modules per audit level
export const DEFAULT_MODULES_SZINT1 = {
  geo_seo: {
    crawler_access: true,
    schema_markup: true,
    technical_seo: true,
    citability: true,
    brand_mentions: true,
    platform_check: true,
    llmstxt: true,
  },
  marketing: {
    content_quality: true,
    conversion: true,
    competitor: true,
    brand_trust: false,
  },
  compliance: {
    gdpr: true,
    hungarian_legal: true,
    accessibility: true,
    pci_dss: true,
    can_spam: true,
  },
  sales: {
    company_research: false,
    contacts: false,
    lead_scoring: false,
    outreach: false,
  },
};

export const DEFAULT_MODULES_SZINT2 = {
  ...DEFAULT_MODULES_SZINT1,
  marketing: { ...DEFAULT_MODULES_SZINT1.marketing, brand_trust: true },
  sales: {
    company_research: true,
    contacts: true,
    lead_scoring: true,
    outreach: true,
  },
};
