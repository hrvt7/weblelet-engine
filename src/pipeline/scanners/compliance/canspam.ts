import * as cheerio from "cheerio";
import type { FrameworkResult, ComplianceCheckResult } from "@/lib/types";

function textContains(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some(k => lower.includes(k.toLowerCase()));
}

export function scanCanSpam(html: string, subPages: Record<string, string>): FrameworkResult {
  const $ = cheerio.load(html);
  const allText = html + " " + Object.values(subPages).join(" ");
  const checks: ComplianceCheckResult[] = [];

  // S1: Leiratkozási lehetőség
  checks.push({
    id: "S1", label: "Leiratkozási lehetőség",
    passed: textContains(allText, ["leiratkozás", "unsubscribe", "leiratkoz"]),
    details: "Leiratkozási link email form mellett",
  });

  // S2: Fizikai cím
  const addressPattern = /\d{4}\s+\w+/; // Hungarian postal code pattern
  const footerText = $("footer").text() || "";
  const hasAddress = addressPattern.test(footerText) || textContains(footerText, ["utca", "krt.", "út ", "tér "]);
  checks.push({
    id: "S2", label: "Fizikai cím",
    passed: hasAddress,
    details: "Fizikai cím (utca + város) a footer-ben",
  });

  // S3: Küldő azonosítása
  checks.push({
    id: "S3", label: "Küldő azonosítása",
    passed: textContains(html, ["©", "kft", "bt.", "zrt.", "nyrt."]) || textContains(footerText, ["cégnév", "cég"]),
    details: "Cégnév egyértelmű azonosítása az oldalon",
  });

  // S4: Nincs előre bejelölt checkbox
  let preChecked = false;
  $('input[type="checkbox"]').each((_, el) => {
    if ($(el).attr("checked") !== undefined) {
      const nearbyText = $(el).parent().text().toLowerCase();
      if (textContains(nearbyText, ["hírlevél", "newsletter", "email", "marketing"])) {
        preChecked = true;
      }
    }
  });
  checks.push({
    id: "S4", label: "Nincs előre bejelölt marketing checkbox",
    passed: !preChecked,
    details: preChecked ? "Előre bejelölt marketing checkbox észlelve" : "Nincs előre bejelölt marketing checkbox",
  });

  // S5: Email gyakorlatok leírása
  const privacyText = subPages["privacy"] || "";
  checks.push({
    id: "S5", label: "Email gyakorlatok leírása",
    passed: textContains(privacyText || allText, ["email", "hírlevél", "newsletter"]) &&
      textContains(privacyText || allText, ["leiratkozás", "unsubscribe"]),
    details: "Email küldési gyakorlatok leírása az adatvédelmi tájékoztatóban",
  });

  const passedPoints = checks.filter(c => c.passed).length;
  const score = Math.round((passedPoints / checks.length) * 100);

  return { name: "E-mail szabályozás", checks, score, maxPoints: checks.length, passedPoints };
}
