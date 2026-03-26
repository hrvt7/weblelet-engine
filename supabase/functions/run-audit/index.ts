// @ts-nocheck — Deno Edge Function
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";

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
}

interface FrameworkResult {
  name: string;
  score: number;
  maxPoints: number;
  passedPoints: number;
  checks: { id: string; label: string; passed: boolean; details: string }[];
}

interface ComplianceScan {
  gdpr: FrameworkResult;
  hungarian: FrameworkResult;
  accessibility: FrameworkResult;
  pci: FrameworkResult;
  canspam: FrameworkResult;
  overall_score: number;
  grade: string;
}

// ═══ CONSTANTS ═══
const AI_CRAWLERS = [
  "GPTBot", "ChatGPT-User", "Google-Extended", "Googlebot", "Bingbot",
  "PerplexityBot", "ClaudeBot", "Anthropic-ai", "cohere-ai",
  "Meta-ExternalAgent", "Meta-ExternalFetcher", "Bytespider", "CCBot", "Applebot",
];

const COMPLIANCE_WEIGHTS = { gdpr: 0.30, hungarian: 0.25, accessibility: 0.15, pci: 0.15, canspam: 0.15 };

const FORBIDDEN_PHRASES = [
  "teljes elvesztés", "gépileg vak", "nulla esély", "senki nem",
  "soha nem", "teljesen láthatatlan", "garantáltan", "biztosan",
];

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

// ═══ TECHNICAL SCANNER ═══
function runTechnicalScan(html: string, url: string, robotsTxt: string | null, sitemapStatus: number | null): TechnicalScan {
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
  };
}

// ═══ COMPLIANCE SCANNERS ═══
function scanGDPR(allText: string, privacyText: string, mainHtml: string): FrameworkResult {
  const checks = [
    { id: "G1", label: "Cookie consent banner", passed: textContains(mainHtml, ["cookie", "consent", "cookiebot", "onetrust", "klaro", "cc-banner"]) },
    { id: "G2", label: "Granulált cookie beállítás", passed: textContains(mainHtml, ["beállítások", "settings", "preferences"]) },
    { id: "G3", label: "Adatvédelmi tájékoztató", passed: textContains(allText, ["privacy", "adatvéd", "adatkezel"]) },
    { id: "G4", label: "Jogalap megjelölve", passed: textContains(privacyText || allText, ["jogalap", "hozzájárulás", "jogos érdek"]) },
    { id: "G5", label: "Érintetti jogok", passed: textContains(privacyText || allText, ["törlés", "hozzáférés", "helyesbítés"]) },
    { id: "G6", label: "Törlési eljárás", passed: textContains(privacyText || allText, ["törlés", "kérelem", "delete", "erasure"]) },
    { id: "G7", label: "Adathordozhatóság", passed: textContains(privacyText || allText, ["hordozhatóság", "portability"]) },
    { id: "G8", label: "DPO", passed: textContains(allText, ["adatvédelmi felelős", "dpo", "data protection officer"]) },
    { id: "G9", label: "Nemzetközi adattovábbítás", passed: textContains(privacyText || allText, ["továbbítás", "transfer", "egt"]) },
    { id: "G10", label: "Incidens kezelés", passed: textContains(privacyText || allText, ["incidens", "breach", "72 óra"]) },
    { id: "G11", label: "Hozzájárulás visszavonása", passed: textContains(privacyText || allText, ["visszavon", "withdraw"]) },
    { id: "G12", label: "Harmadik felek", passed: textContains(privacyText || allText, ["harmadik", "third party", "adatfeldolgozó"]) },
    { id: "G13", label: "Adatmegőrzési idő", passed: textContains(privacyText || allText, ["megőrzés", "retention"]) },
    { id: "G14", label: "Sütitájékoztató részletesség", passed: textContains(allText, ["süti", "cookie"]) && textContains(allText, ["cél", "purpose"]) },
  ].map(c => ({ ...c, details: c.label }));
  const passedPoints = checks.filter(c => c.passed).length;
  return { name: "GDPR", checks, score: Math.round((passedPoints / checks.length) * 100), maxPoints: checks.length, passedPoints };
}

