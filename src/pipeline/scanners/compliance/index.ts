import type { ComplianceScan, FetchResult } from "@/lib/types";
import { COMPLIANCE_WEIGHTS, scoreToGrade } from "@/lib/constants";
import { scanGDPR } from "./gdpr";
import { scanHungarian } from "./hungarian";
import { scanAccessibility } from "./accessibility";
import { scanPCI } from "./pci";
import { scanCanSpam } from "./canspam";

export function runComplianceScan(fetchResult: FetchResult): ComplianceScan {
  const { html, subPages, url } = fetchResult;

  const gdpr = scanGDPR(html, subPages);
  const hungarian = scanHungarian(html, subPages);
  const accessibility = scanAccessibility(html);
  const pci = scanPCI(html, url);
  const canspam = scanCanSpam(html, subPages);

  const overall_score = Math.round(
    gdpr.score * COMPLIANCE_WEIGHTS.gdpr +
    hungarian.score * COMPLIANCE_WEIGHTS.hungarian +
    accessibility.score * COMPLIANCE_WEIGHTS.accessibility +
    pci.score * COMPLIANCE_WEIGHTS.pci +
    canspam.score * COMPLIANCE_WEIGHTS.canspam
  );

  return {
    gdpr,
    hungarian,
    accessibility,
    pci,
    canspam,
    overall_score,
    grade: scoreToGrade(overall_score),
  };
}
