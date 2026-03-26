import type { AuditLevel, AuditJSON, ValidationResult, AuditModules } from "@/lib/types";
import { fetchUrl } from "./fetcher";
import { runTechnicalScan } from "./scanners/technical";
import { runComplianceScan } from "./scanners/compliance";
import { calculateGeoScore, calculateMarketingScore } from "./scanners/scores";
import { runLLMAnalysis } from "./llm/analyzer";
import { buildAuditJSON } from "./builder";
import { validateAuditJSON } from "./validator";

export interface OrchestratorResult {
  auditJson: AuditJSON;
  validation: ValidationResult;
  rawHtml: string;
  technicalScan: ReturnType<typeof runTechnicalScan>;
  complianceScan: ReturnType<typeof runComplianceScan>;
  tokensUsed: number;
  processingTimeMs: number;
}

export type StatusCallback = (status: string) => Promise<void>;

const MAX_RETRIES = 2;

export async function runAuditPipeline(
  url: string,
  level: AuditLevel,
  modules: AuditModules,
  businessType: string,
  onStatus?: StatusCallback
): Promise<OrchestratorResult> {
  const startTime = Date.now();

  // Phase 1: Fetch
  await onStatus?.("scanning");
  const fetchResult = await fetchUrl(url);

  // Phase 2: Technical scan (deterministic)
  const technicalScan = runTechnicalScan(fetchResult);

  // Phase 3: Compliance scan (deterministic)
  const complianceScan = runComplianceScan(fetchResult);

  // Phase 4: Score calculation (deterministic)
  const geoScore = calculateGeoScore(technicalScan);
  const marketingScore = calculateMarketingScore(technicalScan);

  // Phase 5: LLM analysis (with retry on validation failure)
  await onStatus?.("analyzing");
  let tokensUsed = 0;
  let auditJson: AuditJSON | null = null;
  let validation: ValidationResult = { passed: false, errors: ["Nem futott le a validáció"], warnings: [] };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const llmResult = await runLLMAnalysis({
      url,
      domain: new URL(url).hostname,
      businessType,
      technicalScan,
      complianceScan,
      geoScore,
      marketingScore,
      complianceScore: complianceScan.overall_score,
      complianceGrade: complianceScan.grade,
    });

    tokensUsed += llmResult.tokensUsed;

    // Phase 6: Build audit JSON
    auditJson = buildAuditJSON({
      url,
      businessType,
      level,
      technicalScan,
      complianceScan,
      llmAnalysis: llmResult.analysis,
      geoScore,
      marketingScore,
    });

    // Phase 7: Validate
    await onStatus?.("validating");
    validation = validateAuditJSON(auditJson, level);

    if (validation.passed) break;

    if (attempt < MAX_RETRIES) {
      console.warn(`Validáció FAIL (kísérlet ${attempt + 1}/${MAX_RETRIES + 1}):`, validation.errors);
    }
  }

  if (!auditJson) {
    throw new Error("A pipeline nem tudott érvényes audit JSON-t generálni");
  }

  return {
    auditJson,
    validation,
    rawHtml: fetchResult.html,
    technicalScan,
    complianceScan,
    tokensUsed,
    processingTimeMs: Date.now() - startTime,
  };
}
