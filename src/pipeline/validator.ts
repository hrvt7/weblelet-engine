import type { AuditJSON, ValidationResult } from "@/lib/types";
import { FORBIDDEN_PHRASES } from "@/lib/constants";

export function validateAuditJSON(data: AuditJSON): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Kötelező mezők
  const requiredFields: (keyof AuditJSON)[] = [
    "domain", "audit_level", "geo_score", "seo_score",
    "findings", "quick_wins", "strengths", "biggest_gaps",
    "fastest_fixes", "layman_summary",
  ];

  for (const field of requiredFields) {
    if (data[field] === undefined || data[field] === null) {
      errors.push(`Hiányzó kötelező mező: ${field}`);
    }
  }

  // 2. Finding mezők ellenőrzése
  if (data.findings && Array.isArray(data.findings)) {
    const requiredFindingFields = ["severity", "tag", "title", "evidence", "why_problem", "business_impact", "fix"];
    for (let i = 0; i < data.findings.length; i++) {
      const finding = data.findings[i];
      for (const field of requiredFindingFields) {
        if (!(field in finding) || !finding[field as keyof typeof finding]) {
          errors.push(`Finding #${i + 1}: hiányzó mező: ${field}`);
        }
      }
    }
  } else {
    errors.push("findings mező hiányzik vagy nem tömb");
  }

  // 3. Quick win mix — kell geo + seo + technikai
  if (data.quick_wins && Array.isArray(data.quick_wins)) {
    if (data.quick_wins.length < 3) {
      errors.push(`Quick wins: minimum 3 kell, van ${data.quick_wins.length}`);
    }
    const types = data.quick_wins.map(qw => qw.type);
    const hasGeo = types.includes("geo");
    const hasSeo = types.includes("seo");

    if (!hasGeo && !hasSeo) {
      warnings.push("Quick wins: nincs geo vagy seo típusú — ajánlott a mix");
    }
    if (types.every(t => t === "technikai")) {
      errors.push("Quick wins: nem lehet mind technikai — kell geo és seo is");
    }
  }

  // 4. Étterem foglalás — ha étterem és nincs foglalás
  const isRestaurant = data.business_type?.toLowerCase().includes("étterem") ||
    data.business_type?.toLowerCase().includes("vendéglátó") ||
    data.business_type?.toLowerCase().includes("restaurant");

  if (isRestaurant) {
    const hasReservation = data.technical_scan?.schema_markup?.jsonLd?.includes("acceptsReservations") ||
      data.findings?.some(f => f.title?.toLowerCase().includes("foglalás"));
    if (!hasReservation) {
      warnings.push("Étterem típus, de nincs foglalás-related finding — ellenőrizd");
    }
  }

  // 5. Schema konzisztencia
  if (data.schema_code && isRestaurant) {
    const hasReservationInSchema = data.schema_code.includes("acceptsReservations");
    const hasReservationFinding = data.findings?.some(f =>
      f.title?.toLowerCase().includes("foglalás")
    );
    if (hasReservationFinding && hasReservationInSchema && data.schema_code.includes('"acceptsReservations": true')) {
      warnings.push("Schema: acceptsReservations: true, de van foglalás hiány finding — konzisztencia hiba");
    }
  }

  // 6. Tiltott kifejezések
  const fullText = JSON.stringify(data);
  for (const phrase of FORBIDDEN_PHRASES) {
    if (fullText.toLowerCase().includes(phrase.toLowerCase())) {
      errors.push(`Tiltott kifejezés a szövegben: "${phrase}"`);
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}
