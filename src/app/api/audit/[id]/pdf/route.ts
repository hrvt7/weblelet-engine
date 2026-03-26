import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServiceClient();

  const { data: audit, error } = await supabase
    .from("audits")
    .select("pdf_path")
    .eq("id", params.id)
    .single();

  if (error || !audit?.pdf_path) {
    return NextResponse.json({ error: "PDF nem található" }, { status: 404 });
  }

  const { data: fileData, error: downloadError } = await supabase.storage
    .from("audit-pdfs")
    .download(audit.pdf_path);

  if (downloadError || !fileData) {
    return NextResponse.json({ error: "PDF letöltés sikertelen" }, { status: 500 });
  }

  const buffer = Buffer.from(await fileData.arrayBuffer());

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${audit.pdf_path}"`,
    },
  });
}
