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

// Default modules per audit level — GEO + SEO only
export const DEFAULT_MODULES_SZINT1 = {
  geo: {
    crawler_access: true,
    schema_markup: true,
    citability: true,
    brand_mentions: true,
    platform_check: true,
    llmstxt: true,
  },
  seo: {
    technical_seo: true,
    on_page: true,
    performance: true,
    crawlability: true,
    internal_linking: true,
  },
};

export const DEFAULT_MODULES_SZINT2 = {
  ...DEFAULT_MODULES_SZINT1,
};

// GEO Score weights (100 pts total)
export const GEO_WEIGHTS = {
  ai_citability: 0.25,    // AI crawler access, llms.txt, passage quality
  brand_authority: 0.20,   // Author, date, stats, entity density
  content_quality: 0.20,   // E-E-A-T, headings, alt text, language
  technical_base: 0.15,    // HTTPS, canonical, sitemap, robots.txt
  structured_data: 0.10,   // Schema markup completeness
  platform_opt: 0.10,      // OG tags, meta title, viewport
} as const;

// SEO Score weights (100 pts total)
export const SEO_WEIGHTS = {
  technical_health: 0.35,   // Indexing, crawlability, status codes
  content_relevance: 0.30,  // Intent match, content quality, headings
  performance: 0.20,        // CWV proxy, mobile, load signals
  authority: 0.15,          // E-E-A-T signals, link profile signals
} as const;
