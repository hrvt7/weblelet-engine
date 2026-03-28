// @ts-nocheck — Deno Edge Function
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";
import { PDF_TEMPLATE } from "./template.ts";

// ═══ TYPES ═══
interface TechnicalScan {
  canonical: { found: boolean; url: string | null; matchesDomain: boolean };
  meta_title: { found: boolean; content: string | null; length: number };
  meta_description: { found: boolean; content: string | null; length: number; language: string | null };
  schema_markup: { found: boolean; types: string[]; jsonLd: string | null; fieldsCount: number };
  robots_txt: { found: boolean; content: string | null; aiCrawlers: Record<string, string> };
  sitemap: { found: boolean; statusCode: number | null };
  https: boolean;
  lang_attr: string | null;
  headings: { h1: number; h2: number; h3: number; hierarchy_ok: boolean };
  images: { total: number; withoutAlt: number; withAlt: number };
  ga4: boolean;
  gtm: boolean;
  cookie_consent: { found: boolean; provider: string | null };
  open_graph: { found: boolean; tags: string[] };
  viewport: boolean;
  favicon: boolean;
  // GEO-specific fields
  llms_txt: { found: boolean; has_full: boolean; size: number | null };
  passage_quality: { avg_words_per_section: number; total_sections: number; optimal_sections: number };
  entity_signals: { has_author: boolean; has_date: boolean; has_stats: boolean; faq_detected: boolean; entity_count_estimate: number };
}

// ═══ CONSTANTS ═══
const AI_CRAWLERS = [
  "GPTBot", "ChatGPT-User", "Google-Extended", "Googlebot", "Bingbot",
  "PerplexityBot", "ClaudeBot", "Anthropic-ai", "cohere-ai",
  "Meta-ExternalAgent", "Meta-ExternalFetcher", "Bytespider", "CCBot", "Applebot",
];

const FORBIDDEN_REPLACEMENTS: Record<string, string> = {
  "teljes elvesztés": "jelentős romlás",
  "gépileg vak": "nehezen olvasható gépi feldolgozás számára",
  "nulla esély": "nagyon alacsony esély",
  "senki nem": "szinte senki nem",
  "soha nem": "jelenleg nem",
  "teljesen láthatatlan": "nehezen észlelhető",
  "garantáltan": "nagy valószínűséggel",
  "biztosan": "várhatóan",
  "kötelező bírság": "lehetséges szankció",
  "köteles": "szükséges lehet",
  "jogsértés": "jogi kockázat",
};

function sanitizeForbiddenPhrases(data: any): any {
  let text = JSON.stringify(data);
  for (const [forbidden, replacement] of Object.entries(FORBIDDEN_REPLACEMENTS)) {
    const regex = new RegExp(forbidden, "gi");
    text = text.replace(regex, replacement);
  }
  return JSON.parse(text);
}

function scoreToGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

function textContains(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some(k => lower.includes(k.toLowerCase()));
}

// ═══ FETCHER ═══
const SUB_PAGE_PATTERNS = [
  { key: "privacy", patterns: ["privacy", "adatvéd", "adatkezel", "gdpr"] },
  { key: "terms", patterns: ["ászf", "terms", "felhasználási", "általános szerződési"] },
  { key: "impresszum", patterns: ["impresszum", "imprint", "cégadatok", "rólunk"] },
  { key: "contact", patterns: ["kapcsolat", "contact", "elérhetőség"] },
];

async function safeFetch(url: string): Promise<{ text: string; status: number } | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(url, {
      headers: { "User-Agent": "WebLelet Bot/1.0 (+https://weblelet.hu)" },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);
    return { text: await res.text(), status: res.status };
  } catch {
    return null;
  }
}

async function fetchSubPages(html: string, baseUrl: string): Promise<Record<string, string>> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) return {};
  const links: Record<string, string> = {};
  const base = new URL(baseUrl);

  const anchors = doc.querySelectorAll("a[href]");
  for (const a of anchors) {
    const href = a.getAttribute("href");
    if (!href) continue;
    let fullUrl: string;
    try { fullUrl = new URL(href, base.origin).href; } catch { continue; }
    if (!fullUrl.startsWith(base.origin)) continue;

    const combined = (href + " " + (a.textContent || "")).toLowerCase();
    for (const { key, patterns } of SUB_PAGE_PATTERNS) {
      if (links[key]) continue;
      if (patterns.some(p => combined.includes(p))) { links[key] = fullUrl; break; }
    }
  }

  const subPages: Record<string, string> = {};
  const fetches = Object.entries(links).slice(0, 5).map(async ([key, subUrl]) => {
    const res = await safeFetch(subUrl);
    if (res && res.status === 200) subPages[key] = res.text;
  });
  await Promise.all(fetches);
  return subPages;
}

// ═══ GEO: llms.txt FETCH ═══
async function fetchLlmsTxt(baseUrl: string): Promise<{ found: boolean; has_full: boolean; size: number | null }> {
  try {
    const base = new URL(baseUrl).origin;
    const main = await safeFetch(`${base}/llms.txt`);
    const full = await safeFetch(`${base}/llms-full.txt`);
    if (main?.status === 200) {
      return { found: true, has_full: full?.status === 200, size: main.text.length };
    }
    return { found: false, has_full: false, size: null };
  } catch { return { found: false, has_full: false, size: null }; }
}

// ═══ GEO: PERPLEXITY VISIBILITY CHECK ═══
async function checkPerplexityVisibility(domain: string, brandName: string, businessType: string): Promise<{
  cited_count: number; total_queries: number; prompts_cited: string[]; citations_found: string[];
}> {
  const apiKey = Deno.env.get("PERPLEXITY_API_KEY");
  if (!apiKey) return { cited_count: 0, total_queries: 0, prompts_cited: [], citations_found: [] };

  // Generate 5 relevant prompts based on business type
  const prompts = generatePerplexityPrompts(businessType, brandName, domain);
  const cited: string[] = [];
  const allCitations: string[] = [];

  for (const prompt of prompts) {
    try {
      const res = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "sonar",
          messages: [{ role: "user", content: prompt }],
          return_citations: true,
          search_recency_filter: "month",
        }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const citations: string[] = data.citations || [];
      allCitations.push(...citations);
      const domainClean = domain.replace(/^www\./, "");
      if (citations.some((c: string) => c.includes(domainClean))) {
        cited.push(prompt.substring(0, 60));
      }
    } catch { continue; }
  }

  return {
    cited_count: cited.length,
    total_queries: prompts.length,
    prompts_cited: cited,
    citations_found: [...new Set(allCitations)].slice(0, 10),
  };
}

function generatePerplexityPrompts(businessType: string, brandName: string, domain: string): string[] {
  const domainClean = domain.replace(/^www\./, "").replace(/\.[^.]+$/, "");
  const bt = (businessType || "").toLowerCase();
  if (bt.includes("étterem") || bt.includes("restaurant")) {
    return [
      `legjobb ${domainClean} étterem vélemények`,
      `${brandName} étterem menü és nyitvatartás`,
      `jó étterem ${domainClean} környékén`,
      `${brandName} asztalfoglalás`,
      `${domainClean} éttermi ajánlások`,
    ];
  }
  if (bt.includes("webshop") || bt.includes("shop") || bt.includes("bolt")) {
    return [
      `${brandName} termékek vélemények`,
      `${domainClean} webshop megbízható?`,
      `${brandName} vásárlói tapasztalatok`,
      `${domainClean} árak és szállítás`,
      `${brandName} összehasonlítás`,
    ];
  }
  // General / service
  return [
    `${brandName} szolgáltatás vélemények`,
    `${domainClean} tapasztalatok`,
    `${brandName} cég megbízható?`,
    `${domainClean} árak és ajánlatok`,
    `${brandName} céginformáció`,
  ];
}

