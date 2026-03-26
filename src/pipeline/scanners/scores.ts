import type { TechnicalScan, ComplianceScan } from "@/lib/types";

/**
 * Calculate GEO/SEO score from technical scan data.
 * Weighted by importance: schema (20%), AI crawlers (20%), meta (15%),
 * robots/sitemap (15%), technical basics (15%), content (15%).
 */
export function calculateGeoScore(scan: TechnicalScan): number {
  let score = 0;
  let maxScore = 0;

  // Schema markup (20 pts)
  maxScore += 20;
  if (scan.schema_markup.found) {
    score += 10;
    if (scan.schema_markup.fieldsCount >= 5) score += 5;
    if (scan.schema_markup.types.length >= 2) score += 5;
  }

  // AI Crawler access (20 pts)
  maxScore += 20;
  const crawlerValues = Object.values(scan.robots_txt.aiCrawlers);
  const allowedCount = crawlerValues.filter(v => v === "allowed" || v === "not_mentioned").length;
  score += Math.round((allowedCount / crawlerValues.length) * 20);

  // Meta tags (15 pts)
  maxScore += 15;
  if (scan.meta_title.found && scan.meta_title.length >= 20 && scan.meta_title.length <= 70) score += 5;
  else if (scan.meta_title.found) score += 2;
  if (scan.meta_description.found && scan.meta_description.length >= 80 && scan.meta_description.length <= 160) score += 5;
  else if (scan.meta_description.found) score += 2;
  if (scan.open_graph.found) score += 5;

  // Robots.txt + Sitemap (15 pts)
  maxScore += 15;
  if (scan.robots_txt.found) score += 8;
  if (scan.sitemap.found) score += 7;

  // Technical basics (15 pts)
  maxScore += 15;
  if (scan.https) score += 4;
  if (scan.canonical.found && scan.canonical.matchesDomain) score += 3;
  if (scan.viewport) score += 2;
  if (scan.lang_attr) score += 2;
  if (scan.favicon) score += 2;
  if (scan.headings.hierarchy_ok) score += 2;

  // Content signals (15 pts)
  maxScore += 15;
  if (scan.ga4 || scan.gtm) score += 5;
  if (scan.images.total === 0 || scan.images.withAlt / scan.images.total >= 0.8) score += 5;
  if (scan.cookie_consent.found) score += 5;

  return Math.round((score / maxScore) * 100);
}

/**
 * Marketing score heuristic based on available technical signals.
 * A rough estimate — the LLM refines this with content analysis.
 */
export function calculateMarketingScore(scan: TechnicalScan): number {
  let score = 0;
  let maxScore = 0;

  // Content quality signals (30 pts)
  maxScore += 30;
  if (scan.meta_title.found) score += 8;
  if (scan.meta_description.found) score += 8;
  if (scan.headings.h1 >= 1 && scan.headings.h2 >= 2) score += 7;
  if (scan.lang_attr) score += 7;

  // Conversion signals (25 pts)
  maxScore += 25;
  if (scan.open_graph.found) score += 10;
  if (scan.cookie_consent.found) score += 8;
  if (scan.favicon) score += 7;

  // Trust signals (25 pts)
  maxScore += 25;
  if (scan.https) score += 10;
  if (scan.schema_markup.found) score += 8;
  if (scan.canonical.found) score += 7;

  // Growth signals (20 pts)
  maxScore += 20;
  if (scan.ga4 || scan.gtm) score += 10;
  if (scan.sitemap.found) score += 5;
  if (scan.robots_txt.found) score += 5;

  return Math.round((score / maxScore) * 100);
}

/**
 * Get compliance score and grade directly from compliance scan.
 */
export function getComplianceScore(scan: ComplianceScan): { score: number; grade: string } {
  return { score: scan.overall_score, grade: scan.grade };
}
