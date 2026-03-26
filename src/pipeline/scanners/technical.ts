import * as cheerio from "cheerio";
import type { TechnicalScan, FetchResult } from "@/lib/types";
import { AI_CRAWLERS } from "@/lib/constants";

function checkCrawlerAccess(robotsTxt: string | null): Record<string, "allowed" | "blocked" | "not_mentioned"> {
  const result: Record<string, "allowed" | "blocked" | "not_mentioned"> = {};

  for (const crawler of AI_CRAWLERS) {
    if (!robotsTxt) {
      result[crawler] = "allowed"; // no robots.txt = allowed
      continue;
    }

    const lines = robotsTxt.split("\n").map(l => l.trim());
    let currentAgent = "";
    let found = false;

    for (const line of lines) {
      if (line.toLowerCase().startsWith("user-agent:")) {
        currentAgent = line.substring(11).trim();
      } else if (line.toLowerCase().startsWith("disallow:")) {
        const path = line.substring(9).trim();
        if (
          (currentAgent === "*" || currentAgent.toLowerCase() === crawler.toLowerCase()) &&
          path === "/"
        ) {
          result[crawler] = "blocked";
          found = true;
          break;
        }
      }
    }

    if (!found) {
      // Check if mentioned at all
      const mentioned = robotsTxt.toLowerCase().includes(crawler.toLowerCase());
      result[crawler] = mentioned ? "allowed" : "not_mentioned";
    }
  }

  return result;
}

export function runTechnicalScan(fetchResult: FetchResult): TechnicalScan {
  const $ = cheerio.load(fetchResult.html);
  const url = fetchResult.url;
  const domain = new URL(url).hostname;

  // Canonical
  const canonicalTag = $('link[rel="canonical"]').attr("href") || null;
  const canonical = {
    found: !!canonicalTag,
    url: canonicalTag,
    matchesDomain: canonicalTag ? canonicalTag.includes(domain) : false,
  };

  // Meta title
  const titleContent = $("title").text() || $('meta[property="og:title"]').attr("content") || null;
  const meta_title = {
    found: !!titleContent,
    content: titleContent,
    length: titleContent?.length || 0,
  };

  // Meta description
  const descContent = $('meta[name="description"]').attr("content") || null;
  const langAttr = $("html").attr("lang") || null;
  const meta_description = {
    found: !!descContent,
    content: descContent,
    length: descContent?.length || 0,
    language: langAttr,
  };

  // Schema markup (JSON-LD)
  const schemaScripts = $('script[type="application/ld+json"]');
  const schemaTypes: string[] = [];
  let jsonLdContent: string | null = null;
  let fieldsCount = 0;

  schemaScripts.each((_, el) => {
    const text = $(el).html();
    if (!text) return;
    try {
      const parsed = JSON.parse(text);
      if (parsed["@type"]) schemaTypes.push(parsed["@type"]);
      jsonLdContent = text;
      fieldsCount += Object.keys(parsed).length;
    } catch { /* invalid JSON-LD */ }
  });

  const schema_markup = {
    found: schemaTypes.length > 0,
    types: schemaTypes,
    jsonLd: jsonLdContent,
    fieldsCount,
  };

  // Robots.txt
  const robots_txt = {
    found: !!fetchResult.robotsTxt,
    content: fetchResult.robotsTxt,
    aiCrawlers: checkCrawlerAccess(fetchResult.robotsTxt),
  };

  // Sitemap
  const sitemap = {
    found: fetchResult.sitemapStatus === 200,
    statusCode: fetchResult.sitemapStatus,
  };

  // HTTPS
  const https = url.startsWith("https://");

  // Headings
  const h1 = $("h1").length;
  const h2 = $("h2").length;
  const h3 = $("h3").length;
  const hierarchy_ok = h1 >= 1 && h1 <= 2 && (h2 > 0 || h1 === 1);

  // Images
  const allImages = $("img");
  const total = allImages.length;
  let withAlt = 0;
  allImages.each((_, el) => {
    const alt = $(el).attr("alt");
    if (alt && alt.trim().length > 0) withAlt++;
  });

  // GA4
  const htmlStr = fetchResult.html;
  const ga4 = htmlStr.includes("gtag") || htmlStr.includes("G-") || htmlStr.includes("google-analytics");

  // GTM
  const gtm = htmlStr.includes("googletagmanager.com") || htmlStr.includes("GTM-");

  // Cookie consent
  const cookiePatterns = [
    { pattern: "cookiebot", provider: "Cookiebot" },
    { pattern: "onetrust", provider: "OneTrust" },
    { pattern: "klaro", provider: "Klaro" },
    { pattern: "cc-banner", provider: "Cookie Consent" },
    { pattern: "cookie-consent", provider: "Cookie Consent" },
    { pattern: "cookie-notice", provider: "Cookie Notice" },
    { pattern: "gdpr", provider: "GDPR plugin" },
  ];

  let cookieFound = false;
  let cookieProvider: string | null = null;
  const htmlLower = htmlStr.toLowerCase();

  for (const { pattern, provider } of cookiePatterns) {
    if (htmlLower.includes(pattern)) {
      cookieFound = true;
      cookieProvider = provider;
      break;
    }
  }

  // Open Graph
  const ogTags: string[] = [];
  $('meta[property^="og:"]').each((_, el) => {
    const prop = $(el).attr("property");
    if (prop) ogTags.push(prop);
  });

  // Viewport
  const viewport = !!$('meta[name="viewport"]').length;

  // Favicon
  const favicon = !!$('link[rel="icon"]').length || !!$('link[rel="shortcut icon"]').length;

  return {
    canonical,
    meta_title,
    meta_description,
    schema_markup,
    robots_txt,
    sitemap,
    https,
    lang_attr: langAttr,
    headings: { h1, h2, h3, hierarchy_ok },
    images: { total, withoutAlt: total - withAlt, withAlt },
    ga4,
    gtm,
    cookie_consent: { found: cookieFound, provider: cookieProvider },
    open_graph: { found: ogTags.length > 0, tags: ogTags },
    viewport,
    favicon,
  };
}
