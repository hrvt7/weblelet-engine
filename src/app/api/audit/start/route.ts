import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_MODULES_SZINT1, DEFAULT_MODULES_SZINT2 } from "@/lib/constants";
import type { AuditLevel } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, client_id, audit_level, modules, business_type, partner_data, email } = body;

    if (!url) {
      return NextResponse.json({ error: "URL megadása kötelező" }, { status: 400 });
    }

    const level: AuditLevel = audit_level || "szint1";
    const selectedModules = modules || (level === "szint2" ? DEFAULT_MODULES_SZINT2 : DEFAULT_MODULES_SZINT1);

    const supabase = createServiceClient();

    // 1. Audit sor létrehozása (GYORS)
    const { data: audit, error: insertError } = await supabase
      .from("audits")
      .insert({
        url: url.startsWith("http") ? url : `https://${url}`,
        client_id: client_id || null,
        audit_level: level,
        status: "pending",
        modules: selectedModules,
        partner_data: partner_data || null,
        email: email || null,
      })
      .select("id")
      .single();

    if (insertError || !audit) {
      return NextResponse.json({ error: "Nem sikerült létrehozni az auditot", details: insertError }, { status: 500 });
    }

    // 2. Supabase Edge Function triggerelése (fire-and-forget — NEM await-olt)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    fetch(`${supabaseUrl}/functions/v1/run-audit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        auditId: audit.id,
        url: url.startsWith("http") ? url : `https://${url}`,
        audit_level: level,
        modules: selectedModules,
        business_type: business_type || "Általános",
      }),
    }).catch(err => console.error("Edge function trigger error:", err));

    // 3. Azonnal visszaadjuk az ID-t (< 500ms)
    return NextResponse.json({ id: audit.id, status: "pending" });

  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