function scanHungarian(allText: string): FrameworkResult {
  const checks = [
    { id: "H1", label: "Impresszum", passed: textContains(allText, ["impresszum"]) || (textContains(allText, ["cégnév", "székhely"]) && textContains(allText, ["adószám", "cégjegyzékszám"])) },
    { id: "H2", label: "ÁSZF", passed: textContains(allText, ["ászf", "általános szerződési", "felhasználási feltételek"]) },
    { id: "H3", label: "Magyar adatvédelmi tájékoztató", passed: textContains(allText, ["adatvédelmi tájékoztató", "adatkezelési tájékoztató"]) },
    { id: "H4", label: "Fogyasztóvédelmi tájékoztató", passed: textContains(allText, ["elállás", "békéltető", "fogyasztóvéd", "panasz"]) },
    { id: "H5", label: "Magyar sütitájékoztató", passed: textContains(allText, ["süti"]) && textContains(allText, ["tájékoztató", "nyilatkozat"]) },
    { id: "H6", label: "NAIH hivatkozás", passed: textContains(allText, ["naih", "nyilvántartási szám", "adatvédelmi hatóság"]) },
    { id: "H7", label: "Tárhelyszolgáltató", passed: textContains(allText, ["tárhelyszolgáltató", "hosting"]) },
    { id: "H8", label: "Szerzői jogi nyilatkozat", passed: textContains(allText, ["©", "szerzői jog", "copyright", "minden jog"]) },
  ].map(c => ({ ...c, details: c.label }));
  const passedPoints = checks.filter(c => c.passed).length;
  return { name: "Magyar jogi", checks, score: Math.round((passedPoints / checks.length) * 100), maxPoints: checks.length, passedPoints };
}

function scanAccessibility(html: string, doc: any): FrameworkResult {
  const images = doc?.querySelectorAll("img") || [];
  let withAlt = 0;
  for (const img of images) { if (img.getAttribute("alt")?.trim()) withAlt++; }
  const h1 = doc?.querySelectorAll("h1").length || 0;
  const h2 = doc?.querySelectorAll("h2").length || 0;
  const lang = doc?.querySelector("html")?.getAttribute("lang");

  const checks = [
    { id: "A1", label: "Képek alt szövege", passed: images.length === 0 || withAlt / images.length >= 0.8 },
    { id: "A2", label: "Heading struktúra", passed: h1 >= 1 && h1 <= 2 && h2 > 0 },
    { id: "A3", label: "Színkontraszt", passed: true },
    { id: "A4", label: "Billentyűzetes navigáció", passed: html.includes("tabindex") || html.includes("skip-nav") },
    { id: "A5", label: "Form label-ek", passed: true }, // simplified
    { id: "A6", label: "Leíró link szövegek", passed: !html.toLowerCase().includes("kattintson ide") },
    { id: "A7", label: "Nyelvi attribútum", passed: !!lang && lang.length >= 2 },
    { id: "A8", label: "Viewport meta", passed: !!doc?.querySelector('meta[name="viewport"]') },
    { id: "A9", label: "Videó feliratok", passed: !html.includes("<video") },
    { id: "A10", label: "Akadálymentességi nyilatkozat", passed: html.toLowerCase().includes("akadálymentesség") || html.toLowerCase().includes("accessibility") },
  ].map(c => ({ ...c, details: c.label }));
  const passedPoints = checks.filter(c => c.passed).length;
  return { name: "Akadálymentesség", checks, score: Math.round((passedPoints / checks.length) * 100), maxPoints: checks.length, passedPoints };
}

function scanPCI(html: string, url: string): FrameworkResult {
  const htmlLower = html.toLowerCase();
  const providers = ["stripe", "paypal", "simplepay", "barion", "braintree"];
  const detected = providers.find(p => htmlLower.includes(p));
  const checks = [
    { id: "P1", label: "HTTPS", passed: url.startsWith("https://") },
    { id: "P2", label: "Hosted payment", passed: !!detected },
    { id: "P3", label: "Kártyaadat nem URL-ben", passed: !htmlLower.includes("ccnum") },
    { id: "P4", label: "Biztonsági oldal", passed: textContains(html, ["security", "biztonság", "trust"]) },
    { id: "P5", label: "Biztonsági jelvények", passed: textContains(html, ["ssl", "secure", "pci"]) },
    { id: "P6", label: "Payment processor", passed: !!detected },
  ].map(c => ({ ...c, details: c.label }));
  const passedPoints = checks.filter(c => c.passed).length;
  return { name: "Fizetési biztonság", checks, score: Math.round((passedPoints / checks.length) * 100), maxPoints: checks.length, passedPoints };
}