// ═══ TECHNICAL SCANNER ═══
function runTechnicalScan(html: string, url: string, robotsTxt: string | null, sitemapStatus: number | null, llmsTxtResult?: { found: boolean; has_full: boolean; size: number | null }): TechnicalScan {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const domain = new URL(url).hostname;
  const htmlLower = html.toLowerCase();

  // Canonical
  const canonicalEl = doc?.querySelector('link[rel="canonical"]');
  const canonicalUrl = canonicalEl?.getAttribute("href") || null;

  // Meta
  const titleEl = doc?.querySelector("title");
  const titleContent = titleEl?.textContent || null;
  const descEl = doc?.querySelector('meta[name="description"]');
  const descContent = descEl?.getAttribute("content") || null;
  const langAttr = doc?.querySelector("html")?.getAttribute("lang") || null;

  // Schema
  const schemaScripts = doc?.querySelectorAll('script[type="application/ld+json"]') || [];
  const schemaTypes: string[] = [];
  let jsonLdContent: string | null = null;
  let fieldsCount = 0;
  for (const s of schemaScripts) {
    try {
      const parsed = JSON.parse(s.textContent || "");
      if (parsed["@type"]) schemaTypes.push(parsed["@type"]);
      jsonLdContent = s.textContent;
      fieldsCount += Object.keys(parsed).length;
    } catch { /* skip */ }
  }

  // Robots.txt crawlers
  const aiCrawlers: Record<string, string> = {};
  for (const crawler of AI_CRAWLERS) {
    if (!robotsTxt) { aiCrawlers[crawler] = "allowed"; continue; }
    const lines = robotsTxt.split("\n");
    let blocked = false;
    let currentAgent = "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.toLowerCase().startsWith("user-agent:")) currentAgent = trimmed.substring(11).trim();
      else if (trimmed.toLowerCase().startsWith("disallow:") && trimmed.substring(9).trim() === "/") {
        if (currentAgent === "*" || currentAgent.toLowerCase() === crawler.toLowerCase()) { blocked = true; break; }
      }
    }
    aiCrawlers[crawler] = blocked ? "blocked" : (robotsTxt.toLowerCase().includes(crawler.toLowerCase()) ? "allowed" : "not_mentioned");
  }

  // Headings
  const h1 = doc?.querySelectorAll("h1").length || 0;
  const h2 = doc?.querySelectorAll("h2").length || 0;
  const h3 = doc?.querySelectorAll("h3").length || 0;

  // Images
  const images = doc?.querySelectorAll("img") || [];
  let withAlt = 0;
  for (const img of images) { if (img.getAttribute("alt")?.trim()) withAlt++; }

  // OG tags
  const ogTags: string[] = [];
  const ogEls = doc?.querySelectorAll('meta[property^="og:"]') || [];
  for (const el of ogEls) { const p = el.getAttribute("property"); if (p) ogTags.push(p); }

  // Cookie consent
  const cookiePatterns = [
    { pattern: "cookiebot", provider: "Cookiebot" }, { pattern: "onetrust", provider: "OneTrust" },
    { pattern: "klaro", provider: "Klaro" }, { pattern: "cc-banner", provider: "Cookie Consent" },
    { pattern: "cookie-consent", provider: "Cookie Consent" },
  ];
  let cookieFound = false;
  let cookieProvider: string | null = null;
  for (const { pattern, provider } of cookiePatterns) {
    if (htmlLower.includes(pattern)) { cookieFound = true; cookieProvider = provider; break; }
  }

  // ── Passage quality: avg words between h2/h3 headings ──
  const passageQuality = (() => {
    const bodyText = doc?.querySelector("body")?.textContent || html;
    const sections = bodyText.split(/\n(?=[A-ZÁÉÍÓÖŐÚÜŰ][^\n]{10,80}\n)/);
    const wordCounts = sections.map(s => s.trim().split(/\s+/).filter(w => w.length > 2).length).filter(c => c >= 20);
    const avg = wordCounts.length > 0 ? Math.round(wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length) : 0;
    const optimal = wordCounts.filter(c => c >= 120 && c <= 200).length;
    return { avg_words_per_section: avg, total_sections: wordCounts.length, optimal_sections: optimal };
  })();

  // ── Entity signals ──
  const entitySignals = (() => {
    const authorEl = doc?.querySelector('meta[name="author"]') || doc?.querySelector('[rel="author"]');
    const dateEl = doc?.querySelector('meta[property="article:modified_time"]') || doc?.querySelector("time[datetime]");
    const statsPattern = /\d+[,.]?\d*\s*(%|százalék|millió|milliárd|ezer|db|db\.)/i;
    const faqSchema = schemaTypes.some((t: string) => t.toLowerCase().includes("faq"));
    const faqHtml = htmlLower.includes("faq") || htmlLower.includes("frequently asked") || htmlLower.includes("kérdések és válaszok");
    const entityCount = (html.match(/\b[A-ZÁÉÍÓÖŐÚÜŰ][a-záéíóöőúüűA-ZÁÉÍÓÖŐÚÜŰ]{2,}(?:\s+[A-ZÁÉÍÓÖŐÚÜŰ][a-záéíóöőúüűA-ZÁÉÍÓÖŐÚÜŰ]{2,}){0,2}\b/g) || []).length;
    return {
      has_author: !!authorEl,
      has_date: !!dateEl,
      has_stats: statsPattern.test(html),
      faq_detected: faqSchema || faqHtml,
      entity_count_estimate: Math.min(entityCount, 50),
    };
  })();

  return {
    canonical: { found: !!canonicalUrl, url: canonicalUrl, matchesDomain: canonicalUrl ? canonicalUrl.includes(domain) : false },
    meta_title: { found: !!titleContent, content: titleContent, length: titleContent?.length || 0 },
    meta_description: { found: !!descContent, content: descContent, length: descContent?.length || 0, language: langAttr },
    schema_markup: { found: schemaTypes.length > 0, types: schemaTypes, jsonLd: jsonLdContent, fieldsCount },
    robots_txt: { found: !!robotsTxt, content: robotsTxt, aiCrawlers },
    sitemap: { found: sitemapStatus === 200, statusCode: sitemapStatus },
    https: url.startsWith("https://"),
    lang_attr: langAttr,
    headings: { h1, h2, h3, hierarchy_ok: h1 >= 1 && h1 <= 2 },
    images: { total: images.length, withoutAlt: images.length - withAlt, withAlt },
    ga4: htmlLower.includes("gtag") || htmlLower.includes("google-analytics"),
    gtm: htmlLower.includes("googletagmanager"),
    cookie_consent: { found: cookieFound, provider: cookieProvider },
    open_graph: { found: ogTags.length > 0, tags: ogTags },
    viewport: !!doc?.querySelector('meta[name="viewport"]'),
    favicon: !!doc?.querySelector('link[rel="icon"]') || !!doc?.querySelector('link[rel="shortcut icon"]'),
    llms_txt: llmsTxtResult || { found: false, has_full: false, size: null },
    passage_quality: passageQuality,
    entity_signals: entitySignals,
  };
}

// ═══ SCORE CALCULATORS ═══
function calculateGeoScore(scan: TechnicalScan): number {
  // 6-dimenzió GEO scoring (research alapján: geo-seo-claude + piaci standard)

  // 1. AI Citability & Visibility (25%)
  const crawlerVals = Object.values(scan.robots_txt.aiCrawlers || {});
  const crawlerScore = crawlerVals.length > 0
    ? Math.round((crawlerVals.filter(v => v !== "blocked").length / crawlerVals.length) * 30)
    : 15;
  const llmsTxtScore = (scan.llms_txt?.found) ? 20 : 0;
  const passageScore = (() => {
    const pq = scan.passage_quality;
    if (!pq || pq.total_sections === 0) return 5;
    const ratio = pq.optimal_sections / Math.max(pq.total_sections, 1);
    return Math.round(ratio * 10);
  })();
  const faqScore = scan.entity_signals?.faq_detected ? 5 : 0;
  const aiCitability = Math.min(crawlerScore + llmsTxtScore + passageScore + faqScore, 25);

  // 2. Brand Authority (20%)
  const authorScore = scan.entity_signals?.has_author ? 7 : 0;
  const dateScore = scan.entity_signals?.has_date ? 5 : 0;
  const statsScore = scan.entity_signals?.has_stats ? 5 : 0;
  const entityDensityScore = (scan.entity_signals?.entity_count_estimate || 0) >= 15 ? 3 : 0;
  const brandAuthority = Math.min(authorScore + dateScore + statsScore + entityDensityScore, 20);

  // 3. Content Quality & E-E-A-T (20%)
  const metaDescScore = scan.meta_description.found ? 5 : 0;
  const h1Score = (scan.headings.h1 || 0) >= 1 ? 5 : 0;
  const altScore = (scan.images.total === 0 || (scan.images.withAlt / scan.images.total) >= 0.8) ? 5 : 0;
  const langScore = scan.lang_attr ? 5 : 0;
  const contentQuality = Math.min(metaDescScore + h1Score + altScore + langScore, 20);

  // 4. Technical Foundations (15%)
  const httpsScore = scan.https ? 5 : 0;
  const canonicalScore = scan.canonical.found ? 3 : 0;
  const sitemapScore = scan.sitemap.found ? 4 : 0;
  const robotsScore = scan.robots_txt.found ? 3 : 0;
  const technicalBase = Math.min(httpsScore + canonicalScore + sitemapScore + robotsScore, 15);

  // 5. Structured Data / Schema (10%)
  const schemaFoundScore = scan.schema_markup.found ? 5 : 0;
  const schemaTypesScore = (scan.schema_markup.types?.length || 0) > 1 ? 3 : 0;
  const schemaFieldsScore = (scan.schema_markup.fieldsCount || 0) > 5 ? 2 : 0;
  const structuredData = Math.min(schemaFoundScore + schemaTypesScore + schemaFieldsScore, 10);

  // 6. Platform Optimization (10%)
  const ogScore = scan.open_graph.found ? 4 : 0;
  const titleScore = scan.meta_title.found ? 3 : 0;
  const viewportScore = scan.viewport ? 3 : 0;
  const platformOpt = Math.min(ogScore + titleScore + viewportScore, 10);

  return Math.min(aiCitability + brandAuthority + contentQuality + technicalBase + structuredData + platformOpt, 100);
}

