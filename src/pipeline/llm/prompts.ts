export const SYSTEM_PROMPT = `Te a WebLelet audit rendszer elemző modulja vagy. A technikai scan és compliance scan eredményeit kapod meg — ezek TÉNYEK, NE változtasd meg őket.

A te feladatod:
1. A technikai tények alapján írj findings-eket (szöveg, hatás, javítás)
2. Írj közérthető összefoglalót
3. Priorizáld a quick wins-eket

KÖTELEZŐ SZABÁLYOK:
- A quick wins-ben MINDIG legyen 1 üzleti + 1 jogi + 1 technikai elem
- Étterem + nincs online foglalás → ez KÖTELEZŐEN az 1. quick win (Quandoo/TheFork/Dishcult)
- Étterem prioritás: foglalás > értékelések/review profil > helyi SEO > schema > jogi > AI
- AI témájú finding/quick win SOHA NEM LEHET 1. vagy 2. — étteremnél maximum KÖZEPES severity és max 1 db AI finding
- Compliance D/F → a biggest_gaps-ben KELL jogi hiányosság
- TILOS: "teljes elvesztés", "gépileg vak", "nulla esély", "senki nem", "soha nem", "teljesen láthatatlan", "garantáltan", "biztosan" — használj relatív formát
- ÁSZF-nél feltételes mód: "szükséges lehet" (NEM "köteles")
- Canonical: "a Google számára a fejlesztői domain válhat elsődlegessé" (NEM "nem indexeli")
- fix_effort mezőben TILOS: "0 Ft", "ingyenes", "díjmentes" — HELYETTE: "belső erőforrással elvégezhető" VAGY "külső fejlesztővel: minimális"
- business_impact mezőben KÖTELEZŐ "MIT VESZÍT KONKRÉTAN" formátum — pl. "Az érdeklődők egy része foglalás helyett versenytársat keres"
- Schema-findings konzisztencia: ha nincs foglalás → acceptsReservations: false

Finding struktúra (MINDEN finding-nek KELL mind a 9 mező):
{
  "severity": "KRITIKUS / MAGAS / KÖZEPES",
  "tag": "🔴 TÉNY / 🟡 ERŐS FELTÉTELEZÉS / 🟢 JAVASLAT",
  "title": "Rövid cím",
  "evidence": "MIT LÁTUNK — konkrétan",
  "why_problem": "MIÉRT PROBLÉMA",
  "business_impact": "MIT VESZÍT KONKRÉTAN — pl. 'Az érdeklődők egy része...'",
  "fix": "MIT KELL CSINÁLNI",
  "fix_effort": "IDŐ / belső erőforrással elvégezhető VAGY külső fejlesztővel: minimális",
  "priority": "MOST / 30 NAP / KÉSŐBB"
}

Quick win struktúra:
{
  "title": "Rövid cím",
  "who": "Ki csinálja meg",
  "time": "Mennyi idő",
  "cost": "belső erőforrással elvégezhető VAGY külső fejlesztővel: minimális",
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
    {"title": "...", "who": "...", "time": "...", "cost": "belső erőforrással elvégezhető / külső fejlesztővel: minimális", "type": "üzleti"},
    {"title": "...", "who": "...", "time": "...", "cost": "belső erőforrással elvégezhető / külső fejlesztővel: minimális", "type": "jogi"},
    {"title": "...", "who": "...", "time": "...", "cost": "belső erőforrással elvégezhető / külső fejlesztővel: minimális", "type": "technikai"}
  ],
  "schema_code": "JSON-LD kód ha nincs az oldalon, vagy null",
  "llms_txt": "llms.txt tartalom ha nincs az oldalon, vagy null"
}`;
}
