import Handlebars from "handlebars";
import fs from "fs";
import path from "path";
import type { AuditJSON, AuditConfig } from "@/lib/types";

const TEMPLATES_DIR = path.join(process.cwd(), "src/pipeline/pdf/templates");
const STYLES_DIR = path.join(process.cwd(), "src/pipeline/pdf/styles");

// Register Handlebars helpers
Handlebars.registerHelper("eq", (a, b) => a === b);
Handlebars.registerHelper("gt", (a, b) => a > b);
Handlebars.registerHelper("gte", (a, b) => a >= b);
Handlebars.registerHelper("lt", (a, b) => a < b);
Handlebars.registerHelper("lte", (a, b) => a <= b);
Handlebars.registerHelper("scoreColor", (score: number) => {
  if (score >= 75) return "var(--success)";
  if (score >= 50) return "var(--warning)";
  return "var(--danger)";
});
Handlebars.registerHelper("gradeColor", (grade: string) => {
  if (grade === "A" || grade === "B") return "var(--success)";
  if (grade === "C") return "var(--warning)";
  return "var(--danger)";
});
Handlebars.registerHelper("severityClass", (severity: string) => {
  const lower = severity?.toLowerCase() || "";
  if (lower.includes("kritikus")) return "critical";
  if (lower.includes("magas")) return "high";
  return "medium";
});
Handlebars.registerHelper("inc", (val: number) => val + 1);
Handlebars.registerHelper("json", (obj: unknown) => JSON.stringify(obj, null, 2));

function loadTemplate(name: string): Handlebars.TemplateDelegate {
  const filePath = path.join(TEMPLATES_DIR, `${name}.hbs`);
  const source = fs.readFileSync(filePath, "utf-8");
  return Handlebars.compile(source);
}

function loadCSS(): string {
  return fs.readFileSync(path.join(STYLES_DIR, "audit.css"), "utf-8");
}

export function renderAuditHTML(data: AuditJSON, config: AuditConfig): string {
  // Load templates
  const baseTemplate = loadTemplate("base");

  // Register partials
  const partialNames = [
    "cover", "layman", "quick_wins", "scorecard", "findings",
    "next_steps", "executive", "methodology", "proposal",
    "competitors", "action_plan", "appendix", "separator",
  ];

  for (const name of partialNames) {
    try {
      const filePath = path.join(TEMPLATES_DIR, `${name}.hbs`);
      const source = fs.readFileSync(filePath, "utf-8");
      Handlebars.registerPartial(name, source);
    } catch {
      // Partial not yet created — skip
    }
  }

  const css = loadCSS();

  // Build template context
  const context = {
    ...data,
    config,
    css,
    isSzint1: data.audit_level === "szint1",
    isSzint2: data.audit_level === "szint2",
    crawlerEntries: data.technical_scan?.robots_txt?.aiCrawlers
      ? Object.entries(data.technical_scan.robots_txt.aiCrawlers).map(([name, status]) => ({ name, status }))
      : [],
    complianceFrameworks: data.compliance_scan
      ? [
          data.compliance_scan.gdpr,
          data.compliance_scan.hungarian,
          data.compliance_scan.accessibility,
          data.compliance_scan.pci,
          data.compliance_scan.canspam,
        ]
      : [],
  };

  return baseTemplate(context);
}

export async function generatePDF(html: string): Promise<Buffer> {
  const apiKey = process.env.PDFBOLT_API_KEY;
  if (!apiKey) throw new Error("PDFBOLT_API_KEY hiányzik");

  const response = await fetch("https://api.pdfbolt.com/v1/direct", {
    method: "POST",
    headers: {
      "API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      html,
      options: {
        format: "A4",
        margin: { top: "1.8cm", right: "2cm", bottom: "2.2cm", left: "2cm" },
        printBackground: true,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`PDFBolt hiba: ${response.status} ${response.statusText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}
