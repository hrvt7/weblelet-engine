import * as cheerio from "cheerio";
import type { FrameworkResult, ComplianceCheckResult } from "@/lib/types";

export function scanAccessibility(html: string): FrameworkResult {
  const $ = cheerio.load(html);
  const checks: ComplianceCheckResult[] = [];

  // A1: Alt text
  const images = $("img");
  const totalImgs = images.length;
  let withAlt = 0;
  images.each((_, el) => {
    if ($(el).attr("alt")?.trim()) withAlt++;
  });
  checks.push({
    id: "A1", label: "Képek alternatív szövege",
    passed: totalImgs === 0 || withAlt / totalImgs >= 0.8,
    details: `${withAlt}/${totalImgs} képnek van alt szövege`,
  });

  // A2: Heading struktúra
  const h1 = $("h1").length;
  const h2 = $("h2").length;
  const h3 = $("h3").length;
  checks.push({
    id: "A2", label: "Heading struktúra",
    passed: h1 >= 1 && h1 <= 2 && (h2 > 0 || h3 > 0),
    details: `H1: ${h1}, H2: ${h2}, H3: ${h3}`,
  });

  // A3: Színkontraszt (figyelmeztetés — nem mérhető pontosan)
  checks.push({
    id: "A3", label: "Színkontraszt",
    passed: true, // Cannot be accurately measured from HTML alone
    details: "Figyelmeztetés: színkontraszt nem mérhető pontosan HTML-ből",
  });

  // A4: Billentyűzetes navigáció
  const hasTabindex = $("[tabindex]").length > 0;
  const hasSkipNav = $("a[href='#main'], a[href='#content'], .skip-nav, .skip-link").length > 0;
  checks.push({
    id: "A4", label: "Billentyűzetes navigáció",
    passed: hasTabindex || hasSkipNav,
    details: `tabindex: ${hasTabindex}, skip-nav: ${hasSkipNav}`,
  });

  // A5: Form label-ek
  const inputs = $("input:not([type='hidden']):not([type='submit']):not([type='button'])");
  let labeled = 0;
  inputs.each((_, el) => {
    const id = $(el).attr("id");
    const hasLabel = id ? $(`label[for="${id}"]`).length > 0 : false;
    const hasAria = !!$(el).attr("aria-label") || !!$(el).attr("aria-labelledby");
    const hasPlaceholder = !!$(el).attr("placeholder");
    if (hasLabel || hasAria || hasPlaceholder) labeled++;
  });
  checks.push({
    id: "A5", label: "Form label-ek",
    passed: inputs.length === 0 || labeled / inputs.length >= 0.8,
    details: `${labeled}/${inputs.length} input elemnek van label/aria-label`,
  });

  // A6: Link szövegek (nem "kattintson ide")
  const badLinkTexts = ["kattintson ide", "click here", "tovább", "itt", "here", "more"];
  let badLinks = 0;
  $("a").each((_, el) => {
    const text = $(el).text().trim().toLowerCase();
    if (badLinkTexts.includes(text)) badLinks++;
  });
  checks.push({
    id: "A6", label: "Leíró link szövegek",
    passed: badLinks === 0,
    details: `${badLinks} nem leíró link szöveg ("kattintson ide" típusú)`,
  });

  // A7: Nyelvi attribútum
  const lang = $("html").attr("lang");
  checks.push({
    id: "A7", label: "Nyelvi attribútum",
    passed: !!lang && lang.length >= 2,
    details: lang ? `lang="${lang}"` : "Hiányzik a lang attribútum",
  });

  // A8: Viewport meta
  checks.push({
    id: "A8", label: "Viewport meta",
    passed: $('meta[name="viewport"]').length > 0,
    details: "Viewport meta tag ellenőrzése",
  });

  // A9: Videó feliratok
  const hasVideo = $("video").length > 0 || $("iframe[src*='youtube'], iframe[src*='vimeo']").length > 0;
  checks.push({
    id: "A9", label: "Videó feliratok",
    passed: !hasVideo, // Pass if no video, warn if video present
    details: hasVideo ? "Videó tartalom észlelve — ellenőrizze a feliratokat" : "Nincs videó tartalom",
  });

  // A10: Akadálymentességi nyilatkozat
  const htmlLower = html.toLowerCase();
  checks.push({
    id: "A10", label: "Akadálymentességi nyilatkozat",
    passed: htmlLower.includes("akadálymentesség") || htmlLower.includes("accessibility"),
    details: "Akadálymentességi nyilatkozat link keresése",
  });

  const passedPoints = checks.filter(c => c.passed).length;
  const score = Math.round((passedPoints / checks.length) * 100);

  return { name: "Akadálymentesség", checks, score, maxPoints: checks.length, passedPoints };
}