function calculateSeoScore(scan: TechnicalScan): number {
  let score = 0;

  // Technical Health (35%): max 35 points
  if (scan.https) score += 5;
  if (scan.canonical.found) score += 5;
  if (scan.sitemap.found) score += 5;
  if (scan.robots_txt.found) score += 5;
  if (scan.headings.hierarchy_ok) score += 5;
  if (scan.favicon) score += 3;
  if (scan.viewport) score += 2;
  // subtotal max: 30, but we weight to 35
  const techHealth = Math.min(score, 30);
  score = 0;

  // Content Relevance (30%): max 30 points
  if (scan.meta_title.found && scan.meta_title.length >= 30 && scan.meta_title.length <= 60) score += 10;
  else if (scan.meta_title.found) score += 5;
  if (scan.meta_description.found && scan.meta_description.length >= 120 && scan.meta_description.length <= 160) score += 10;
  else if (scan.meta_description.found) score += 5;
  if (scan.headings.h1 === 1) score += 5;
  const altCoverage = scan.images.total > 0 ? (scan.images.withAlt / scan.images.total) : 1;
  if (altCoverage >= 0.8) score += 5;
  const contentRelevance = Math.min(score, 30);
  score = 0;

  // Performance (20%): max 20 points
  if (scan.lang_attr) score += 5;
  if (scan.viewport) score += 5;
  if (scan.ga4 || scan.gtm) score += 5;
  if (scan.open_graph.found) score += 5;
  const performance = Math.min(score, 20);
  score = 0;

  // Authority (15%): max 15 points
  if (scan.schema_markup.found) score += 5;
  if ((scan.schema_markup.types?.length || 0) > 1) score += 3;
  if (scan.entity_signals?.has_author) score += 4;
  if (scan.entity_signals?.has_stats) score += 3;
  const authority = Math.min(score, 15);

  // Weighted total: scale each bucket to its weight
  const total = Math.round(
    (techHealth / 30) * 35 +
    (contentRelevance / 30) * 30 +
    (performance / 20) * 20 +
    (authority / 15) * 15
  );

  return Math.min(total, 100);
}

// ═══ LLM AGENT SYSTEM ═══

const GLOBAL_RULES = `GLOBÁLIS SZABÁLYOK (minden válaszra vonatkozik):
- Válaszolj KIZÁRÓLAG valid JSON-ban, semmilyen szöveg vagy markdown NE legyen a JSON-on kívül
- Magyar nyelven válaszolj
- Finding severity: KRITIKUS / MAGAS / KÖZEPES
- Finding mezők (MIND kötelező): severity, tag, title, evidence, why_problem, business_impact, fix, fix_effort, priority

FINDING CÍMKÉZÉS:
🔴 TÉNY — Szerver-oldali, közvetlenül ellenőrizhető: meta tagek, robots.txt, sitemap, HTTPS, schema, canonical, HTTP headerek
🟡 ERŐS FELTÉTELEZÉS — HTML snapshot alapján: tartalom, CTA, kontakt info, vizuális elemek
→ Ha a finding azon alapul hogy a HTML-ben NEM találtad → 🟡, NEM 🔴
→ Add hozzá: "(a HTML forráskód alapján — JavaScript által renderelt tartalom nem látható)"

NYELVI SZABÁLYOK (KÖTELEZŐ):
- TILOS: "köteles", "kötelező bírság", "jogsértés", "teljes elvesztés", "senki nem", "nulla esély", "gépileg vak", "soha nem", "teljesen láthatatlan", "garantáltan", "biztosan"
- HELYETTE: "szükséges lehet", "kockázatot hordozhat", "súlyosan ronthatja", "jelentősen akadályozott"
- Canonical: "a Google számára a fejlesztői domain válhat elsődlegessé" (NEM "nem indexeli", NEM "Google vak rá")
- fix_effort mező: TILOS "0 Ft", "ingyenes", "díjmentes" — HELYETTE: "belső erőforrással elvégezhető" VAGY "külső fejlesztővel: minimális"
- business_impact mező: KÖTELEZŐ "MIT VESZÍT KONKRÉTAN" formátum — pl. "Az érdeklődők egy része foglalás helyett versenytársat keres" (NEM "potenciális veszteség", NEM általános megfogalmazás)`;

