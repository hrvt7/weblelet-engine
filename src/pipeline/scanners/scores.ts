import type { TechnicalScan } from "@/lib/types";
import { GEO_WEIGHTS, SEO_WEIGHTS } from "@/lib/constants";

/**
 * Calculate GEO score — AI search engine visibility.
 * 6 dimensions: AI Citability (25%), Brand Authority (20%), Content Quality (20%),
 * Technical Base (15%), Structured Data (10%), Platform Optimization (10%).
 */
export function calculateGeoScore(scan: TechnicalScan): number {
  // AI Citability (25%)
  const crawlerValues = Object.values(scan.robots_txt.aiCrawlers);
  const crawlerPct = crawlerValues.length > 0
    ? crawlerValues.filter(v => v !== "blocked").length / crawlerValues.length
    : 0.5;
  const aiCitability = crawlerPct * 100;

  // Brand Authority (20%)
  const brandAuth = Math.min(
    ((scan.meta_title.found ? 25 : 0) +
    (scan.meta_description.found ? 25 : 0) +
    (scan.lang_attr ? 25 : 0) +
    (scan.headings.h1 >= 1 ? 25 : 0)),
    100
  );

  // Content Quality (20%)
  const contentQ = Math.min(
    ((scan.meta_description.found ? 25 : 0) +
    (scan.headings.h1 >= 1 ? 20 : 0) +
    ((scan.images.total === 0 || scan.images.withAlt / Math.max(scan.images.total, 1) >= 0.8) ? 25 : 0) +
    (scan.lang_attr ? 15 : 0) +
    (scan.headings.hierarchy_ok ? 15 : 0)),
    100
  );

  // Technical Base (15%)
  const techBase = Math.min(
    ((scan.https ? 25 : 0) +
    (scan.canonical.found ? 20 : 0) +
    (scan.sitemap.found ? 25 : 0) +
    (scan.robots_txt.found ? 20 : 0) +
    (scan.favicon ? 10 : 0)),
    100
  );

  // Structured Data (10%)
  const structData = Math.min(
    ((scan.schema_markup.found ? 40 : 0) +
    ((scan.schema_markup.types?.length || 0) > 1 ? 30 : 0) +
    ((scan.schema_markup.fieldsCount || 0) > 5 ? 30 : 0)),
    100
  );

  // Platform Optimization (10%)
  const platOpt = Math.min(
    ((scan.open_graph.found ? 35 : 0) +
    (scan.meta_title.found ? 30 : 0) +
    (scan.viewport ? 35 : 0)),
    100
  );

  return Math.round(
    aiCitability * GEO_WEIGHTS.ai_citability +
    brandAuth * GEO_WEIGHTS.brand_authority +
    contentQ * GEO_WEIGHTS.content_quality +
    techBase * GEO_WEIGHTS.technical_base +
    structData * GEO_WEIGHTS.structured_data +
    platOpt * GEO_WEIGHTS.platform_opt
  );
}

/**
 * Calculate SEO score — traditional search engine optimization.
 * 4 buckets: Technical Health (35%), Content Relevance (30%),
 * Performance (20%), Authority (15%).
 */
export function calculateSeoScore(scan: TechnicalScan): number {
  // Technical Health (35%)
  const techHealth = Math.min(
    ((scan.https ? 15 : 0) +
    (scan.canonical.found && scan.canonical.matchesDomain ? 15 : 0) +
    (scan.sitemap.found ? 15 : 0) +
    (scan.robots_txt.found ? 15 : 0) +
    (scan.viewport ? 10 : 0) +
    (scan.lang_attr ? 10 : 0) +
    (scan.headings.hierarchy_ok ? 10 : 0) +
    (scan.favicon ? 10 : 0)),
    100
  );

  // Content Relevance (30%)
  const contentRel = Math.min(
    ((scan.meta_title.found && scan.meta_title.length >= 20 && scan.meta_title.length <= 70 ? 25 : scan.meta_title.found ? 10 : 0) +
    (scan.meta_description.found && scan.meta_description.length >= 80 && scan.meta_description.length <= 160 ? 25 : scan.meta_description.found ? 10 : 0) +
    (scan.headings.h1 >= 1 ? 15 : 0) +
    (scan.headings.h2 >= 2 ? 10 : 0) +
    ((scan.images.total === 0 || scan.images.withAlt / Math.max(scan.images.total, 1) >= 0.8) ? 15 : 0) +
    (scan.lang_attr ? 10 : 0)),
    100
  );

  // Performance proxy (20%)
  const perfProxy = Math.min(
    ((scan.viewport ? 30 : 0) +
    (scan.https ? 20 : 0) +
    ((scan.images.total === 0 || scan.images.withAlt / Math.max(scan.images.total, 1) >= 0.5) ? 25 : 0) +
    (scan.cookie_consent.found ? 15 : 0) +
    (scan.favicon ? 10 : 0)),
    100
  );

  // Authority (15%)
  const authority = Math.min(
    ((scan.schema_markup.found ? 30 : 0) +
    (scan.open_graph.found ? 25 : 0) +
    ((scan.ga4 || scan.gtm) ? 20 : 0) +
    (scan.canonical.found ? 15 : 0) +
    ((scan.schema_markup.types?.length || 0) > 1 ? 10 : 0)),
    100
  );

  return Math.round(
    techHealth * SEO_WEIGHTS.technical_health +
    contentRel * SEO_WEIGHTS.content_relevance +
    perfProxy * SEO_WEIGHTS.performance +
    authority * SEO_WEIGHTS.authority
  );
}
