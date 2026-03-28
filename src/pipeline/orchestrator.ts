import type { AuditLevel, AuditJSON, ValidationResult, AuditModules, TechnicalScan } from "@/lib/types";
import { fetchUrl } from "./fetcher";
import { runTechnicalScan } from "./scanners/technical";
import { calculateGeoScore, calculateSeoScore } from "./scanners/scores";
import { runLLMAnalysis } from "./llm/analyzer";
import { buildAuditJSON } from "./builder";
import { validateAuditJSON } from "./validator";

export interface OrchestratorResult {
  auditJson: AuditJSON;
  validation: ValidationResult;
  rawHtml: string;
  technicalScan: TechnicalScan;
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

  // Phase 3: Score calculation (deterministic)
  const geoScore = calculateGeoScore(technicalScan);
  const seoScore = calculateSeoScore(technicalScan);

  // Phase 4: LLM analysis (with retry on validation failure)
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
      geoScore,
      seoScore,
    });

    tokensUsed += llmResult.tokensUsed;

    // Phase 5: Build audit JSON
    auditJson = buildAuditJSON({
      url,
      businessType,
      level,
      technicalScan,
      llmAnalysis: llmResult.analysis,
      geoScore,
      seoScore,
    });

    // Phase 6: Validate
    await onStatus?.("validating");
    validation = validateAuditJSON(auditJson);

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
    tokensUsed,
    processingTimeMs: Date.now() - startTime,
  };
}