const AGENT_PROMPTS: Record<string, string> = {
  "geo-ai-visibility": `${GLOBAL_RULES}
Te a GEO AI Láthatóság agent vagy. Ez az audit ELSŐDLEGES fókusza — GEO-first rendszer.

INPUT: technicalScan (ai crawlers, llms_txt, passage_quality, entity_signals), perplexityResults, domain, businessType, brandName.

FELADATOD:
1. AI CRAWLER HOZZÁFÉRÉS: Ellenőrizd mind a 14 crawler státuszát. Kritikus ha GPTBot / ClaudeBot / PerplexityBot / Google-Extended tiltva van.
   Evidence: "GPTBot: [allowed/blocked/not_mentioned] | ClaudeBot: [..] | PerplexityBot: [..]"

2. llms.txt STÁTUSZ: KRITIKUS hiány ha nincs. Ez az AI keresők számára legfontosabb technikai signal.
   Evidence: "llms.txt: [DETEKTÁLT (X karakter) / NEM DETEKTÁLT]"

3. PERPLEXITY VALÓS MÉRÉS: Ha perplexityResults megvan, add be az evidence-be:
   "Perplexity valós mérés: X/5 lekérdezésnél idéz"
   Ha cited_count === 0 → KRITIKUS finding: "Az oldal nem jelenik meg Perplexity válaszaiban"
   Ha cited_count >= 2 → POZITÍV, csak mention a finding-ben

4. PASSAGE MINŐSÉG: avg_words_per_section vs optimum 134-167 szó.
   Ha avg < 80 vagy avg > 250 → finding (KÖZEPES)

5. ENTITÁS JELEK: has_author, has_date, has_stats — hiányuk csökkenti AI citálhatóságot.

AI CITABILITY SCORE számítás (0-100):
- Összes 14 crawler allowed: 30 pont max (allowed/not_mentioned = ok, blocked = 0)
- llms.txt jelen: 20 pont
- Perplexity cited_count/total * 25 pont max (ha nincs API key: 0)
- passage quality optimal%: 10 pont max
- entity signals (author+date+stats = 3×5): 15 pont max

BRAND AUTHORITY SCORE (0-100):
- author signals: 20pt
- date freshness: 15pt
- stats density: 15pt
- schema present: 20pt
- GA4/GTM: 15pt
- lang_attr: 15pt

Adj 2-4 GEO-specifikus finding-et PRIORITÁS sorrendben. Severity: KRITIKUS/MAGAS/KÖZEPES.
Válasz: {"findings": [...], "ai_citability_score": 0-100, "brand_authority_score": 0-100}`,

  "geo-platform-analysis": `${GLOBAL_RULES}
Te a GEO Platform Optimalizálás agent vagy. Az 5 AI platform mindegyikére adj KONKRÉT értékelést és javítási javaslatot.

INPUT: technicalScan, domain, businessType.

PLATFORM SCORING LOGIKA (0-100 mindegyikre):

ChatGPT (GPTBot):
- GPTBot allowed: +25pt
- FAQ/Q&A struktúra: +20pt (faq_detected)
- Passage quality 134-167 szó: +20pt (optimal_sections > 0)
- Faktualitás jelek (stats, dátum): +20pt
- Entity density > 10: +15pt

Perplexity (PerplexityBot):
- PerplexityBot allowed: +25pt
- llms.txt: +20pt
- Frissesség (has_date): +20pt
- Struktúrált tartalom: +20pt (h2>3)
- Multi-format (képek, videó jelek): +15pt

Google AI Overviews (Google-Extended):
- Google-Extended allowed: +25pt
- Schema markup: +25pt
- E-E-A-T (author+date+stats): +25pt
- Structured data completeness: +25pt

Gemini (Google):
- Schema: +30pt
- Hiteles publisher jelek: +25pt (GA4, domain authority jelek)
- Wikipedia-típusú tartalom struktúra: +25pt
- HTTPS + canonical: +20pt

Bing Copilot (Bingbot):
- Bingbot allowed: +30pt
- OG tagek: +25pt
- Schema: +25pt
- Meta title/description: +20pt

Adj 1-2 konkrét platform-specifikus finding-et a LEGGYENGÉBB platformhoz.
Minden finding evidence-ében jelöld meg: melyik platform + miért alacsony.
Válasz: {"findings": [...], "platform_scores": {"google_ai": 0-100, "chatgpt": 0-100, "perplexity": 0-100, "gemini": 0-100, "bing_copilot": 0-100}}`,

  "geo-technical": `${GLOBAL_RULES}
Te a technikai SEO agent vagy. A technicalScan TÉNYEKET tartalmaz — ezekből generálj RÉSZLETES findings-eket.
Ellenőrizd: canonical URL (dev domain? www vs non-www?), meta title/description (hossz, minőség), sitemap, robots.txt, heading struktúra, kép alt textek, OG tagek, GA4/GTM, HTTPS.
Adj 2-4 finding-et a LEGSÚLYOSABB technikai problémákról. Minden finding-nek legyen evidence (MIT LÁTSZ a scan-ben), why_problem, business_impact, fix és fix_effort.

EVIDENCE KÖTELEZŐ FORMÁTUM — NE általánosíts, a tényleges technicalScan értékeket másold be:
• Meta title → evidence: "Detektált: \'[meta_title.content]\' — [meta_title.length] karakter" (ha üres: "nem található")
• Meta description → evidence: ha found=false → "nem található a HTML forráskódban" | ha found=true → tartalom + hossz karakterben
• H1/H2 → evidence: "H1: [headings.h1] db | H2: [headings.h2] db | H3: [headings.h3] db"
• Canonical → evidence: "Canonical URL: [canonical.url || \'nincs canonical tag a <head>-ben\']"
• Képek → evidence: "[images.withoutAlt] / [images.total] képből hiányzik az alt szöveg"
• Sitemap → evidence: "sitemap.xml: HTTP [sitemap.statusCode || \'nem elérhető\']"
• Robots.txt → evidence: "robots.txt: [robots_txt.found ? \'elérhető\' : \'nem elérhető (404)\']"
• OG tagek → evidence: "[open_graph.tags.join(\', \') || \'egyetlen OG tag sem található\']"
Ha nincs adat → evidence: "[típus]: az automatikus scan nem tudta mérni"
Válasz: {"findings": [...]}`,

  "geo-content": `${GLOBAL_RULES}
Te a tartalom minőség agent vagy. A HTML első 5000 karakterét és az üzlettípust kapod.
E-E-A-T értékelés: Experience (tapasztalat), Expertise (szakértelem), Authoritativeness (hitelesség), Trustworthiness (megbízhatóság).
Tartalom hossz, nyelvi konzisztencia (magyar/angol keverés?), olvashatóság.
Válasz: {"findings": [...], "content_quality_score": 0-100}`,

  "geo-schema": `${GLOBAL_RULES}
Te a schema markup és llms.txt agent vagy. Ha NINCS schema az oldalon, generálj JSON-LD kódot az üzlettípus alapján.
ÉTTEREMNÉL: Restaurant + LocalBusiness type, name, address, telephone, openingHours, servesCuisine, priceRange, acceptsReservations, sameAs.
SZOLGÁLTATÓNÁL: LocalBusiness, Service type, serviceType, areaServed.
WEBSHOPNÁL: Organization, WebSite, SearchAction.
Ha NINCS llms.txt → generálj tartalmasat.
Ha VAN schema de hiányos → jelezd mit kellene bővíteni.

ÉTTEREM SCHEMA ELLENŐRZŐLISTA (Restaurant típusnál mind a 10 mezőt ellenőrizd és csak azt add hozzá ami a HTML-ben valóban megtalálható):
✓/✗ name — az étterem pontos neve (ha nem látod → HAGYD KI)
✓/✗ telephone — telefonszám +36... formátumban (ha nem látod → HAGYD KI)
✓/✗ email — email cím (ha nem látod → HAGYD KI)
✓/✗ address — streetAddress + addressLocality + addressCountry (ha nem látod → HAGYD KI)
✓/✗ openingHoursSpecification — nyitvatartás napok/idők (ha nem látod → HAGYD KI)
✓/✗ acceptsReservations — true ha van foglalási rendszer, false ha nincs (MINDIG add meg)
✓/✗ hasMenu — URL az étlaphoz (csak ha van az oldalon tényleges étlap link)
✓/✗ servesCuisine — konyha típusa (pl. "Magyar", "Italian" — csak ha a HTML-ből egyértelműen kiderül)
✓/✗ geo — latitude + longitude (csak ha van Google Maps embed, onnét olvasd ki)
✓/✗ priceRange — árkategória (pl. "€€" — csak ha az oldalon látható)

HALLUCINÁCIÓ TILALOM:
- A schema_code és llms_txt KIZÁRÓLAG a HTML forráskódban TÉNYLEGESEN MEGTALÁLHATÓ információkat tartalmazhatja
- Ha nem látsz asztalfoglalást → acceptsReservations: false, NE írj foglalásról
- Ha nem látsz étlapot → NE adj hasMenu linket
- Ha nem látsz catering/rendezvény szolgáltatást → NE írd bele
- Placeholder adatok TILOSAK: "Budapest", "+36...", "Cím: ..." — ha nincs pontos adat, HAGYD KI a mezőt
- Inkább legyen rövidebb és 100% pontos, mint hosszabb és kitalált

Válasz: {"findings": [...], "schema_code": "JSON-LD string vagy null", "llms_txt": "string vagy null"}`,

  "synthesis-strengths": `${GLOBAL_RULES}
Te az erősségeket összegyűjtő agent vagy. Kapod az összes eddigi agent eredményét.
Adj 3 db KONKRÉT erősséget ami JÓL MŰKÖDIK. NEM banalitás ("a weboldal létezik") — hanem KONKRÉT pozitívum (pl. "HTTPS aktív és érvényes tanúsítvánnyal rendelkezik", "A GA4 analytics be van kötve").
Válasz: {"strengths": ["...", "...", "..."]}`,

  "synthesis-gaps-fixes": `${GLOBAL_RULES}
Te a hiányosságok és javítások agent vagy. Kapod az összes finding-et és a businessType-ot.
biggest_gaps: 3 db LEGNAGYOBB hiányosság üzleti hatás szerint priorizálva — MIT VESZÍT KONKRÉTAN formátumban (pl. "Online foglalás hiánya: az érdeklődők egy része versenytársat választ ahol azonnal lehet asztalt foglalni").
fastest_fixes: 3 db LEGGYORSABB javítás amit AZONNAL meg lehet csinálni (< 1 óra).

AI témájú hiányosság (llms.txt, AI crawler) SOHA NEM LEHET a biggest_gaps 1. vagy 2. eleme.

Priorizálás iparág alapján:
ÉTTEREM: foglalás > értékelések/review profil > helyi SEO (Google Business) > nyitvatartás schema > analytics > AI
WEBSHOP: HTTPS > fizetés biztonság > schema(Product) > kosár UX > AI
SZOLGÁLTATÓ: CTA > árazás > referenciák > schema(LocalBusiness) > analytics > AI
SZÁLLÁSHELY: foglalás CTA > értékelések > szezon tartalom > schema > AI
ÁLTALÁNOS: legsúlyosabb tech hiba > CTA > SEO alapok > schema > AI

Válasz: {"biggest_gaps": ["...", "...", "..."], "fastest_fixes": ["...", "...", "..."]}`,

  "synthesis-quickwins": `${GLOBAL_RULES}
Te a quick win priorizáló agent vagy. 3 quick win-t adj ÜZLETI PRIORITÁS sorrendben.
KÖTELEZŐ: legalább 1 geo + 1 seo + 1 technikai típusú.

AI-TÉMÁJÚ JAVASLAT (llms.txt, AI crawler) SOHA NEM LEHET AZ 1. VAGY 2. QUICK WIN. Ha AI témájú kerül be → csak 3. helyre, és csak ha nincs fontosabb seo/technikai probléma.

QUICK WIN SORREND — IPARÁGFÜGGŐ (a businessType alapján):
ÉTTEREM: 1) ha nincs online foglalás → ez KÖTELEZŐEN az 1. quick win (Quandoo/TheFork/Dishcult regisztráció) 2) ha van erős értékelési profil (Google/TripAdvisor) → ezt emeld ki a summary-ban; ha NINCS → ez a 2. quick win 3) legsúlyosabb technikai hiba (sitemap/meta/schema)
WEBSHOP: 1) HTTPS/fizetési biztonság 2) schema(Product) 3) technikai SEO hiba
SZOLGÁLTATÓ: 1) CTA/árazás javítás 2) tech hiba (sitemap/meta) 3) schema/strukturált adat
SZÁLLÁSHELY: 1) foglalás CTA 2) értékelések/képek 3) technikai SEO
ÜGYNÖKSÉG: 1) portfolio/case study 2) CTA 3) E-E-A-T (csapatbemutató)
ÁLTALÁNOS: 1) legsúlyosabb tech hiba 2) CTA/konverzió 3) SEO alapok

cost mező: TILOS "0 Ft", "ingyenes" — HELYETTE: "belső erőforrással elvégezhető" VAGY "külső fejlesztővel: minimális"

Válasz: {"quick_wins": [{"title":"...","who":"Ki csinálja","time":"Mennyi idő","cost":"Mennyibe kerül","type":"geo/seo/technikai"}, ...]}`,

  "synthesis-layman": `${GLOBAL_RULES}
Te a laikus összefoglaló agent vagy. Írj 3-5 mondatos közérthető összefoglalót NEM TECHNIKAI embernek.
TILOS használni: "canonical URL", "robots.txt", "schema markup", "JSON-LD", "meta tag", "sitemap".
HELYETTE: "a Google nehezebben találja meg az oldalát", "a keresőoptimalizálás hiányos", "az AI keresők nem látják az oldalt".
Válasz: {"layman_summary": "3-5 mondat magyarul"}`,

  "synthesis-categories": `${GLOBAL_RULES}
Te a score kategória bontó agent vagy. A technicalScan alapján adj kategória bontást.

Minden kategóriához KÖTELEZŐ formátum:
{"name": "Kategória név", "score": 0-100, "boost": "Konkrét pozitívum az oldalon", "drag": "Konkrét hiányosság", "quick_fix": "1 konkrét javítási lépés (idő + költség)"}

geo_categories (6 db): AI Citability, Brand Authority, Tartalom & E-E-A-T, Technikai alapok, Strukturált adatok, Platform optimalizálás
seo_categories (4 db): Technikai egészség, Tartalom relevancia, Teljesítmény, Autoritás

Válasz: {"geo_categories": [...], "seo_categories": [...]}`,
};