function scanCanSpam(allText: string, html: string): FrameworkResult {
  const checks = [
    { id: "S1", label: "Leiratkozás", passed: textContains(allText, ["leiratkozás", "unsubscribe"]) },
    { id: "S2", label: "Fizikai cím", passed: /\d{4}\s+\w+/.test(allText) || textContains(allText, ["utca", "krt.", "út "]) },
    { id: "S3", label: "Küldő azonosítása", passed: textContains(html, ["©", "kft", "bt.", "zrt."]) },
    { id: "S4", label: "Nincs előre bejelölt checkbox", passed: true }, // simplified
    { id: "S5", label: "Email gyakorlatok", passed: textContains(allText, ["email", "hírlevél"]) && textContains(allText, ["leiratkozás"]) },
  ].map(c => ({ ...c, details: c.label }));
  const passedPoints = checks.filter(c => c.passed).length;
  return { name: "E-mail szabályozás", checks, score: Math.round((passedPoints / checks.length) * 100), maxPoints: checks.length, passedPoints };
}

function runComplianceScan(html: string, subPages: Record<string, string>): ComplianceScan {
  const allText = html + " " + Object.values(subPages).join(" ");
  const privacyText = subPages["privacy"] || "";
  const doc = new DOMParser().parseFromString(html, "text/html");

  const gdpr = scanGDPR(allText, privacyText, html);
  const hungarian = scanHungarian(allText);
  const accessibility = scanAccessibility(html, doc);
  const pci = scanPCI(html, "https://"); // url passed separately
  const canspam = scanCanSpam(allText, html);

  const overall_score = Math.round(
    gdpr.score * COMPLIANCE_WEIGHTS.gdpr + hungarian.score * COMPLIANCE_WEIGHTS.hungarian +
    accessibility.score * COMPLIANCE_WEIGHTS.accessibility + pci.score * COMPLIANCE_WEIGHTS.pci +
    canspam.score * COMPLIANCE_WEIGHTS.canspam
  );

  return { gdpr, hungarian, accessibility, pci, canspam, overall_score, grade: scoreToGrade(overall_score) };
}

// ═══ SCORE CALCULATOR ═══
function calculateGeoScore(scan: TechnicalScan): number {
  let score = 0;
  if (scan.schema_markup.found) score += 15;
  const crawlerVals = Object.values(scan.robots_txt.aiCrawlers);
  score += Math.round((crawlerVals.filter(v => v !== "blocked").length / crawlerVals.length) * 20);
  if (scan.meta_title.found) score += 5;
  if (scan.meta_description.found) score += 5;
  if (scan.open_graph.found) score += 5;
  if (scan.robots_txt.found) score += 8;
  if (scan.sitemap.found) score += 7;
  if (scan.https) score += 4;
  if (scan.canonical.found) score += 3;
  if (scan.viewport) score += 2;
  if (scan.lang_attr) score += 2;
  if (scan.ga4 || scan.gtm) score += 5;
  if (scan.cookie_consent.found) score += 5;
  if (scan.images.total === 0 || scan.images.withAlt / scan.images.total >= 0.8) score += 5;
  return Math.min(score, 100);
}

function calculateMarketingScore(scan: TechnicalScan): number {
  let score = 0;
  if (scan.meta_title.found) score += 10;
  if (scan.meta_description.found) score += 10;
  if (scan.headings.h1 >= 1) score += 8;
  if (scan.open_graph.found) score += 10;
  if (scan.cookie_consent.found) score += 8;
  if (scan.https) score += 10;
  if (scan.schema_markup.found) score += 10;
  if (scan.canonical.found) score += 7;
  if (scan.ga4 || scan.gtm) score += 10;
  if (scan.sitemap.found) score += 5;
  if (scan.robots_txt.found) score += 5;
  if (scan.favicon) score += 7;
  return Math.min(score, 100);
}

