import type { AuditJSON, ValidationResult, AuditLevel } from "@/lib/types";
import { FORBIDDEN_PHRASES } from "@/lib/constants";

export function validateAuditJSON(data: AuditJSON, level: AuditLevel): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Kötelező mezők
  const requiredFields: (keyof AuditJSON)[] = [
    "domain", "audit_level", "geo_score", "marketing_score",
    "compliance_score", "compliance_grade", "findings",
    "quick_wins", "strengths", "biggest_gaps", "fastest_fixes",
    "layman_summary",
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

  // 3. Quick win mix — nem lehet mind technikai
  if (data.quick_wins && Array.isArray(data.quick_wins)) {
    if (data.quick_wins.length < 3) {
      errors.push(`Quick wins: minimum 3 kell, van ${data.quick_wins.length}`);
    }
    const types = data.quick_wins.map(qw => qw.type);
    const hasUzleti = types.includes("üzleti");
    const hasJogi = types.includes("jogi");

    if (!hasUzleti && !hasJogi) {
      warnings.push("Quick wins: nincs üzleti vagy jogi típusú — ajánlott a mix");
    }
    if (types.every(t => t === "technikai")) {
      errors.push("Quick wins: nem lehet mind technikai — kell üzleti és jogi is");
    }
  }

  // 4. Compliance integrálás — D/F grade → kell jogi finding
  if (data.compliance_grade && ["D", "F"].includes(data.compliance_grade)) {
    const hasLegalFinding = data.findings?.some(f =>
      f.tag?.includes("TÉNY") && (
        f.title?.toLowerCase().includes("gdpr") ||
        f.title?.toLowerCase().includes("jogi") ||
        f.title?.toLowerCase().includes("adatvédel") ||
        f.title?.toLowerCase().includes("compliance") ||
        f.title?.toLowerCase().includes("megfelelőség")
      )
    );
    if (!hasLegalFinding) {
      errors.push("Compliance D/F, de nincs jogi finding — kötelező hozzáadni");
    }

    const hasLegalGap = data.biggest_gaps?.some(g =>
      g.toLowerCase().includes("jogi") ||
      g.toLowerCase().includes("gdpr") ||
      g.toLowerCase().includes("adatvédel") ||
      g.toLowerCase().includes("megfelelőség")
    );
    if (!hasLegalGap) {
      errors.push("Compliance D/F, de a biggest_gaps-ben nincs jogi elem");
    }
  }

  // 5. Étterem foglalás — ha étterem és nincs foglalás
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

  // 6. Schema konzisztencia
  if (data.schema_code && isRestaurant) {
    const hasReservationInSchema = data.schema_code.includes("acceptsReservations");
    const hasReservationFinding = data.findings?.some(f =>
      f.title?.toLowerCase().includes("foglalás")
    );
    if (hasReservationFinding && hasReservationInSchema && data.schema_code.includes('"acceptsReservations": true')) {
      warnings.push("Schema: acceptsReservations: true, de van foglalás hiány finding — konzisztencia hiba");
    }
  }

  // 7. Tiltott kifejezések
  const fullText = JSON.stringify(data);
  for (const phrase of FORBIDDEN_PHRASES) {
    if (fullText.toLowerCase().includes(phrase.toLowerCase())) {
      errors.push(`Tiltott kifejezés a szövegben: "${phrase}"`);
    }
  }

  // 8. Szint 2 extra mezők
  if (level === "szint2") {
    if (!data.sales_score && data.sales_score !== 0) {
      errors.push("Szint 2: hiányzó sales_score");
    }
    if (!data.proposal_packages || data.proposal_packages.length === 0) {
      errors.push("Szint 2: hiányzó proposal_packages");
    }
    if (!data.action_plan || data.action_plan.length === 0) {
      errors.push("Szint 2: hiányzó action_plan");
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}
