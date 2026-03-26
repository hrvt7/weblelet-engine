import type { FetchResult } from "@/lib/types";
import * as cheerio from "cheerio";

const USER_AGENT = "WebLelet Bot/1.0 (+https://weblelet.hu)";
const FETCH_TIMEOUT = 15000;

const SUB_PAGE_PATTERNS = [
  { key: "privacy", patterns: ["privacy", "adatvéd", "adatkezel", "gdpr"] },
  { key: "terms", patterns: ["ászf", "terms", "felhasználási", "általános szerződési"] },
  { key: "impresszum", patterns: ["impresszum", "imprint", "cégadatok", "rólunk", "about"] },
  { key: "contact", patterns: ["kapcsolat", "contact", "elérhetőség"] },
];

async function safeFetch(url: string): Promise<{ html: string; status: number; headers: Record<string, string> } | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);
    const html = await res.text();
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k] = v; });
    return { html, status: res.status, headers };
  } catch {
    return null;
  }
}

function findSubPageLinks(html: string, baseUrl: string): Record<string, string> {
  const $ = cheerio.load(html);
  const links: Record<string, string> = {};
  const base = new URL(baseUrl);

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;

    let fullUrl: string;
    try {
      fullUrl = new URL(href, base.origin).href;
    } catch {
      return;
    }

    // Only same domain
    if (!fullUrl.startsWith(base.origin)) return;

    const hrefLower = href.toLowerCase();
    const textLower = ($(el).text() || "").toLowerCase();
    const combined = hrefLower + " " + textLower;

    for (const { key, patterns } of SUB_PAGE_PATTERNS) {
      if (links[key]) continue;
      for (const p of patterns) {
        if (combined.includes(p)) {
          links[key] = fullUrl;
          break;
        }
      }
    }
  });

  return links;
}

export async function fetchUrl(url: string): Promise<FetchResult> {
  // Normalize URL
  if (!url.startsWith("http")) url = "https://" + url;
  const parsed = new URL(url);

  // Fetch main page
  const main = await safeFetch(url);
  if (!main) throw new Error(`Nem sikerült letölteni: ${url}`);

  // Find and fetch sub pages
  const subPageLinks = findSubPageLinks(main.html, url);
  const subPages: Record<string, string> = {};

  const subFetches = Object.entries(subPageLinks).slice(0, 5).map(async ([key, subUrl]) => {
    const result = await safeFetch(subUrl);
    if (result && result.status === 200) {
      subPages[key] = result.html;
    }
  });
  await Promise.all(subFetches);

  // Fetch robots.txt
  const robotsUrl = `${parsed.origin}/robots.txt`;
  const robotsResult = await safeFetch(robotsUrl);
  const robotsTxt = robotsResult && robotsResult.status === 200 ? robotsResult.html : null;

  // Check sitemap.xml
  const sitemapUrl = `${parsed.origin}/sitemap.xml`;
  const sitemapResult = await safeFetch(sitemapUrl);
  const sitemapStatus = sitemapResult?.status ?? null;

  return {
    url,
    html: main.html,
    statusCode: main.status,
    headers: main.headers,
    subPages,
    robotsTxt,
    sitemapStatus,
  };
}