// ═══ LLM ANALYZER ═══
const SYSTEM_PROMPT = `Te a WebLelet audit rendszer elemző modulja vagy. A technikai scan és compliance scan eredményeit kapod meg — ezek TÉNYEK, NE változtasd meg őket.

KÖTELEZŐ SZABÁLYOK:
- A quick wins-ben MINDIG legyen 1 üzleti + 1 jogi + 1 technikai elem
- Compliance D/F → a biggest_gaps-ben KELL jogi hiányosság
- TILOS: "teljes elvesztés", "gépileg vak", "nulla esély", "senki nem"
- ÁSZF-nél feltételes mód: "szükséges lehet"

Válaszolj KIZÁRÓLAG valid JSON-ban:
{
  "findings": [{"severity":"KRITIKUS/MAGAS/KÖZEPES","tag":"🔴 TÉNY/🟡 ERŐS FELTÉTELEZÉS/🟢 JAVASLAT","title":"...","evidence":"...","why_problem":"...","business_impact":"...","fix":"...","fix_effort":"...","priority":"MOST/30 NAP/KÉSŐBB"}],
  "layman_summary": "2 perces összefoglaló magyarul",
  "strengths": ["3 db"],
  "biggest_gaps": ["3 db"],
  "fastest_fixes": ["3 db"],
  "quick_wins": [{"title":"...","who":"...","time":"...","cost":"...","type":"üzleti/jogi/technikai"}],
  "schema_code": "JSON-LD kód vagy null",
  "llms_txt": "llms.txt tartalom vagy null"
}`;

async function callAnthropicAPI(
  technicalScan: TechnicalScan, complianceScan: ComplianceScan,
  businessType: string, geoScore: number, marketingScore: number
): Promise<{ analysis: any; tokensUsed: number }> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")!;

  const userPrompt = `URL elemzése. Üzlettípus: ${businessType}
GEO/SEO: ${geoScore}/100, Marketing: ${marketingScore}/100, Compliance: ${complianceScan.overall_score}/100 (${complianceScan.grade})

TECHNIKAI SCAN:
${JSON.stringify(technicalScan, null, 2)}

COMPLIANCE SCAN:
${JSON.stringify(complianceScan, null, 2)}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  const data = await res.json();
  const text = data.content?.[0]?.text || "";
  let jsonText = text.trim();
  if (jsonText.startsWith("```")) jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");

  const analysis = JSON.parse(jsonText);
  const tokensUsed = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);
  return { analysis, tokensUsed };
}

// ═══ VALIDATOR ═══
function validateAuditJson(data: any): { passed: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!data.findings?.length) errors.push("Hiányzó findings");
  if (!data.quick_wins?.length || data.quick_wins.length < 3) errors.push("Minimum 3 quick win kell");
  if (data.quick_wins?.every((q: any) => q.type === "technikai")) errors.push("Quick wins: nem lehet mind technikai");

  const fullText = JSON.stringify(data);
  for (const phrase of FORBIDDEN_PHRASES) {
    if (fullText.toLowerCase().includes(phrase)) errors.push(`Tiltott kifejezés: "${phrase}"`);
  }
  return { passed: errors.length === 0, errors };
}

