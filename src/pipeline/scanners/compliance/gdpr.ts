import type { FrameworkResult, ComplianceCheckResult } from "@/lib/types";

function textContains(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some(k => lower.includes(k.toLowerCase()));
}

export function scanGDPR(mainHtml: string, subPages: Record<string, string>): FrameworkResult {
  const allText = mainHtml + " " + Object.values(subPages).join(" ");
  const privacyText = subPages["privacy"] || "";
  const checks: ComplianceCheckResult[] = [];

  // G1: Cookie consent banner
  checks.push({
    id: "G1", label: "Cookie consent banner",
    passed: textContains(mainHtml, ["cookie", "consent", "cookiebot", "onetrust", "klaro", "cc-banner", "cookie-consent"]),
    details: "Cookie consent banner keresése a HTML-ben",
  });

  // G2: Granulált cookie beállítás
  checks.push({
    id: "G2", label: "Granulált cookie beállítás",
    passed: textContains(mainHtml, ["beállítások", "settings", "preferences", "testreszab"]),
    details: "Cookie beállítások / preferences lehetőség",
  });

  // G3: Adatvédelmi tájékoztató létezik
  checks.push({
    id: "G3", label: "Adatvédelmi tájékoztató",
    passed: textContains(allText, ["privacy", "adatvéd", "adatkezel"]) || !!subPages["privacy"],
    details: "Adatvédelmi oldal vagy link keresése",
  });

  // G4: Jogalap megjelölve
  checks.push({
    id: "G4", label: "Jogalap megjelölve",
    passed: textContains(privacyText || allText, ["jogalap", "hozzájárulás", "jogos érdek", "szerződés teljesítés", "legal basis"]),
    details: "Adatkezelési jogalap az adatvédelmi tájékoztatóban",
  });

  // G5: Érintetti jogok leírása
  checks.push({
    id: "G5", label: "Érintetti jogok",
    passed: textContains(privacyText || allText, ["törlés", "hozzáférés", "helyesbítés", "hordozhatóság"]),
    details: "Érintetti jogok (törlés, hozzáférés, stb.) leírása",
  });

  // G6: Törlési eljárás
  checks.push({
    id: "G6", label: "Törlési eljárás",
    passed: textContains(privacyText || allText, ["törlés", "kérelem", "delete", "erasure"]),
    details: "Adattörlési eljárás leírása",
  });

  // G7: Adathordozhatóság
  checks.push({
    id: "G7", label: "Adathordozhatóság",
    passed: textContains(privacyText || allText, ["hordozhatóság", "portability", "export"]),
    details: "Adathordozhatósági jog leírása",
  });

  // G8: DPO / Adatvédelmi felelős
  checks.push({
    id: "G8", label: "Adatvédelmi felelős (DPO)",
    passed: textContains(allText, ["adatvédelmi felelős", "dpo", "data protection officer"]),
    details: "Adatvédelmi felelős / DPO megjelölése",
  });

  // G9: Nemzetközi adattovábbítás
  checks.push({
    id: "G9", label: "Nemzetközi adattovábbítás",
    passed: textContains(privacyText || allText, ["továbbítás", "transfer", "egt", "eea", "scc", "harmadik ország"]),
    details: "Nemzetközi adattovábbítás leírása",
  });

  // G10: Adatvédelmi incidens
  checks.push({
    id: "G10", label: "Adatvédelmi incidens kezelés",
    passed: textContains(privacyText || allText, ["incidens", "breach", "72 óra"]),
    details: "Adatvédelmi incidens kezelési eljárás",
  });

  // G11: Hozzájárulás visszavonása
  checks.push({
    id: "G11", label: "Hozzájárulás visszavonása",
    passed: textContains(privacyText || allText, ["visszavon", "withdraw"]),
    details: "Hozzájárulás visszavonási lehetőség",
  });

  // G12: Harmadik felek
  checks.push({
    id: "G12", label: "Harmadik felek azonosítása",
    passed: textContains(privacyText || allText, ["harmadik", "third party", "adatfeldolgozó", "partner"]),
    details: "Harmadik fél adatfeldolgozók megnevezése",
  });

  // G13: Adatmegőrzési idő
  checks.push({
    id: "G13", label: "Adatmegőrzési idő",
    passed: textContains(privacyText || allText, ["megőrzés", "retention", "tárolás ideje", "megőrzési"]),
    details: "Adatmegőrzési időtartam megjelölése",
  });

  // G14: Sütitájékoztató részletesség
  const hasCookieDetail = textContains(allText, ["süti", "cookie"]) &&
    (textContains(allText, ["cél", "purpose"]) || textContains(allText, ["lejárat", "expiry"]));
  checks.push({
    id: "G14", label: "Sütitájékoztató részletesség",
    passed: hasCookieDetail,
    details: "Részletes sütitájékoztató (cél + lejárat)",
  });

  const passedPoints = checks.filter(c => c.passed).length;
  const score = Math.round((passedPoints / checks.length) * 100);

  return { name: "GDPR", checks, score, maxPoints: checks.length, passedPoints };
}