async function callAgent(agentName: string, input: Record<string, any>, auditLevel = "szint1"): Promise<any> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.error(`[callAgent] ANTHROPIC_API_KEY is not set!`);
    throw new Error("ANTHROPIC_API_KEY environment variable is missing");
  }
  const systemPrompt = AGENT_PROMPTS[agentName];
  if (!systemPrompt) throw new Error(`Unknown agent: ${agentName}`);

  const model = "claude-haiku-4-5-20251001";
  const maxTokens = 1500;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: JSON.stringify(input) }],
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error(`[callAgent] API ERROR for ${agentName}: status=${res.status}, error=${JSON.stringify(data)}`);
    throw new Error(`Anthropic API error ${res.status}: ${data?.error?.message || JSON.stringify(data)}`);
  }

  const text = data.content?.[0]?.text || "{}";
  const tokensUsed = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);

  try {
    const cleaned = text.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    return { ...JSON.parse(cleaned), tokensUsed };
  } catch {
    console.error(`Agent ${agentName} invalid JSON:`, text.substring(0, 200));
    return { findings: [], tokensUsed };
  }
}

function deduplicateFindings(findings: any[]): any[] {
  const sevOrder: Record<string, number> = { "KRITIKUS": 3, "MAGAS": 2, "KÖZEPES": 1 };
  const sorted = [...findings].sort((a, b) => (sevOrder[b.severity] || 0) - (sevOrder[a.severity] || 0));

  const extractTopic = (title: string): string => {
    const lower = (title || "").toLowerCase();
    if (lower.includes("schema") || lower.includes("strukturált") || lower.includes("json-ld")) return "schema";
    if (lower.includes("canonical")) return "canonical";
    if (lower.includes("sitemap")) return "sitemap";
    if (lower.includes("cookie") || lower.includes("gdpr") || lower.includes("hozzájárulás") || lower.includes("süti") || lower.includes("adatvéd") || lower.includes("privacy")) return "cookie_gdpr_privacy";
    if (lower.includes("impresszum") || lower.includes("ászf") || lower.includes("jogi dokumentum")) return "legal_docs";
    if (lower.includes("ga4") || lower.includes("analytics") || lower.includes("gtm") || lower.includes("tag manager") || lower.includes("követőkód") || lower.includes("webanalitika") || lower.includes("mérés")) return "analytics";
    if (lower.includes("meta") && (lower.includes("title") || lower.includes("description") || lower.includes("leírás") || lower.includes("adat"))) return "meta";
    if (lower.includes("robots") || lower.includes("crawler") || lower.includes("ai keres") || lower.includes("ai-specifikus") || lower.includes("ai seo")) return "ai_crawler";
    if (lower.includes("foglalás") || lower.includes("reservation") || lower.includes("booking") || lower.includes("rendelés")) return "booking";
    if (lower.includes("alt") && (lower.includes("text") || lower.includes("szöveg"))) return "alt_text";
    if (lower.includes("heading") || lower.includes("h1") || lower.includes("címsor")) return "headings";
    if (lower.includes("llms.txt") || lower.includes("llms txt")) return "llms_txt";
    if (lower.includes("cta") || lower.includes("konverzió") || lower.includes("gomb")) return "cta";
    if (lower.includes("kontakt") || lower.includes("kapcsolat") || lower.includes("elérhetőség") || lower.includes("contact")) return "contact_info";
    if (lower.includes("pixel") || lower.includes("retargeting") || lower.includes("facebook")) return "retargeting";
    if (lower.includes("open graph") || lower.includes("og ")) return "open_graph";
    if (lower.includes("bizalm") || lower.includes("testimonial") || lower.includes("értékelés") || lower.includes("review") || lower.includes("trust")) return "trust";
    if (lower.includes("hírlevél") || lower.includes("newsletter") || lower.includes("email market") || lower.includes("can-spam") || lower.includes("email szabályoz")) return "email_marketing";
    if (lower.includes("fizetés") || lower.includes("payment") || lower.includes("pci")) return "payment";
    if (lower.includes("helyi") && lower.includes("seo") || lower.includes("local seo")) return "local_seo";
    if (lower.includes("tartalom") || lower.includes("e-e-a-t")) return "content";
    if (lower.includes("értékajánlat")) return "value_prop";
    if (lower.includes("sürgető") || lower.includes("akció")) return "urgency";
    return "unique_" + lower.replace(/[^a-záéíóöőúüű]/g, "").substring(0, 25);
  };

  const seenTopics = new Set<string>();
  const result: any[] = [];
  for (const f of sorted) {
    const topic = extractTopic(f.title);
    if (!seenTopics.has(topic)) {
      seenTopics.add(topic);
      result.push(f);
    }
  }
  return result;
}

async function runAllAgents(
  technicalScan: TechnicalScan,
  rawHtml: string, businessType: string, domain: string, brandName: string,
  auditLevel: string, geoScore: number, seoScore: number,
  perplexityResults?: any
): Promise<any> {
  const rawFindings: any[] = [];
  let totalTokens = 0;

  const al = auditLevel;

  // === BATCH 1: GEO-FIRST — 5 parallel agents ===
  const [r1, r2, r3, r4, r5] = await Promise.all([
    // GEO AI visibility — with Perplexity real data
    callAgent("geo-ai-visibility", {
      technicalScan,
      domain,
      businessType,
      brandName,
      perplexityResults: perplexityResults || null,
    }, al),
    // Platform-specific scoring (5 AI platforms)
    callAgent("geo-platform-analysis", { technicalScan, domain, businessType }, al),
    // Technical GEO (canonical, meta, sitemap, AI crawlers evidence)
    callAgent("geo-technical", { technicalScan, domain }, al),
    // Content quality + E-E-A-T + passage quality
    callAgent("geo-content", {
      html: rawHtml.substring(0, 5000),
      businessType,
      passage_quality: technicalScan.passage_quality,
      entity_signals: technicalScan.entity_signals,
    }, al),
    // Schema + llms.txt generation
    callAgent("geo-schema", { schema_markup: technicalScan.schema_markup, businessType, domain, brandName, llms_txt: technicalScan.llms_txt }, al),
  ]);

  for (const r of [r1, r2, r3, r4, r5]) {
    rawFindings.push(...(r.findings || []));
    totalTokens += r.tokensUsed || 0;
  }

  // Deduplication — filter similar titles, keep higher severity
  const allFindings = deduplicateFindings(rawFindings);

  // === BATCH 2: SYNTHESIS — strengths + gaps/fixes + categories in parallel ===
  const [r9, r10, r13] = await Promise.all([
    callAgent("synthesis-strengths", { allResults: { r1, r2, r3, r4, r5 }, technicalScan, businessType }, al),
    callAgent("synthesis-gaps-fixes", { findings: allFindings, businessType }, al),
    callAgent("synthesis-categories", { technicalScan, businessType, seoScore }, al),
  ]);
  totalTokens += (r9.tokensUsed || 0) + (r10.tokensUsed || 0) + (r13.tokensUsed || 0);

  // === BATCH 3: QUICKWINS + LAYMAN (needs previous results) ===
  const [r11, r12] = await Promise.all([
    callAgent("synthesis-quickwins", { findings: allFindings, businessType }, al),
    callAgent("synthesis-layman", {
      strengths: r9.strengths, biggest_gaps: r10.biggest_gaps,
      findings: allFindings, businessType,
    }, al),
  ]);
  totalTokens += (r11.tokensUsed || 0) + (r12.tokensUsed || 0);

  return {
    findings: allFindings,
    strengths: r9.strengths || [],
    biggest_gaps: r10.biggest_gaps || [],
    fastest_fixes: r10.fastest_fixes || [],
    quick_wins: r11.quick_wins || [],
    layman_summary: r12.layman_summary || "",
    schema_code: r5.schema_code || null,
    llms_txt: r5.llms_txt || null,
    geo_categories: r13.geo_categories || [],
    seo_categories: r13.seo_categories || [],
    platform_scores: r2.platform_scores || {},
    ai_citability_score: r1.ai_citability_score || 0,
    brand_authority_score: r1.brand_authority_score || 0,
    perplexity_results: perplexityResults || null,
    llms_txt_status: technicalScan.llms_txt || { found: false, has_full: false, size: null },
    passage_quality: technicalScan.passage_quality || {},
    entity_signals: technicalScan.entity_signals || {},
    tokensUsed: totalTokens,
  };
}