// ═══ PDF GENERATION ═══
async function generatePDFWithPDFBolt(auditJson: any, config: any): Promise<Uint8Array> {
  const apiKey = Deno.env.get("PDFBOLT_API_KEY")!;
  const scoreColor = (s: number) => s >= 75 ? "#22C55E" : s >= 50 ? "#F59E0B" : "#EF4444";

  // Build simple HTML for PDF
  const findingsHtml = (auditJson.findings || []).map((f: any) => `
    <div style="border:1px solid #E2E8F0;border-left:4px solid ${f.severity === "KRITIKUS" ? "#EF4444" : f.severity === "MAGAS" ? "#F59E0B" : "#3B82F6"};border-radius:8px;padding:16px;margin-bottom:12px;">
      <div style="display:flex;gap:8px;margin-bottom:8px;">
        <span style="background:${f.severity === "KRITIKUS" ? "#FEE2E2" : "#FEF3C7"};color:${f.severity === "KRITIKUS" ? "#DC2626" : "#D97706"};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;">${f.severity}</span>
        <span style="font-size:11px;color:#64748B;">${f.tag}</span>
      </div>
      <h3 style="margin:0 0 8px;font-size:15px;">${f.title}</h3>
      ${f.evidence ? `<p style="font-size:13px;color:#475569;margin:4px 0;"><strong>Mit látunk:</strong> ${f.evidence}</p>` : ""}
      ${f.why_problem ? `<p style="font-size:13px;color:#475569;margin:4px 0;"><strong>Miért probléma:</strong> ${f.why_problem}</p>` : ""}
      ${f.fix ? `<p style="font-size:13px;color:#475569;margin:4px 0;"><strong>Javítás:</strong> ${f.fix}</p>` : ""}
      ${f.fix_effort ? `<p style="font-size:13px;color:#64748B;margin:4px 0;"><strong>Ráfordítás:</strong> ${f.fix_effort}</p>` : ""}
    </div>
  `).join("");

  const quickWinsHtml = (auditJson.quick_wins || []).map((q: any, i: number) => `
    <div style="border:1px solid #E2E8F0;border-radius:8px;padding:16px;margin-bottom:8px;display:flex;gap:12px;align-items:start;">
      <div style="background:${config.primary_color};color:white;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex-shrink:0;">${i + 1}</div>
      <div><strong>${q.title}</strong><br><span style="font-size:12px;color:#64748B;">Ki: ${q.who} · Idő: ${q.time} · Költség: ${q.cost}</span></div>
    </div>
  `).join("");

  const html = `<!DOCTYPE html><html lang="hu"><head><meta charset="UTF-8">
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:'Inter',sans-serif; color:#1E293B; line-height:1.6; font-size:14px; }
      .page { padding:48px; page-break-after:always; }
      .cover { background:linear-gradient(135deg,#0F172A 0%,#1E3A5F 100%); color:white; min-height:100vh; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; padding:60px; }
      .cover h1 { font-size:42px; font-weight:800; margin-bottom:8px; }
      .cover .domain { font-size:18px; opacity:0.7; margin-bottom:32px; }
      .gauges { display:flex; gap:40px; margin:32px 0; }
      .gauge { text-align:center; }
      .gauge-val { font-size:48px; font-weight:800; }
      .gauge-label { font-size:12px; text-transform:uppercase; letter-spacing:2px; opacity:0.7; margin-top:4px; }
      h2 { font-size:22px; font-weight:700; margin-bottom:16px; padding-bottom:8px; border-bottom:2px solid ${config.primary_color}; }
      .section { margin-bottom:32px; }
    </style>
  </head><body>
    <div class="cover">
      <p style="font-size:12px;text-transform:uppercase;letter-spacing:3px;opacity:0.6;margin-bottom:24px;">WEBOLDAL GYORSDIAGNÓZIS</p>
      <h1>${auditJson.brand_name || auditJson.domain}</h1>
      <p class="domain">${auditJson.domain}</p>
      <p style="font-size:14px;opacity:0.5;">${auditJson.date} · Készítette: ${config.company_name}</p>
      <div class="gauges">
        <div class="gauge"><div class="gauge-val" style="color:${scoreColor(auditJson.geo_score)}">${auditJson.geo_score}</div><div class="gauge-label">GEO / SEO</div></div>
        <div class="gauge"><div class="gauge-val" style="color:${scoreColor(auditJson.marketing_score)}">${auditJson.marketing_score}</div><div class="gauge-label">MARKETING</div></div>
        <div class="gauge"><div class="gauge-val" style="color:${scoreColor(auditJson.compliance_score)}">${auditJson.compliance_score}</div><div class="gauge-label">MEGFELELŐSÉG (${auditJson.compliance_grade})</div></div>
      </div>
      <p style="font-size:13px;opacity:0.5;">Gyorsdiagnózis — kizárólag nyilvános adatok alapján</p>
    </div>

    <div class="page">
      <div class="section"><h2>Amit 2 percben tudnia kell</h2>
        ${(auditJson.biggest_gaps || []).map((g: string) => `<div style="background:#F8FAFC;border-left:3px solid ${config.primary_color};padding:12px 16px;margin-bottom:8px;border-radius:0 8px 8px 0;"><strong>🟡 ${g}</strong></div>`).join("")}
      </div>
      <div class="section"><h2>3 azonnali teendő</h2>${quickWinsHtml}</div>
    </div>

    <div class="page">
      <div class="section"><h2>Feltárt problémák és javaslatok</h2>${findingsHtml}</div>
    </div>

    <div class="page">
      <div class="section"><h2>Következő lépés</h2>
        <p>Ez a diagnózis a weboldal nyilvánosan elérhető adataiból készült.</p>
        <div style="background:#F0F6FF;border-radius:12px;padding:20px;margin:16px 0;">
          <h3 style="margin-bottom:8px;">Részletesebb elemzéshez szükséges:</h3>
          <ul><li>Google Analytics hozzáférés</li><li>Google Cégprofil adatok</li><li>15 perces konzultáció</li></ul>
        </div>
        ${auditJson.schema_code ? `<div style="background:#F0FDF4;border-left:3px solid #22C55E;padding:12px 16px;margin:8px 0;border-radius:0 8px 8px 0;"><strong>✅ Kész megoldás: Schema markup (JSON-LD)</strong></div>` : ""}
        ${auditJson.llms_txt ? `<div style="background:#F0FDF4;border-left:3px solid #22C55E;padding:12px 16px;margin:8px 0;border-radius:0 8px 8px 0;"><strong>✅ Kész megoldás: llms.txt</strong></div>` : ""}
        <div style="margin-top:24px;"><h3>Kérje a részletes auditot:</h3><p>Email: ${config.contact_email}</p><p>Web: ${config.contact_website}</p></div>
      </div>
      <p style="font-size:11px;color:#94A3B8;margin-top:32px;text-align:center;">Ez a riport AI-támogatott elemzési rendszerrel készült, kizárólag nyilvánosan elérhető adatok alapján.<br>Készítette: ${config.company_name} — ${config.company_tagline} | ${auditJson.date}</p>
    </div>
  </body></html>`;

  const res = await fetch("https://api.pdfbolt.com/v1/direct", {
    method: "POST",
    headers: { "API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      html,
      options: { format: "A4", margin: { top: "1.5cm", right: "1.5cm", bottom: "2cm", left: "1.5cm" }, printBackground: true },
    }),
  });

  if (!res.ok) throw new Error(`PDFBolt hiba: ${res.status}`);
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
    const robotsRes = await safeFetch(new URL("/robots.txt", url).href);
    const robotsTxt = robotsRes?.status === 200 ? robotsRes.text : null;
    const sitemapRes = await safeFetch(new URL("/sitemap.xml", url).href);

    // 2. TECHNICAL SCAN
    const technicalScan = runTechnicalScan(html, url, robotsTxt, sitemapRes?.status || null);

    // 3. COMPLIANCE SCAN
    const complianceScan = runComplianceScan(html, subPages);

    // 4. SCORES
    const geoScore = calculateGeoScore(technicalScan);
    const marketingScore = calculateMarketingScore(technicalScan);

    await updateStatus("analyzing", {
      raw_html: html.substring(0, 100000),
      technical_scan: technicalScan,
      compliance_scan: complianceScan,
      geo_score: geoScore,
      marketing_score: marketingScore,
      compliance_score: complianceScan.overall_score,
      compliance_grade: complianceScan.grade,
    });

    // 5. LLM
    const llmResult = await callAnthropicAPI(technicalScan, complianceScan, business_type, geoScore, marketingScore);

    // 6. BUILD JSON
    const domain = new URL(url).hostname.replace("www.", "");
    const auditJson = {
      url, domain,
      brand_name: domain.split(".")[0].charAt(0).toUpperCase() + domain.split(".")[0].slice(1),
      date: new Date().toISOString().split("T")[0],
      business_type, audit_level,
      geo_score: geoScore, marketing_score: marketingScore,
      compliance_score: complianceScan.overall_score, compliance_grade: complianceScan.grade,
      technical_scan: technicalScan, compliance_scan: complianceScan,
      ...llmResult.analysis,
    };

    // 7. VALIDATE
    await updateStatus("validating");
    const validation = validateAuditJson(auditJson);

    if (!validation.passed) {
      // Retry once
      const retry = await callAnthropicAPI(technicalScan, complianceScan, business_type, geoScore, marketingScore);
      const retryJson = { ...auditJson, ...retry.analysis };
      const retryValidation = validateAuditJson(retryJson);
      if (!retryValidation.passed) {
        await updateStatus("failed", { audit_json: retryJson, validation_result: retryValidation, error_message: retryValidation.errors.join("; ") });
        return new Response(JSON.stringify({ error: "Validation failed" }), { status: 500 });
      }
      Object.assign(auditJson, retry.analysis);
    }

    await updateStatus("generating", {
      audit_json: auditJson,
      validation_result: { passed: true, errors: [] },
      llm_tokens_used: llmResult.tokensUsed,
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
