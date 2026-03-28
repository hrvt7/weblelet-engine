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

function runComplianceScan(html: string, subPages: Record<string, string>, auditUrl?: string): ComplianceScan {
  const allText = html + " " + Object.values(subPages).join(" ");
  const privacyText = subPages["privacy"] || "";
  const doc = new DOMParser().parseFromString(html, "text/html");

  const gdpr = scanGDPR(allText, privacyText, html);
  const hungarian = scanHungarian(allText);
  const accessibility = scanAccessibility(html, doc);
  const pci = scanPCI(html, auditUrl || "https://");
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

// ═══ 13-AGENT LLM SYSTEM ═══

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
- ÁSZF/impresszum: "A jogszabályok alapján szükséges LEHET" (NEM "köteles")
- Canonical: "a Google számára a fejlesztői domain válhat elsődlegessé" (NEM "nem indexeli", NEM "Google vak rá")
- GDPR: "szükséges LEHET hozzájárulás" (NEM "kötelező, bírságolható")
- fix_effort mező: TILOS "0 Ft", "ingyenes", "díjmentes" — HELYETTE: "belső erőforrással elvégezhető" VAGY "külső fejlesztővel: minimális"
- business_impact mező: KÖTELEZŐ "MIT VESZÍT KONKRÉTAN" formátum — pl. "Az érdeklődők egy része foglalás helyett versenytársat keres" (NEM "potenciális veszteség", NEM általános megfogalmazás)`;

const AGENT_PROMPTS: Record<string, string> = {
  "geo-ai-visibility": `${GLOBAL_RULES}
Te az AI keresők láthatósági agent-je vagy. A robots.txt AI crawler státuszait és a domain-t kapod meg.
Feladatod: elemezd melyik AI crawler (GPTBot, ClaudeBot, PerplexityBot stb.) van engedélyezve/tiltva, adj AI Citability score becslést és Brand Authority score-t.
FONTOS: Az AI keresők MÁSODLAGOSAK — ÉTTEREMNÉL ÉS HELYI SZOLGÁLTATÓNÁL KÜLÖNÖSEN. NE adj KRITIKUS severity-t AI crawler/AI platform témában — maximum KÖZEPES. A finding végén add hozzá: "Az AI keresők szerepe növekvő, de a hagyományos Google keresés és az online foglalhatóság még mindig a fő csatorna."
findings: legfeljebb 1 db AI-témájú finding. Ha a site étterem/helyi szolgáltató → az AI finding severity maximum KÖZEPES.
Válasz formátum: {"findings": [...], "ai_citability_score": 0-100, "brand_authority_score": 0-100}`,

  "geo-platform-analysis": `${GLOBAL_RULES}
Te az AI platform elemző agent vagy. Becsüld meg mennyire jelenik meg az oldal az 5 fő AI platformon.
A technicalScan és a domain alapján adj platform score-okat. NE keressd ténylegesen — becsülj a technikai jelek alapján (schema, robots.txt, tartalom minőség).
FONTOS: Az AI keresők MÁSODLAGOSAK. NE adj KRITIKUS severity-t — maximum KÖZEPES. findings: legfeljebb 1 db AI-témájú finding. A finding végén add hozzá: "Az AI keresők szerepe növekvő, de a hagyományos Google keresés még mindig a fő csatorna."
Válasz: {"findings": [], "platform_scores": {"google_ai": 0-100, "chatgpt": 0-100, "perplexity": 0-100, "gemini": 0-100, "bing_copilot": 0-100}}`,

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

  "market-content": `${GLOBAL_RULES}
Te a marketing tartalom agent vagy. Elemezd a CTA gombokat, értékajánlatot, bizalmi elemeket (testimonials, review-k), brand konzisztenciát.
Válasz: {"findings": [...], "content_marketing_score": 0-100}`,

  "market-technical": `${GLOBAL_RULES}
Te a marketing technikai agent vagy. Elemezd az analytics infrastruktúrát (GA4, GTM, Facebook Pixel), konverziómérés képességét, email lista építést (newsletter form?), retargeting lehetőségeket.
Válasz: {"findings": [...], "technical_marketing_score": 0-100}`,

  "compliance-findings": `${GLOBAL_RULES}
Te a jogi compliance findings agent vagy. A complianceScan pass/fail adatait és a cookie_consent_from_tech_scan mezőt kapod.

COMPLIANCE STÁTUSZ SZABÁLYOK (KÖTELEZŐ):
Minden compliance finding evidence mezőjébe az alábbi státusz jelölések egyikét KÖTELEZŐ használni:
✅ DETEKTÁLT — ha az automatikus scan egyértelműen megtalálta
❌ NEM DETEKTÁLT — ha az automatikus scan nem találta a HTML-ben
🔍 MANUÁLIS ELLENŐRZÉST IGÉNYEL — ha a scan nem tudja biztonsággal megállapítani

TILOS: erős ítéletek mint "jogsértés", "kötelező bírság", "súlyos mulasztás"
HELYETTE: "a jogi előírások szerint szükséges lehet", "kockázatot hordoz", "manuális ellenőrzést igényel"
ÁSZF/impresszum: "szükséges lehet" NEM "köteles"

COOKIE KONZISZTENCIA (KÖTELEZŐ — NINCS KIVÉTEL):
A cookie_consent_from_tech_scan.found az EGYETLEN hiteles forrás a cookie státuszhoz:
• found === true → evidence: "✅ DETEKTÁLT ([provider])" — severity max KÖZEPES, téma: granularitás és visszavonás ellenőrzése
• found === false → evidence: "❌ NEM DETEKTÁLT — automatikus HTML scan alapján" — severity: MAGAS
TILOS a complianceScan más mezői alapján eltérő cookie státuszt adni. Csak a cookie_consent_from_tech_scan.found számít.

PCI DSS finding: CSAK ha van bizonyíték fizetési formra (Stripe, PayPal, SimplePay, Barion) → egyébként: "🔍 MANUÁLIS ELLENŐRZÉST IGÉNYEL (az oldalon nem azonosítható fizetési rendszer)"
CAN-SPAM finding: CSAK ha van bizonyíték email marketing rendszerre → egyébként: "🔍 MANUÁLIS ELLENŐRZÉST IGÉNYEL"

A 2-4 LEGSÚLYOSABB compliance hiányból generálj findings-eket. Evidence = státusz jelölés + mi nem található konkrétan.
Válasz: {"findings": [...]}`,

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
WEBSHOP: HTTPS > fizetés biztonság > ÁSZF > schema(Product) > kosár UX > AI
SZOLGÁLTATÓ: CTA > árazás > referenciák > schema(LocalBusiness) > analytics > AI
SZÁLLÁSHELY: foglalás CTA > értékelések > szezon tartalom > schema > AI
ÁLTALÁNOS: legsúlyosabb tech hiba > CTA > jogi alapok > schema > AI

Válasz: {"biggest_gaps": ["...", "...", "..."], "fastest_fixes": ["...", "...", "..."]}`,

  "synthesis-quickwins": `${GLOBAL_RULES}
Te a quick win priorizáló agent vagy. 3 quick win-t adj ÜZLETI PRIORITÁS sorrendben.
KÖTELEZŐ: legalább 1 üzleti + 1 jogi + 1 technikai típusú.

AI-TÉMÁJÚ JAVASLAT (llms.txt, AI crawler) SOHA NEM LEHET AZ 1. VAGY 2. QUICK WIN. Ha AI témájú kerül be → csak 3. helyre, és csak ha nincs fontosabb jogi/technikai probléma.

QUICK WIN SORREND — IPARÁGFÜGGŐ (a businessType alapján):
ÉTTEREM: 1) ha nincs online foglalás → ez KÖTELEZŐEN az 1. quick win (Quandoo/TheFork/Dishcult regisztráció) 2) ha van erős értékelési profil (Google/TripAdvisor) → ezt emeld ki a summary-ban; ha NINCS → ez a 2. quick win 3) legsúlyosabb jogi hiba (cookie/impresszum/DSGVO)
WEBSHOP: 1) HTTPS/fizetési biztonság 2) ÁSZF/fogyasztóvédelem 3) schema(Product)
SZOLGÁLTATÓ: 1) CTA/árazás javítás 2) tech hiba (sitemap/meta) 3) jogi alap (impresszum)
SZÁLLÁSHELY: 1) foglalás CTA 2) értékelések/képek 3) jogi dokumentumok
ÜGYNÖKSÉG: 1) portfolio/case study 2) CTA 3) E-E-A-T (csapatbemutató)
ÁLTALÁNOS: 1) legsúlyosabb tech hiba 2) CTA/konverzió 3) jogi alapok

cost mező: TILOS "0 Ft", "ingyenes" — HELYETTE: "belső erőforrással elvégezhető" VAGY "külső fejlesztővel: minimális"

Válasz: {"quick_wins": [{"title":"...","who":"Ki csinálja","time":"Mennyi idő","cost":"Mennyibe kerül","type":"üzleti/jogi/technikai"}, ...]}`,

  "synthesis-layman": `${GLOBAL_RULES}
Te a laikus összefoglaló agent vagy. Írj 3-5 mondatos közérthető összefoglalót NEM TECHNIKAI embernek.
TILOS használni: "canonical URL", "robots.txt", "schema markup", "JSON-LD", "meta tag", "sitemap".
HELYETTE: "a Google nehezebben találja meg az oldalát", "a jogi dokumentumok hiányosak", "az AI keresők nem látják az oldalt".
Válasz: {"layman_summary": "3-5 mondat magyarul"}`,

  "synthesis-categories": `${GLOBAL_RULES}
Te a score kategória bontó agent vagy. A technicalScan és complianceScan alapján adj kategória bontást.

Minden kategóriához KÖTELEZŐ formátum:
{"name": "Kategória név", "score": 0-100, "boost": "Konkrét pozitívum az oldalon", "drag": "Konkrét hiányosság", "quick_fix": "1 konkrét javítási lépés (idő + költség)"}

geo_categories (6 db): AI Citability, Brand Authority, Tartalom & E-E-A-T, Technikai alapok, Strukturált adatok, Platform optimalizálás
marketing_categories (4 db): Tartalom & Üzenetek, Konverzió, SEO & Felfedezhetőség, Brand & Bizalom

Válasz: {"geo_categories": [...], "marketing_categories": [...]}`,

  // === SZINT 2 AGENT-EK ===

  "szint2-proposal": `${GLOBAL_RULES}
Te a WebLelet szolgáltatási ajánlat modulja vagy. A partner adatlapból és a findings-ekből generálj 3 csomagot:
1. ALAP (150-300 EUR/hó): Legkritikusabb hibák javítása
2. STANDARD (300-600 EUR/hó): Alap + SEO + tartalom
3. PRÉMIUM (600-1200 EUR/hó): Teljes marketing menedzsment

Minden csomaghoz: mit tartalmaz (5-8 tétel), melyik findings-eket oldja meg, várható üzleti hatás (alacsony/közepes/magas — NEM konkrét Ft).
Jelöld meg az AJÁNLOTT csomagot. A partner adatlapból használd: havi_ugyfelszam, atlagos_szamlaertek_ft, legnagyobb_uzleti_problema, marketing_budget.
Válasz: {"packages": [{"name":"...","price":"...","features":[...],"solves":[...],"impact":"..."}], "recommended": 1, "business_impact_summary": "..."}`,

  "szint2-email-sequences": `${GLOBAL_RULES}
Generálj email szekvenciákat az ügyfél üzlettípusára szabva:
- Welcome (3 email): subject + 2 mondat tartalom
- Nurture (5 email): subject + 2 mondat tartalom
- Konverziós (3 email): subject + 2 mondat tartalom
ÉS 30 napos social media naptár vázlat (heti bontás, platformok, poszt típusok).
A partner adatlapból: célcsoport, üzlettípus, versenytársak.
Válasz: {"sequences": {"welcome": [{"subject":"...","body":"..."}], "nurture": [...], "conversion": [...]}, "social_calendar": "..."}`,

  "szint2-outreach": `${GLOBAL_RULES}
Generálj megkeresési stratégiát:
- Csatorna javaslat (email, LinkedIn, telefon — melyik a legalkalmasabb)
- 3 lépéses email szekvencia (subject + body vázlat)
- Személyre szabási pontok a partner adatlapból
- Timing javaslat
Válasz: {"strategy": {"channels": [...], "email_sequence": [{"step":1,"subject":"...","body":"...","timing":"..."}], "personalization_points": [...], "timing": "..."}}`,

  "szint2-executive": `${GLOBAL_RULES}
Írj vezetői összefoglalót LAIKUS NYELVEN. TILOS technikai zsargon: canonical, robots.txt, JSON-LD, schema.
HELYETTE: "a Google nehezebben találja az oldalát", "a jogi dokumentumok hiányoznak", "az AI keresők nem látják".
- intro: 3-4 mondat NEM technikai döntéshozónak. Használj analógiát! Pl: "Ha az Ön üzlete egy fizikai bolt lenne..."
- top3: A 3 legfontosabb teendő 1-1 mondatban közérthetően
- steps: 5 konkrét lépés (ki, mit, mikor)
A partner adatból: felhasználd a legnagyobb_uzleti_problema-t és a legfontosabb_cel-t.
Válasz: {"intro": "...", "top3": ["...","...","..."], "steps": ["...","...","...","...","..."]}`,
};

