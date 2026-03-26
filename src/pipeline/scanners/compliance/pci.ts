import type { FrameworkResult, ComplianceCheckResult } from "@/lib/types";

function textContains(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some(k => lower.includes(k.toLowerCase()));
}

export function scanPCI(html: string, url: string): FrameworkResult {
  const checks: ComplianceCheckResult[] = [];
  const htmlLower = html.toLowerCase();

  // P1: HTTPS
  checks.push({
    id: "P1", label: "HTTPS titkosítás",
    passed: url.startsWith("https://"),
    details: url.startsWith("https://") ? "HTTPS aktív" : "Nincs HTTPS — biztonsági kockázat",
  });

  // P2: Hosted payment
  const paymentProviders = ["stripe", "paypal", "simplepay", "barion", "braintree", "square", "otp", "borgun"];
  const detectedProvider = paymentProviders.find(p => htmlLower.includes(p));
  checks.push({
    id: "P2", label: "Hosted fizetési felület",
    passed: !!detectedProvider,
    details: detectedProvider ? `Fizetési szolgáltató: ${detectedProvider}` : "Nem észlelhető fizetési szolgáltató",
  });

  // P3: Kártya adat nem URL-ben
  const hasCardInUrl = htmlLower.includes("ccnum") || htmlLower.includes("cardnumber") || htmlLower.includes("card_number");
  checks.push({
    id: "P3", label: "Kártyaadat nem URL-ben",
    passed: !hasCardInUrl,
    details: hasCardInUrl ? "Kártyaadat hivatkozás észlelve" : "Nem található kártyaadat az URL-ekben",
  });

  // P4: Biztonsági oldal
  checks.push({
    id: "P4", label: "Biztonsági tájékoztató oldal",
    passed: textContains(html, ["security", "biztonság", "trust", "biztonsági"]),
    details: "Biztonsági oldal vagy biztonságra utaló tartalom",
  });

  // P5: Biztonsági jelvények
  checks.push({
    id: "P5", label: "Biztonsági jelvények",
    passed: textContains(html, ["ssl", "secure", "pci", "norton", "mcafee", "comodo", "trustwave"]),
    details: "SSL/biztonsági jelvények keresése",
  });

  // P6: Payment processor azonosítás
  checks.push({
    id: "P6", label: "Fizetési szolgáltató azonosítható",
    passed: !!detectedProvider,
    details: detectedProvider ? `Azonosított: ${detectedProvider}` : "Nem azonosítható fizetési szolgáltató",
  });

  const passedPoints = checks.filter(c => c.passed).length;
  const score = Math.round((passedPoints / checks.length) * 100);

  return { name: "Fizetési biztonság (PCI)", checks, score, maxPoints: checks.length, passedPoints };
}
