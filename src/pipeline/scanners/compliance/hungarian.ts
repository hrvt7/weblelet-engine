import type { FrameworkResult, ComplianceCheckResult } from "@/lib/types";

function textContains(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some(k => lower.includes(k.toLowerCase()));
}

export function scanHungarian(mainHtml: string, subPages: Record<string, string>): FrameworkResult {
  const allText = mainHtml + " " + Object.values(subPages).join(" ");
  const checks: ComplianceCheckResult[] = [];

  // H1: Impresszum / Cégadatok
  const hasCompanyInfo = textContains(allText, ["cégnév", "székhely"]) &&
    (textContains(allText, ["cégjegyzékszám"]) || textContains(allText, ["adószám"]));
  checks.push({
    id: "H1", label: "Impresszum / Cégadatok",
    passed: hasCompanyInfo || textContains(allText, ["impresszum"]),
    details: "Cégnév + székhely + cégjegyzékszám/adószám",
  });

  // H2: ÁSZF
  checks.push({
    id: "H2", label: "Általános Szerződési Feltételek",
    passed: textContains(allText, ["ászf", "általános szerződési", "felhasználási feltételek"]),
    details: "ÁSZF vagy felhasználási feltételek link/oldal",
  });

  // H3: Adatvédelmi tájékoztató (magyar)
  checks.push({
    id: "H3", label: "Magyar adatvédelmi tájékoztató",
    passed: !!subPages["privacy"] || textContains(allText, ["adatvédelmi tájékoztató", "adatkezelési tájékoztató"]),
    details: "Magyar nyelvű adatvédelmi tájékoztató",
  });

  // H4: Fogyasztóvédelmi tájékoztató
  checks.push({
    id: "H4", label: "Fogyasztóvédelmi tájékoztató",
    passed: textContains(allText, ["elállás", "békéltető", "fogyasztóvéd", "panasz"]),
    details: "Elállási jog, békéltető testület, panaszkezelés",
  });

  // H5: Cookie tájékoztató (magyar)
  checks.push({
    id: "H5", label: "Magyar sütitájékoztató",
    passed: textContains(allText, ["süti", "cookie"]) && textContains(allText, ["tájékoztató", "nyilatkozat", "szabályzat"]),
    details: "Magyar nyelvű sütitájékoztató",
  });

  // H6: NAIH nyilvántartás
  checks.push({
    id: "H6", label: "NAIH hivatkozás",
    passed: textContains(allText, ["naih", "nyilvántartási szám", "adatvédelmi hatóság"]),
    details: "NAIH nyilvántartási szám vagy hatósági hivatkozás",
  });

  // H7: Tárhelyszolgáltató
  checks.push({
    id: "H7", label: "Tárhelyszolgáltató adatai",
    passed: textContains(allText, ["tárhelyszolgáltató", "hosting"]) || (textContains(allText, ["szerver"]) && textContains(allText, ["cím", "név"])),
    details: "Tárhelyszolgáltató neve és címe (Eker. tv.)",
  });

  // H8: Szerzői jogi nyilatkozat
  checks.push({
    id: "H8", label: "Szerzői jogi nyilatkozat",
    passed: textContains(allText, ["©", "szerzői jog", "copyright", "minden jog"]),
    details: "Copyright jelzés az oldalon",
  });

  const passedPoints = checks.filter(c => c.passed).length;
  const score = Math.round((passedPoints / checks.length) * 100);

  return { name: "Magyar jogi", checks, score, maxPoints: checks.length, passedPoints };
}