// ═══ VALIDATOR ═══
function validateAuditJson(data: any): { passed: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!data.findings?.length) errors.push("Hiányzó findings");
  if (!data.quick_wins?.length || data.quick_wins.length < 3) errors.push("Minimum 3 quick win kell");
  if (data.quick_wins?.every((q: any) => {
    const t = (q.type || "").toLowerCase();
    return t.includes("technikai") || t.includes("tech");
  })) errors.push("Quick wins: nem lehet mind technikai");

  // Tiltott kifejezések AUTO-REPLACE (nem fail-el, hanem javít)
  // A sanitizeForbiddenPhrases() már lefutott a validate ELŐTT
  return { passed: errors.length === 0, errors };
}


// ═══ INLINE HANDLEBARS RENDERER (no external deps) ═══════════════════════════
// Handles: {{var}}, {{{var}}}, {{#each}}, {{#if (gte a b)}}, {{#if var}},
//          {{else}}, {{/if}}, {{/each}}, {{lookup arr n}}, {{@index}}
// NOTE: No nested #if/#each support needed — pre-compute complex expressions
//       in templateData instead.
function renderHbs(tmpl: string, data: Record<string, any>): string {
  function gv(obj: any, path: string): any {
    if (!path || path === "this") return obj;
    return path.split(".").reduce((o: any, k: string) => (o != null ? o[k] : ""), obj) ?? "";
  }
  function esc(v: any): string {
    return String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }
  function evalCond(c: string, ctx: any): boolean {
    const m = c.trim().match(/^\(gte\s+([\w.]+)\s+([\w.]+)\)$/);
    if (m) {
      const av = Number(isNaN(+m[1]) ? gv(ctx, m[1]) : m[1]);
      const bv = Number(isNaN(+m[2]) ? gv(ctx, m[2]) : m[2]);
      return av >= bv;
    }
    return !!gv(ctx, c.trim());
  }
  function p(t: string, ctx: any): string {
    t = t.replace(/\{\{\{([\w.]+)\}\}\}/g, (_: string, k: string) => String(gv(ctx, k)));
    t = t.replace(/\{\{#each ([\w.]+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (_: string, key: string, body: string) => {
      const arr = gv(ctx, key); if (!Array.isArray(arr)) return "";
      return arr.map((item: any, i: number) => {
        const c2 = { ...ctx, ...(item && typeof item === "object" ? item : { this: item }),
          "@index": i, "@first": i===0, "@last": i===arr.length-1 };
        return p(body, c2);
      }).join("");
    });
    t = t.replace(/\{\{#unless ([\w.]+)\}\}([\s\S]*?)\{\{\/unless\}\}/g, (_: string, k: string, body: string) =>
      !gv(ctx, k) ? p(body, ctx) : "");
    t = t.replace(/\{\{#if ([^}]+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g,
      (_: string, c3: string, ib: string, eb: string = "") => evalCond(c3, ctx) ? p(ib, ctx) : p(eb, ctx));
    t = t.replace(/\{\{lookup ([\w.]+) (\d+)\}\}/g, (_: string, k: string, i: string) => {
      const arr = gv(ctx, k); return Array.isArray(arr) ? esc(arr[+i]) : "";
    });
    t = t.replace(/\{\{@([\w]+)\}\}/g, (_: string, k: string) => String(ctx["@"+k] ?? ""));
    t = t.replace(/\{\{([^#\/!>@{][^}]*)\}\}/g, (_: string, k: string) => esc(gv(ctx, k.trim())));
    return t;
  }
  return p(tmpl, data);
}

// ═══ PDF GENERATION ═══
async function generatePDFWithPDFBolt(auditJson: any, config: any): Promise<Uint8Array> {
  const apiKey = Deno.env.get("PDFBOLT_API_KEY")!;

  const templateData = {
    // Alap adatok
    domain: auditJson.domain || "",
    brand_name: auditJson.brand_name || auditJson.domain || "",
    date: auditJson.date || new Date().toISOString().split("T")[0],
    audit_level: auditJson.audit_level || "szint1",
    business_type: auditJson.business_type || "Általános",

    // Score-ok + pre-computed color classes
    geo_score: auditJson.geo_score || 0,
    geo_color: (auditJson.geo_score || 0) < 40 ? "gc-red" : (auditJson.geo_score || 0) < 75 ? "gc-yellow" : "gc-green",
    seo_score: auditJson.seo_score || 0,
    seo_color: (auditJson.seo_score || 0) < 40 ? "gc-red" : (auditJson.seo_score || 0) < 75 ? "gc-yellow" : "gc-green",

    // Összefoglaló
    strengths: auditJson.strengths || [],
    biggest_gaps: auditJson.biggest_gaps || [],
    fastest_fixes: auditJson.fastest_fixes || [],
    layman_summary: auditJson.layman_summary || "",

    // Findings
    findings: (auditJson.findings || []).map((f: any) => ({
      severity: f.severity || "",
      tag: f.tag || "",
      title: f.title || "",
      border_class: f.severity === "KRITIKUS" ? "f-critical" : f.severity === "MAGAS" ? "f-high" : "f-medium",
      sev_class: f.severity === "KRITIKUS" ? "b-critical" : f.severity === "MAGAS" ? "b-high" : "b-medium",
      evidence: f.evidence || "",
      why_problem: f.why_problem || "",
      business_impact: f.business_impact || "",
      fix: f.fix || "",
      fix_effort: f.fix_effort || "",
      priority: f.priority || "",
    })),
    // Pre-sliced findings for specific pages
    findings_p2: (auditJson.findings || []).slice(0, 2).map((f: any) => ({
      severity: f.severity || "",
      tag: f.tag || "",
      title: f.title || "",
      border_class: f.severity === "KRITIKUS" ? "f-critical" : f.severity === "MAGAS" ? "f-high" : "f-medium",
      sev_class: f.severity === "KRITIKUS" ? "b-critical" : f.severity === "MAGAS" ? "b-high" : "b-medium",
      evidence: f.evidence || "",
      why_problem: f.why_problem || "",
      business_impact: f.business_impact || "",
      fix: f.fix || "",
      fix_effort: f.fix_effort || "",
      priority: f.priority || "",
    })),
    findings_p3: (auditJson.findings || []).slice(2, 6).map((f: any) => ({
      severity: f.severity || "",
      tag: f.tag || "",
      title: f.title || "",
      border_class: f.severity === "KRITIKUS" ? "f-critical" : f.severity === "MAGAS" ? "f-high" : "f-medium",
      sev_class: f.severity === "KRITIKUS" ? "b-critical" : f.severity === "MAGAS" ? "b-high" : "b-medium",
      evidence: f.evidence || "",
      why_problem: f.why_problem || "",
      business_impact: f.business_impact || "",
      fix: f.fix || "",
      fix_effort: f.fix_effort || "",
      priority: f.priority || "",
    })),

    // Quick wins
    quick_wins: (auditJson.quick_wins || []).map((q: any, i: number) => ({
      number: i + 1,
      title: q.title || "",
      description: q.description || "",
      who: q.who || "",
      time: q.time || "",
      cost: q.cost || "",
    })),

    // Platform scores (5 AI platform)
    platform_scores: auditJson.platform_scores || {},
    platform_scores_list: (() => {
      const ps = auditJson.platform_scores || {};
      return [
        { name: "ChatGPT", score: ps.chatgpt || 0, color: (ps.chatgpt||0) < 40 ? "fill-red" : (ps.chatgpt||0) < 75 ? "fill-yellow" : "fill-green" },
        { name: "Perplexity", score: ps.perplexity || 0, color: (ps.perplexity||0) < 40 ? "fill-red" : (ps.perplexity||0) < 75 ? "fill-yellow" : "fill-green" },
        { name: "Google AI", score: ps.google_ai || 0, color: (ps.google_ai||0) < 40 ? "fill-red" : (ps.google_ai||0) < 75 ? "fill-yellow" : "fill-green" },
        { name: "Gemini", score: ps.gemini || 0, color: (ps.gemini||0) < 40 ? "fill-red" : (ps.gemini||0) < 75 ? "fill-yellow" : "fill-green" },
        { name: "Bing Copilot", score: ps.bing_copilot || 0, color: (ps.bing_copilot||0) < 40 ? "fill-red" : (ps.bing_copilot||0) < 75 ? "fill-yellow" : "fill-green" },
      ];
    })(),

    // Perplexity real measurement
    perplexity_cited_count: auditJson.perplexity_results?.cited_count || 0,
    perplexity_total_queries: auditJson.perplexity_results?.total_queries || 5,
    perplexity_has_data: !!(auditJson.perplexity_results?.total_queries),
    perplexity_label: (() => {
      const r = auditJson.perplexity_results;
      if (!r || !r.total_queries) return "🔍 Nem mérve (API kulcs szükséges)";
      if (r.cited_count === 0) return "❌ Nem idézi a Perplexity";
      if (r.cited_count >= 3) return `✅ ${r.cited_count}/${r.total_queries} lekérdezésnél idéz`;
      return `⚠️ ${r.cited_count}/${r.total_queries} lekérdezésnél idéz`;
    })(),

    // llms.txt status
    llms_txt_found: !!(auditJson.llms_txt_status?.found),
    llms_txt_label: auditJson.llms_txt_status?.found
      ? `✅ DETEKTÁLT (${auditJson.llms_txt_status?.size || 0} karakter${auditJson.llms_txt_status?.has_full ? " + llms-full.txt is megvan" : ""})`
      : "❌ NEM DETEKTÁLT",

    // Passage quality
    passage_avg_words: auditJson.passage_quality?.avg_words_per_section || 0,
    passage_optimal: auditJson.passage_quality?.optimal_sections || 0,
    passage_total: auditJson.passage_quality?.total_sections || 0,
    passage_label: (() => {
      const avg = auditJson.passage_quality?.avg_words_per_section || 0;
      if (avg === 0) return "🔍 Nem mérve";
      if (avg >= 120 && avg <= 200) return `✅ ${avg} szó/szekció (optimális: 134–167)`;
      if (avg < 80) return `❌ ${avg} szó/szekció — túl rövid (optimum: 134–167)`;
      return `⚠️ ${avg} szó/szekció (optimum: 134–167)`;
    })(),

    // Entity signals
    entity_has_author: !!(auditJson.entity_signals?.has_author),
    entity_has_date: !!(auditJson.entity_signals?.has_date),
    entity_has_stats: !!(auditJson.entity_signals?.has_stats),
    entity_faq: !!(auditJson.entity_signals?.faq_detected),
    entity_label: (() => {
      const es = auditJson.entity_signals || {};
      const count = [es.has_author, es.has_date, es.has_stats].filter(Boolean).length;
      return count >= 3 ? "✅ Erős entitás jelek" : count >= 2 ? "⚠️ Részleges entitás jelek" : "❌ Gyenge entitás jelek";
    })(),

    // AI Citability score
    ai_citability_score: auditJson.ai_citability_score || 0,
    brand_authority_score: auditJson.brand_authority_score || 0,

    // AI Crawlers list (template page 2 grid)
  ai_crawlers_list: (() => {
    const ac = (auditJson.technical_scan?.robots_txt?.aiCrawlers || {}) as Record<string, string>;
    const entries = Object.entries(ac);
    if (entries.length === 0) {
      return [
        "GPTBot","ChatGPT-User","Google-Extended","Googlebot","Bingbot",
        "PerplexityBot","ClaudeBot","Anthropic-ai","cohere-ai",
        "Meta-ExternalAgent","Meta-ExternalFetcher","Bytespider","CCBot","Applebot"
      ].map(name => ({ name, status_short: "N/A", bg: "#f1f5f9", fg: "#64748b" }));
    }
    return entries.map(([name, status]) => ({
      name,
      status_short: status === "blocked" ? "TILTOTT" : status === "allowed" ? "OK" : "N/A",
      bg: status === "blocked" ? "#fee2e2" : status === "allowed" ? "#dcfce7" : "#f1f5f9",
      fg: status === "blocked" ? "#991b1b" : status === "allowed" ? "#166534" : "#64748b",
    }));
  })(),

  // Category breakdown (score bars, pre-computed colors)
    geo_categories: (auditJson.geo_categories || []).map((c: any) => ({...c, color: (c.score||0) < 40 ? "fill-red" : (c.score||0) < 75 ? "fill-yellow" : "fill-green"})),
    seo_categories: (auditJson.seo_categories || []).map((c: any) => ({...c, label: c.name || c.label || "", color: (c.score||0) < 40 ? "fill-red" : (c.score||0) < 75 ? "fill-yellow" : "fill-green"})),

    // Pre-computed status labels
    geo_status_label: (auditJson.geo_score || 0) >= 70 ? "✅ Jó" : (auditJson.geo_score || 0) >= 45 ? "⚠️ Fejlesztendő" : "🔴 Kritikus",
    seo_status_label: (auditJson.seo_score || 0) >= 70 ? "✅ Jó" : (auditJson.seo_score || 0) >= 45 ? "⚠️ Fejlesztendő" : "🔴 Kritikus",

    // GEO Score methodology — 6 dimensions
    score_methodology: (() => {
      const ts = auditJson.technical_scan || {};
      const c = (s: number) => s < 40 ? "fill-red" : s < 75 ? "fill-yellow" : "fill-green";
      const crawlerVals = Object.values(ts.robots_txt?.aiCrawlers || {}) as string[];
      const crawlerPct = crawlerVals.length > 0 ? Math.round(crawlerVals.filter((v: string) => v !== "blocked").length / crawlerVals.length * 100) : 50;
      const aiCitab = Math.round(
        (crawlerPct * 0.3) +
        ((ts.llms_txt?.found ? 1 : 0) * 20) +
        (Math.min((ts.passage_quality?.optimal_sections || 0) / Math.max(ts.passage_quality?.total_sections || 1, 1) * 10, 10)) +
        ((ts.entity_signals?.faq_detected ? 1 : 0) * 5)
      );
      const brandAuth = Math.round(
        ((ts.entity_signals?.has_author ? 1 : 0) * 7) +
        ((ts.entity_signals?.has_date ? 1 : 0) * 5) +
        ((ts.entity_signals?.has_stats ? 1 : 0) * 5) +
        ((ts.entity_signals?.entity_count_estimate || 0) >= 15 ? 3 : 0)
      );
      const contentQ = Math.round(
        ((ts.meta_description?.found ? 1 : 0) * 5) +
        ((ts.headings?.h1 || 0) >= 1 ? 5 : 0) +
        ((ts.images?.total === 0 || (ts.images?.withAlt || 0) / Math.max(ts.images?.total || 1, 1) >= 0.8 ? 5 : 0)) +
        ((ts.lang_attr ? 1 : 0) * 5)
      );
      const techBase = Math.round(((ts.https ? 5 : 0) + (ts.canonical?.found ? 3 : 0) + (ts.sitemap?.found ? 4 : 0) + (ts.robots_txt?.found ? 3 : 0)));
      const structData = Math.round(((ts.schema_markup?.found ? 5 : 0) + ((ts.schema_markup?.types?.length || 0) > 1 ? 3 : 0) + ((ts.schema_markup?.fieldsCount || 0) > 5 ? 2 : 0)));
      const platfOpt = Math.round(((ts.open_graph?.found ? 4 : 0) + (ts.meta_title?.found ? 3 : 0) + (ts.viewport ? 3 : 0)));
      return [
        { label: "AI Citability & Visibility", weight: 25, score: Math.min(aiCitab, 100), color: c(Math.min(aiCitab, 100)) },
        { label: "Brand Authority jelek", weight: 20, score: Math.min(brandAuth * 5, 100), color: c(Math.min(brandAuth * 5, 100)) },
        { label: "Tartalom & E-E-A-T", weight: 20, score: contentQ * 5, color: c(contentQ * 5) },
        { label: "Technikai alapok", weight: 15, score: Math.min(techBase * 6, 100), color: c(Math.min(techBase * 6, 100)) },
        { label: "Strukturált adatok", weight: 10, score: structData * 10, color: c(structData * 10) },
        { label: "Platform optimalizálás", weight: 10, score: platfOpt * 10, color: c(platfOpt * 10) },
      ];
    })(),

    // Technical appendices — szint1: empty (upsell hook), szint2: real code
    schema_code: auditJson.audit_level === "szint2" ? (auditJson.schema_code || "") : "",
    llms_txt: auditJson.audit_level === "szint2" ? (auditJson.llms_txt || "") : "",

    // Config (white-label)
    company_name: config.company_name || "WebLelet",
    company_tagline: config.company_tagline || "",
    contact_email: config.contact_email || "",
    contact_website: config.contact_website || "",
    primary_color: config.primary_color || "#2563EB",
  };

  // Server-side inline rendering — zero external dependencies
  const renderedHtml = renderHbs(PDF_TEMPLATE, templateData);
  const templateB64 = btoa(unescape(encodeURIComponent(renderedHtml)));

  const res = await fetch("https://api.pdfbolt.com/v1/direct", {
    method: "POST",
    headers: { "API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      html: templateB64,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`PDFBolt hiba: ${res.status} — ${errorText}`);
  }

  return new Uint8Array(await res.arrayBuffer());
}

// ═══ MAIN HANDLER ═══
serve(async (req) => {
  try {
    const { auditId, url, audit_level, business_type } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || Deno.env.get("NEXT_PUBLIC_SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const updateStatus = async (status: string, extra?: Record<string, any>) => {
      await supabase.from("audits").update({ status, ...extra, updated_at: new Date().toISOString() }).eq("id", auditId);
    };

    const startTime = Date.now();

    // 1. FETCH
    await updateStatus("scanning");
    const mainRes = await safeFetch(url);
    if (!mainRes) throw new Error(`Nem sikerült letölteni: ${url}`);
    const html = mainRes.text;

    const subPages = await fetchSubPages(html, url);
    // Parallel fetches: robots.txt + sitemap + llms.txt
    const [robotsRes, sitemapRes, llmsTxtResult] = await Promise.all([
      safeFetch(new URL("/robots.txt", url).href),
      safeFetch(new URL("/sitemap.xml", url).href),
      fetchLlmsTxt(url),
    ]);
    const robotsTxt = robotsRes?.status === 200 ? robotsRes.text : null;

    // 2. TECHNICAL SCAN (with llms.txt data)
    const technicalScan = runTechnicalScan(html, url, robotsTxt, sitemapRes?.status || null, llmsTxtResult);

    // 3. PERPLEXITY VISIBILITY CHECK
    const perplexityResults = await checkPerplexityVisibility(
      new URL(url).hostname.replace("www.", ""),
      new URL(url).hostname.replace("www.", "").split(".")[0],
      business_type
    );

    // 4. SCORES
    const geoScore = calculateGeoScore(technicalScan);
    const seoScore = calculateSeoScore(technicalScan);

    await updateStatus("analyzing", {
      raw_html: html.substring(0, 100000),
      technical_scan: technicalScan,
      geo_score: geoScore,
      seo_score: seoScore,
    });

    // 4.5. PARTNER DATA + MODULES + EMAIL from DB
    const { data: auditRow } = await supabase
      .from("audits")
      .select("partner_data, modules, email")
      .eq("id", auditId)
      .single();
    const partnerData = auditRow?.partner_data || null;
    const modules = auditRow?.modules || null;
    const auditEmail = auditRow?.email || null;

    // 5. LLM AGENT ANALYSIS
    const domain = new URL(url).hostname.replace("www.", "");
    const brandName = domain.split(".")[0].charAt(0).toUpperCase() + domain.split(".")[0].slice(1);

    const agentResults = await runAllAgents(
      technicalScan, html, business_type, domain, brandName,
      audit_level, geoScore, seoScore, perplexityResults
    );

    // 6. BUILD JSON
    const auditJson = {
      url, domain, brand_name: brandName,
      date: new Date().toISOString().split("T")[0],
      business_type, audit_level,
      geo_score: geoScore, seo_score: seoScore,
      technical_scan: technicalScan,
      perplexity_results: perplexityResults,
      llms_txt_status: technicalScan.llms_txt,
      passage_quality: technicalScan.passage_quality,
      entity_signals: technicalScan.entity_signals,
      findings: agentResults.findings,
      strengths: agentResults.strengths,
      biggest_gaps: agentResults.biggest_gaps,
      fastest_fixes: agentResults.fastest_fixes,
      quick_wins: agentResults.quick_wins,
      layman_summary: agentResults.layman_summary,
      schema_code: agentResults.schema_code,
      llms_txt: agentResults.llms_txt,
      geo_categories: agentResults.geo_categories,
      seo_categories: agentResults.seo_categories,
      platform_scores: agentResults.platform_scores,
    };

    // 7. SANITIZE + VALIDATE
    await updateStatus("validating");
    const sanitized = sanitizeForbiddenPhrases(auditJson);
    Object.assign(auditJson, sanitized);
    const validation = validateAuditJson(auditJson);

    if (!validation.passed) {
      // Retry: rerun synthesis agents only (faster than all)
      const retryR10 = await callAgent("synthesis-gaps-fixes", { findings: agentResults.findings, businessType: business_type });
      const retryR11 = await callAgent("synthesis-quickwins", { findings: agentResults.findings, businessType: business_type });
      auditJson.biggest_gaps = retryR10.biggest_gaps || auditJson.biggest_gaps;
      auditJson.fastest_fixes = retryR10.fastest_fixes || auditJson.fastest_fixes;
      auditJson.quick_wins = retryR11.quick_wins || auditJson.quick_wins;

      const retryValidation = validateAuditJson(auditJson);
      if (!retryValidation.passed) {
        // szint1 (public free audit): don't stop, generate PDF with existing data
        if (audit_level === "szint1") {
          console.warn("szint1 validation warning (continuing to PDF):", retryValidation.errors.join("; "));
        } else {
          await updateStatus("failed", { audit_json: auditJson, validation_result: retryValidation, error_message: retryValidation.errors.join("; ") });
          return new Response(JSON.stringify({ error: "Validation failed after retry" }), { status: 500 });
        }
      }
    }

    await updateStatus("generating", {
      audit_json: auditJson,
      validation_result: { passed: true, errors: [] },
      llm_tokens_used: agentResults.tokensUsed,
    });

    // 8. PDF
    const config = {
      company_name: "WebLelet", company_tagline: "AI-alapú weboldal elemző rendszer",
      primary_color: "#2563EB", accent_color: "#F59E0B",
      contact_email: "info@weblelet.hu", contact_website: "https://weblelet.hu",
    };

    // Try to load config from DB
    const { data: dbConfig } = await supabase.from("audit_config").select("*").limit(1).single();
    if (dbConfig) Object.assign(config, dbConfig);

    const pdfBuffer = await generatePDFWithPDFBolt(auditJson, config);

    // 9. UPLOAD PDF
    const pdfFileName = `${domain}-${auditJson.date}.pdf`;
    await supabase.storage.from("audit-pdfs").upload(pdfFileName, pdfBuffer, { contentType: "application/pdf", upsert: true });

    // 10. DONE
    await updateStatus("completed", {
      pdf_path: pdfFileName,
      pdf_generated_at: new Date().toISOString(),
      processing_time_ms: Date.now() - startTime,
    });

    // 11. MAKE.COM WEBHOOK — PDF delivery notification
    const makeWebhookUrl = Deno.env.get("MAKE_WEBHOOK_URL");
    if (makeWebhookUrl && auditEmail) {
      try {
        // Signed URL generation (1 hour validity)
        const { data: signedUrlData } = await supabase.storage
          .from("audit-pdfs")
          .createSignedUrl(pdfFileName, 3600);

        const pdfSignedUrl = signedUrlData?.signedUrl || null;

        await fetch(makeWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            auditId,
            email: auditEmail,
            domain,
            url,
            audit_level,
            pdf_signed_url: pdfSignedUrl,
            pdf_path: pdfFileName,
            geo_score: geoScore,
            seo_score: seoScore,
          }),
        });
      } catch (webhookErr) {
        console.error("Make.com webhook hiba (nem kritikus):", (webhookErr as Error).message);
      }
    }

    return new Response(JSON.stringify({ success: true, auditId }), { status: 200 });

  } catch (error) {
    try {
      const { auditId } = await req.clone().json();
      if (auditId) {
        const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        await supabase.from("audits").update({ status: "failed", error_message: (error as Error).message, updated_at: new Date().toISOString() }).eq("id", auditId);
      }
    } catch { /* ignore */ }
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500 });
  }
});
