import type { AuditJSON, AuditLevel, TechnicalScan, ComplianceScan, LLMAnalysis } from "@/lib/types";

export function buildAuditJSON(params: {
  url: string;
  businessType: string;
  level: AuditLevel;
  technicalScan: TechnicalScan;
  complianceScan: ComplianceScan;
  llmAnalysis: LLMAnalysis;
  geoScore: number;
  marketingScore: number;
}): AuditJSON {
  const domain = new URL(params.url).hostname.replace("www.", "");
  const brandName = domain.split(".")[0].charAt(0).toUpperCase() + domain.split(".")[0].slice(1);
  const date = new Date().toISOString().split("T")[0];

  return {
    url: params.url,
    domain,
    brand_name: brandName,
    date,
    business_type: params.businessType,
    audit_level: params.level,
    geo_score: params.geoScore,
    marketing_score: params.marketingScore,
    compliance_score: params.complianceScan.overall_score,
    compliance_grade: params.complianceScan.grade,
    findings: params.llmAnalysis.findings,
    quick_wins: params.llmAnalysis.quick_wins,
    strengths: params.llmAnalysis.strengths,
    biggest_gaps: params.llmAnalysis.biggest_gaps,
    fastest_fixes: params.llmAnalysis.fastest_fixes,
    layman_summary: params.llmAnalysis.layman_summary,
    technical_scan: params.technicalScan,
    compliance_scan: params.complianceScan,
    schema_code: params.llmAnalysis.schema_code,
    llms_txt: params.llmAnalysis.llms_txt,
  };
}
