import type { AuditJSON, AuditLevel, TechnicalScan, LLMAnalysis } from "@/lib/types";

export function buildAuditJSON(params: {
  url: string;
  businessType: string;
  level: AuditLevel;
  technicalScan: TechnicalScan;
  llmAnalysis: LLMAnalysis;
  geoScore: number;
  seoScore: number;
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
    seo_score: params.seoScore,
    findings: params.llmAnalysis.findings,
    quick_wins: params.llmAnalysis.quick_wins,
    strengths: params.llmAnalysis.strengths,
    biggest_gaps: params.llmAnalysis.biggest_gaps,
    fastest_fixes: params.llmAnalysis.fastest_fixes,
    layman_summary: params.llmAnalysis.layman_summary,
    technical_scan: params.technicalScan,
    schema_code: params.llmAnalysis.schema_code,
    llms_txt: params.llmAnalysis.llms_txt,
  };
}