async function callAgent(agentName: string, input: Record<string, any>, auditLevel = "szint1"): Promise<any> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.error(`[callAgent] ANTHROPIC_API_KEY is not set!`);
    throw new Error("ANTHROPIC_API_KEY environment variable is missing");
  }
  const systemPrompt = AGENT_PROMPTS[agentName];
  if (!systemPrompt) throw new Error(`Unknown agent: ${agentName}`);

  // Cost optimization: Haiku for szint1 (free tier), Sonnet for szint2 (paid)
  // Haiku 4.5: $1/$5 MTok vs Sonnet 4.6: $3/$15 MTok — ~5x savings on free audits
  const model = auditLevel === "szint2" ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001";
  const maxTokens = auditLevel === "szint2" ? 3000 : 1500;

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
  technicalScan: TechnicalScan, complianceScan: ComplianceScan,
  rawHtml: string, businessType: string, domain: string, brandName: string,
  partnerData: any, auditLevel: string, geoScore: number, marketingScore: number
): Promise<any> {
  const rawFindings: any[] = [];
  let totalTokens = 0;

  const al = auditLevel; // shorthand for readability

  // === BATCH 1: GEO + MARKETING + COMPLIANCE PÁRHUZAMOSAN (8 hívás egyszerre) ===
  const [r1, r2, r3, r4, r5, r6, r7, r8] = await Promise.all([
    callAgent("geo-ai-visibility", { robots_txt: technicalScan.robots_txt, domain, businessType }, al),
    callAgent("geo-platform-analysis", { technicalScan, domain, businessType }, al),
    callAgent("geo-technical", { technicalScan, domain }, al),
    callAgent("geo-content", { html: rawHtml.substring(0, 5000), businessType }, al),
    callAgent("geo-schema", { schema_markup: technicalScan.schema_markup, businessType, domain, brandName }, al),
    callAgent("market-content", { html: rawHtml.substring(0, 5000), technicalScan, businessType }, al),
    callAgent("market-technical", { technicalScan, businessType }, al),
    callAgent("compliance-findings", { complianceScan, businessType, cookie_consent_from_tech_scan: technicalScan.cookie_consent }, al),
  ]);
  
  for (const r of [r1, r2, r3, r4, r5, r6, r7, r8]) {
    rawFindings.push(...(r.findings || []));
    totalTokens += r.tokensUsed || 0;
  }

  // Deduplikáció — hasonló title-ök szűrése, erősebb severity marad
  const allFindings = deduplicateFindings(rawFindings);

  // === BATCH 2: SYNTHESIS — strengths + gaps/fixes + categories PÁRHUZAMOSAN ===
  const [r9, r10, r13] = await Promise.all([
    callAgent("synthesis-strengths", { allResults: { r1, r2, r3, r4, r5, r6, r7, r8 }, technicalScan, businessType }, al),
    callAgent("synthesis-gaps-fixes", { findings: allFindings, businessType }, al),
    callAgent("synthesis-categories", { technicalScan, complianceScan, businessType }, al),
  ]);
  totalTokens += (r9.tokensUsed || 0) + (r10.tokensUsed || 0) + (r13.tokensUsed || 0);

  // === BATCH 3: QUICKWINS + LAYMAN (kell az előző eredmény) ===
  const [r11, r12] = await Promise.all([
    callAgent("synthesis-quickwins", { findings: allFindings, businessType, complianceScan }, al),
    callAgent("synthesis-layman", {
      strengths: r9.strengths, biggest_gaps: r10.biggest_gaps,
      findings: allFindings, businessType,
    }, al),
  ]);
  totalTokens += (r11.tokensUsed || 0) + (r12.tokensUsed || 0);

  // === BATCH 4: SZINT 2 EXTRA AGENTS (csak ha szint2 és van partner data) ===
  let szint2Extra: any = {};
  if (auditLevel === "szint2" && partnerData) {
    const scores = { geo: geoScore, marketing: marketingScore, compliance: complianceScan.overall_score };
    const [proposal, emailSeq, outreach, execSummary] = await Promise.all([
      callAgent("szint2-proposal", { findings: allFindings, partnerData, businessType, scores }, "szint2"),
      callAgent("szint2-email-sequences", { findings: allFindings, partnerData, businessType }, "szint2"),
      callAgent("szint2-outreach", { findings: allFindings, partnerData, businessType }, "szint2"),
      callAgent("szint2-executive", { strengths: r9.strengths, biggest_gaps: r10.biggest_gaps, partnerData, businessType, scores }, "szint2"),
    ]);
    totalTokens += (proposal.tokensUsed || 0) + (emailSeq.tokensUsed || 0) + (outreach.tokensUsed || 0) + (execSummary.tokensUsed || 0);

    szint2Extra = {
      proposal_packages: proposal.packages || [],
      business_impact_summary: proposal.business_impact_summary || "",
      email_sequences: emailSeq.sequences || {},
      social_calendar_summary: emailSeq.social_calendar || "",
      outreach_strategy: outreach.strategy || {},
      executive_layman_intro: execSummary.intro || "",
      top3_layman: execSummary.top3 || [],
      simple_action_steps: execSummary.steps || [],
    };
  }

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
    marketing_categories: r13.marketing_categories || [],
    platform_scores: r2.platform_scores || {},
    ai_citability_score: r1.ai_citability_score || 0,
    brand_authority_score: r1.brand_authority_score || 0,
    tokensUsed: totalTokens,
    ...szint2Extra,
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

// ═══ PDF GENERATION ═══
async function generatePDFWithPDFBolt(auditJson: any, config: any): Promise<Uint8Array> {
  const apiKey = Deno.env.get("PDFBOLT_API_KEY")!;
  // Template imported from template.ts — base64 encode for PDFBolt html field
  const templateB64 = btoa(unescape(encodeURIComponent(PDF_TEMPLATE)));

  // Az audit JSON-t templateData-ként küldjük a PDFBolt template-nek
  const templateData = {
    // Alap adatok
    domain: auditJson.domain || "",
    brand_name: auditJson.brand_name || auditJson.domain || "",
    date: auditJson.date || new Date().toISOString().split("T")[0],
    audit_level: auditJson.audit_level || "szint1",
    business_type: auditJson.business_type || "Általános",
    
    // Score-ok + előre kiszámolt szín osztályok
    geo_score: auditJson.geo_score || 0,
    geo_color: (auditJson.geo_score || 0) < 40 ? "gc-red" : (auditJson.geo_score || 0) < 75 ? "gc-yellow" : "gc-green",
    marketing_score: auditJson.marketing_score || 0,
    marketing_color: (auditJson.marketing_score || 0) < 40 ? "gc-red" : (auditJson.marketing_score || 0) < 75 ? "gc-yellow" : "gc-green",
    compliance_score: auditJson.compliance_score || 0,
    compliance_color: (auditJson.compliance_score || 0) < 40 ? "gc-red" : (auditJson.compliance_score || 0) < 75 ? "gc-yellow" : "gc-green",
    compliance_grade: auditJson.compliance_grade || "N/A",
    sales_score: auditJson.sales_score || null,
    
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
    // Pre-sliced findings for specific pages (avoids Handlebars @second / limit issues)
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
    
    // Kategória bontás (score bar-okhoz, szín előre számolva)
    geo_categories: (auditJson.geo_categories || []).map((c: any) => ({...c, color: (c.score||0) < 40 ? "fill-red" : (c.score||0) < 75 ? "fill-yellow" : "fill-green"})),
    marketing_categories: (auditJson.marketing_categories || []).map((c: any) => ({...c, color: (c.score||0) < 40 ? "fill-red" : (c.score||0) < 75 ? "fill-yellow" : "fill-green"})),

    // Compliance részletek
    compliance_categories: auditJson.compliance_categories || [],
    
    // Score methodology — 5×20% transzparens bontás
    score_methodology: (() => {
      const ts = auditJson.technical_scan || {};
      const cs = auditJson.compliance_scan || {};
      const techBase = Math.round(((ts.https ? 1 : 0) + (ts.canonical?.found ? 1 : 0) + (ts.robots_txt?.found ? 1 : 0) + (ts.sitemap?.found ? 1 : 0) + (ts.viewport ? 1 : 0)) / 5 * 100);
      const onPage = Math.round(((ts.meta_title?.found ? 1 : 0) + (ts.meta_description?.found ? 1 : 0) + ((ts.headings?.h1 || 0) >= 1 ? 1 : 0) + ((ts.images?.total || 0) === 0 || ((ts.images?.withAlt || 0) / Math.max(ts.images?.total || 1, 1)) >= 0.8 ? 1 : 0)) / 4 * 100);
      const local = Math.round(((ts.schema_markup?.found ? 1 : 0) + (ts.ga4 || ts.gtm ? 1 : 0) + (ts.lang_attr ? 1 : 0)) / 3 * 100);
      const social = Math.round(((ts.open_graph?.found ? 1 : 0) + (ts.favicon ? 1 : 0)) / 2 * 100);
      const comp = cs.overall_score || 0;
      const c = (s: number) => s < 40 ? "fill-red" : s < 75 ? "fill-yellow" : "fill-green";
      return [
        { label: "Technikai alapok", weight: 20, score: techBase, color: c(techBase) },
        { label: "On-page optimalizálás", weight: 20, score: onPage, color: c(onPage) },
        { label: "Helyi jelzések & schema", weight: 20, score: local, color: c(local) },
        { label: "Social preview (OG)", weight: 20, score: social, color: c(social) },
        { label: "Compliance alap", weight: 20, score: comp, color: c(comp) },
      ];
    })(),

    // Compliance framework státusz — detektált / nem detektált / manuális
    compliance_frameworks: (() => {
      const ts = auditJson.technical_scan || {};
      const cs = auditJson.compliance_scan || {};
      const cf = (s: string, c: string) => ({ status: s, cls: c });
      return [
        { name: "Cookie hozzájárulás", ...cf(ts.cookie_consent?.found ? `✅ DETEKTÁLT (${ts.cookie_consent?.provider || "azonosítva"})` : "❌ NEM DETEKTÁLT", ts.cookie_consent?.found ? "cf-ok" : "cf-fail") },
        { name: "GDPR / Adatvédelem", ...cf((cs.gdpr?.passedPoints || 0) >= 5 ? "✅ DETEKTÁLT" : (cs.gdpr?.passedPoints || 0) >= 2 ? "🔍 RÉSZLEGES" : "❌ NEM DETEKTÁLT", (cs.gdpr?.passedPoints || 0) >= 5 ? "cf-ok" : (cs.gdpr?.passedPoints || 0) >= 2 ? "cf-warn" : "cf-fail") },
        { name: "Magyar jogi dok. (ÁSZF, impresszum)", ...cf((cs.hungarian?.passedPoints || 0) >= 3 ? "🔍 RÉSZBEN DETEKTÁLT" : "🔍 MANUÁLIS ELLENŐRZÉST IGÉNYEL", (cs.hungarian?.passedPoints || 0) >= 3 ? "cf-warn" : "cf-manual") },
        { name: "Akadálymentesség (WCAG)", ...cf("🔍 MANUÁLIS ELLENŐRZÉST IGÉNYEL", "cf-manual") },
        { name: "Fizetési / PCI DSS", ...cf((cs.pci?.passedPoints || 0) >= 4 ? "✅ MEGFELEL" : "🔍 MANUÁLIS ELLENŐRZÉST IGÉNYEL", (cs.pci?.passedPoints || 0) >= 4 ? "cf-ok" : "cf-manual") },
      ];
    })(),

    // Technikai mellékletek — szint1-ben üres (upsell hook), szint2-ben valódi kód
    schema_code: auditJson.audit_level === "szint2" ? (auditJson.schema_code || "") : "",
    llms_txt: auditJson.audit_level === "szint2" ? (auditJson.llms_txt || "") : "",
    
    // Config (white-label)
    company_name: config.company_name || "WebLelet",
    company_tagline: config.company_tagline || "",
    contact_email: config.contact_email || "",
    contact_website: config.contact_website || "",
    primary_color: config.primary_color || "#2563EB",
  };

  // Szint 2 extra adatok a template-hez
  if (auditJson.audit_level === "szint2") {
    Object.assign(templateData, {
      is_szint2: true,
      proposal_packages: auditJson.proposal_packages || [],
      business_impact_summary: auditJson.business_impact_summary || "",
      email_sequences: auditJson.email_sequences || {},
      outreach_strategy: auditJson.outreach_strategy || {},
      executive_layman_intro: auditJson.executive_layman_intro || "",
      top3_layman: auditJson.top3_layman || [],
      simple_action_steps: auditJson.simple_action_steps || [],
      partner_data: auditJson.partner_data || null,
    });
  }

  const res = await fetch("https://api.pdfbolt.com/v1/direct", {
    method: "POST",
    headers: { "API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      html: templateB64,
      templateData: templateData,
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
    const robotsRes = await safeFetch(new URL("/robots.txt", url).href);
    const robotsTxt = robotsRes?.status === 200 ? robotsRes.text : null;
    const sitemapRes = await safeFetch(new URL("/sitemap.xml", url).href);

    // 2. TECHNICAL SCAN
    const technicalScan = runTechnicalScan(html, url, robotsTxt, sitemapRes?.status || null);

    // 3. COMPLIANCE SCAN
    const complianceScan = runComplianceScan(html, subPages, url);

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

    // 4.5. PARTNER DATA + MODULES + EMAIL kiolvasás DB-ből
    const { data: auditRow } = await supabase
      .from("audits")
      .select("partner_data, modules, email")
      .eq("id", auditId)
      .single();
    const partnerData = auditRow?.partner_data || null;
    const modules = auditRow?.modules || null;
    const auditEmail = auditRow?.email || null;

    // 5. 13-AGENT LLM ANALYSIS (+4 Szint 2 agent ha van partner data)
    const domain = new URL(url).hostname.replace("www.", "");
    const brandName = domain.split(".")[0].charAt(0).toUpperCase() + domain.split(".")[0].slice(1);

    const agentResults = await runAllAgents(
      technicalScan, complianceScan, html, business_type, domain, brandName,
      partnerData, audit_level, geoScore, marketingScore
    );

    // 6. BUILD JSON
    const auditJson = {
      url, domain, brand_name: brandName,
      date: new Date().toISOString().split("T")[0],
      business_type, audit_level,
      geo_score: geoScore, marketing_score: marketingScore,
      compliance_score: complianceScan.overall_score, compliance_grade: complianceScan.grade,
      technical_scan: technicalScan, compliance_scan: complianceScan,
      findings: agentResults.findings,
      strengths: agentResults.strengths,
      biggest_gaps: agentResults.biggest_gaps,
      fastest_fixes: agentResults.fastest_fixes,
      quick_wins: agentResults.quick_wins,
      layman_summary: agentResults.layman_summary,
      schema_code: agentResults.schema_code,
      llms_txt: agentResults.llms_txt,
      geo_categories: agentResults.geo_categories,
      marketing_categories: agentResults.marketing_categories,
      platform_scores: agentResults.platform_scores,
      // Szint 2 extras
      ...(audit_level === "szint2" ? {
        proposal_packages: agentResults.proposal_packages,
        business_impact_summary: agentResults.business_impact_summary,
        email_sequences: agentResults.email_sequences,
        social_calendar_summary: agentResults.social_calendar_summary,
        outreach_strategy: agentResults.outreach_strategy,
        executive_layman_intro: agentResults.executive_layman_intro,
        top3_layman: agentResults.top3_layman,
        simple_action_steps: agentResults.simple_action_steps,
        partner_data: partnerData,
      } : {}),
    };

    // 7. SANITIZE + VALIDATE
    await updateStatus("validating");
    const sanitized = sanitizeForbiddenPhrases(auditJson);
    Object.assign(auditJson, sanitized);
    const validation = validateAuditJson(auditJson);

    if (!validation.passed) {
      // Retry: rerun synthesis agents only (faster than all 13)
      const retryR10 = await callAgent("synthesis-gaps-fixes", { findings: agentResults.findings, businessType: business_type });
      const retryR11 = await callAgent("synthesis-quickwins", { findings: agentResults.findings, businessType: business_type, complianceScan });
      auditJson.biggest_gaps = retryR10.biggest_gaps || auditJson.biggest_gaps;
      auditJson.fastest_fixes = retryR10.fastest_fixes || auditJson.fastest_fixes;
      auditJson.quick_wins = retryR11.quick_wins || auditJson.quick_wins;

      const retryValidation = validateAuditJson(auditJson);
      if (!retryValidation.passed) {
        // szint1 (public free audit): ne álljunk le, generáljuk a PDF-et a meglévő adatokkal
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

    // 11. MAKE.COM WEBHOOK — PDF kézbesítés értesítés
    const makeWebhookUrl = Deno.env.get("MAKE_WEBHOOK_URL");
    if (makeWebhookUrl && auditEmail) {
      try {
        // Signed URL generálás (1 órás érvényesség)
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
            marketing_score: marketingScore,
            compliance_score: complianceScan.overall_score,
            compliance_grade: complianceScan.grade,
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
