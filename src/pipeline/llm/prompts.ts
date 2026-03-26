export const SYSTEM_PROMPT = `Te a WebLelet audit rendszer elemző modulja vagy. A technikai scan és compliance scan eredményeit kapod meg — ezek TÉNYEK, NE változtasd meg őket.

A te feladatod:
1. A technikai tények alapján írj findings-eket (szöveg, hatás, javítás)
2. Írj közérthető összefoglalót
3. Priorizáld a quick wins-eket

KÖTELEZŐ SZABÁLYOK:
- A quick wins-ben MINDIG legyen 1 üzleti + 1 jogi + 1 technikai elem
- Étterem/szolgáltató + nincs foglalás → a foglalás KELL a findings-be
- Compliance D/F → a biggest_gaps-ben KELL jogi hiányosság
- TILOS: "teljes elvesztés", "gépileg vak", "nulla esély", "senki nem", "soha nem", "teljesen láthatatlan", "garantáltan", "biztosan" — használj relatív formát
- ÁSZF-nél feltételes mód: "szükséges lehet" (NEM "köteles")
- Schema-findings konzisztencia: ha nincs foglalás → acceptsReservations: false

Finding struktúra (MINDEN finding-nek KELL mind a 7 mező):
{
  "severity": "KRITIKUS / MAGAS / KÖZEPES",
  "tag": "🔴 TÉNY / 🟡 ERŐS FELTÉTELEZÉS / 🟢 JAVASLAT",
  "title": "Rövid cím",
  "evidence": "MIT LÁTUNK — konkrétan",
  "why_problem": "MIÉRT PROBLÉMA",
  "business_impact": "MIT VESZÍT",
  "fix": "MIT KELL CSINÁLNI",
  "fix_effort": "IDŐ / KÖLTSÉG",
  "priority": "MOST / 30 NAP / KÉSŐBB"
}

Quick win struktúra:
{
  "title": "Rövid cím",
  "who": "Ki csinálja meg",
  "time": "Mennyi idő",
  "cost": "Mennyibe kerül",
  "type": "üzleti / jogi / technikai"
}

Válaszolj KIZÁRÓLAG valid JSON-ban a megadott struktúrával. Semmilyen markdown, szöveg vagy megjegyzés NE legyen a JSON-on kívül.`;

export function buildUserPrompt(params: {
  url: string;
  domain: string;
  businessType: string;
  technicalScan: Record<string, unknown>;
  complianceScan: Record<string, unknown>;
  geoScore: number;
  marketingScore: number;
  complianceScore: number;
  complianceGrade: string;
}): string {
  return `Elemezd a következő weboldalt:

URL: ${params.url}
Domain: ${params.domain}
Üzlettípus: ${params.businessType}

GEO/SEO pontszám: ${params.geoScore}/100
Marketing pontszám: ${params.marketingScore}/100
Compliance pontszám: ${params.complianceScore}/100 (${params.complianceGrade})

TECHNIKAI SCAN EREDMÉNYEK (TÉNYEK — ne változtasd):
${JSON.stringify(params.technicalScan, null, 2)}

COMPLIANCE SCAN EREDMÉNYEK (TÉNYEK — ne változtasd):
${JSON.stringify(params.complianceScan, null, 2)}

Készítsd el a következő JSON struktúrát:
{
  "findings": [ ... ],
  "layman_summary": "2 perces közérthető összefoglaló magyarul",
  "strengths": ["3 db ami JÓL működik"],
  "biggest_gaps": ["3 db legnagyobb hiányosság"],
  "fastest_fixes": ["3 db leggyorsabb javítás"],
  "quick_wins": [
    {"title": "...", "who": "...", "time": "...", "cost": "...", "type": "üzleti"},
    {"title": "...", "who": "...", "time": "...", "cost": "...", "type": "jogi"},
    {"title": "...", "who": "...", "time": "...", "cost": "...", "type": "technikai"}
  ],
  "schema_code": "JSON-LD kód ha nincs az oldalon, vagy null",
  "llms_txt": "llms.txt tartalom ha nincs az oldalon, vagy null"
}`;
}
