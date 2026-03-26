import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { runAuditPipeline } from "@/pipeline/orchestrator";
import { renderAuditHTML, generatePDF } from "@/pipeline/pdf/generator";
import type { AuditLevel, AuditModules, AuditConfig } from "@/lib/types";
import { DEFAULT_MODULES_SZINT1, DEFAULT_MODULES_SZINT2 } from "@/lib/constants";

export const maxDuration = 300; // 5 minutes

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, client_id, audit_level, modules, business_type, partner_data } = body;

    if (!url) {
      return NextResponse.json({ error: "URL megadása kötelező" }, { status: 400 });
    }

    const level: AuditLevel = audit_level || "szint1";
    const selectedModules: AuditModules = modules || (level === "szint2" ? DEFAULT_MODULES_SZINT2 : DEFAULT_MODULES_SZINT1);
    const businessType = business_type || "Általános";

    const supabase = createServiceClient();

    // Create audit record
    const { data: audit, error: insertError } = await supabase
      .from("audits")
      .insert({
        url,
        client_id: client_id || null,
        audit_level: level,
        status: "scanning",
        modules: selectedModules,
        partner_data: partner_data || null,
      })
      .select("id")
      .single();

    if (insertError || !audit) {
      return NextResponse.json({ error: "Nem sikerült létrehozni az auditot", details: insertError }, { status: 500 });
    }

    const auditId = audit.id;

    // Run pipeline (async — update status as it progresses)
    const updateStatus = async (status: string) => {
      await supabase.from("audits").update({ status, updated_at: new Date().toISOString() }).eq("id", auditId);
    };

    try {
      const result = await runAuditPipeline(url, level, selectedModules, businessType, updateStatus);

      // Update audit with results
      await supabase.from("audits").update({
        status: result.validation.passed ? "generating" : "failed",
        raw_html: result.rawHtml.substring(0, 100000), // Limit stored HTML
        technical_scan: result.technicalScan,
        compliance_scan: result.complianceScan,
        audit_json: result.auditJson,
        validation_result: result.validation,
        geo_score: result.auditJson.geo_score,
        marketing_score: result.auditJson.marketing_score,
        compliance_score: result.auditJson.compliance_score,
        compliance_grade: result.auditJson.compliance_grade,
        sales_score: result.auditJson.sales_score || null,
        processing_time_ms: result.processingTimeMs,
        llm_tokens_used: result.tokensUsed,
        error_message: result.validation.passed ? null : result.validation.errors.join("; "),
        updated_at: new Date().toISOString(),
      }).eq("id", auditId);

      if (!result.validation.passed) {
        return NextResponse.json({
          id: auditId,
          status: "failed",
          validation: result.validation,
        });
      }

      // Generate PDF
      const { data: configData } = await supabase
        .from("audit_config")
        .select("*")
        .limit(1)
        .single();

      const config: AuditConfig = configData || {
        id: "",
        user_id: "",
        company_name: "WebLelet",
        company_tagline: "AI-alapú weboldal elemző rendszer",
        primary_color: "#2563EB",
        accent_color: "#F59E0B",
        logo_url: null,
        contact_email: "info@weblelet.hu",
        contact_phone: null,
        contact_website: "https://weblelet.hu",
      };

      const html = renderAuditHTML(result.auditJson, config);
      const pdfBuffer = await generatePDF(html);

      // Upload PDF to Supabase Storage
      const pdfFileName = `audit-${result.auditJson.domain}-${result.auditJson.date}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("audit-pdfs")
        .upload(pdfFileName, pdfBuffer, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (uploadError) {
        console.error("PDF upload error:", uploadError);
      }

      // Final update
      await supabase.from("audits").update({
        status: "completed",
        pdf_path: pdfFileName,
        pdf_generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", auditId);

      return NextResponse.json({
        id: auditId,
        status: "completed",
        scores: {
          geo: result.auditJson.geo_score,
          marketing: result.auditJson.marketing_score,
          compliance: result.auditJson.compliance_score,
          compliance_grade: result.auditJson.compliance_grade,
        },
        processing_time_ms: result.processingTimeMs,
        pdf_path: pdfFileName,
      });

    } catch (pipelineError) {
      await supabase.from("audits").update({
        status: "failed",
        error_message: (pipelineError as Error).message,
        updated_at: new Date().toISOString(),
      }).eq("id", auditId);

      return NextResponse.json({
        id: auditId,
        status: "failed",
        error: (pipelineError as Error).message,
      }, { status: 500 });
    }

  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
