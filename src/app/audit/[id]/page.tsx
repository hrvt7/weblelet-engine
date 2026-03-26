"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { Audit } from "@/lib/types";

function ScoreGauge({ label, score, grade }: { label: string; score: number | null; grade?: string | null }) {
  if (score === null) return null;
  const color = score >= 75 ? "text-green-600" : score >= 50 ? "text-yellow-600" : "text-red-600";
  return (
    <div className="text-center">
      <div className={`text-3xl font-bold ${color}`}>{score}</div>
      <div className="text-xs text-gray-500 mt-1">{label}{grade ? ` (${grade})` : ""}</div>
    </div>
  );
}

const STATUS_STEPS = ["scanning", "analyzing", "validating", "generating", "completed"];
const STATUS_LABELS: Record<string, string> = {
  pending: "Várakozik", scanning: "Scanelés", analyzing: "LLM elemzés",
  validating: "Validálás", generating: "PDF generálás", completed: "Kész", failed: "Hiba",
};

export default function AuditResultPage() {
  const { id } = useParams<{ id: string }>();
  const [audit, setAudit] = useState<Audit | null>(null);
  const [loading, setLoading] = useState(true);
  const [showJson, setShowJson] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/audit/${id}`);
        if (res.ok) {
          const data = await res.json();
          setAudit(data as Audit);
        }
      } catch (e) {
        console.error("Audit load error:", e);
      }
      setLoading(false);
    }
    load();

    // Poll if in progress
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/audit/${id}`);
        if (res.ok) {
          const data = await res.json();
          setAudit(data as Audit);
          if (data.status === "completed" || data.status === "failed") {
            clearInterval(interval);
          }
        }
      } catch (e) {
        console.error("Poll error:", e);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [id]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Betöltés...</div>;
  if (!audit) return <div className="min-h-screen flex items-center justify-center text-red-500">Audit nem található</div>;

  const currentStep = STATUS_STEPS.indexOf(audit.status);
  const auditJson = audit.audit_json as Record<string, unknown> | null;

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
            <span className="text-xl font-bold">Web<span className="text-blue-600">Lelet</span> Engine</span>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{audit.url}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {audit.audit_level === "szint2" ? "Teljes audit" : "Diagnózis"} — {new Date(audit.created_at).toLocaleDateString("hu-HU")}
            </p>
          </div>
          {audit.pdf_path && (
            <a
              href={`/api/audit/${audit.id}/pdf`}
              className="inline-flex items-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              PDF letöltés
            </a>
          )}
        </div>

        {/* Progress bar */}
        {audit.status !== "completed" && audit.status !== "failed" && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-3">
              {STATUS_STEPS.map((step, i) => (
                <div key={step} className="flex items-center">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    i <= currentStep ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-400"
                  }`}>
                    {i + 1}
                  </div>
                  {i < STATUS_STEPS.length - 1 && (
                    <div className={`w-16 h-0.5 mx-1 ${i < currentStep ? "bg-blue-600" : "bg-gray-200"}`} />
                  )}
                </div>
              ))}
            </div>
            <p className="text-sm text-center text-gray-500">
              {STATUS_LABELS[audit.status] || audit.status}...
            </p>
          </div>
        )}

        {/* Error */}
        {audit.status === "failed" && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-6">
            <h3 className="font-bold text-red-700 mb-2">Hiba történt</h3>
            <p className="text-sm text-red-600">{audit.error_message || "Ismeretlen hiba"}</p>
          </div>
        )}

        {/* Scores */}
        {audit.geo_score !== null && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h3 className="font-bold text-gray-900 mb-4">Pontszámok</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <ScoreGauge label="GEO/SEO" score={audit.geo_score} />
              <ScoreGauge label="Marketing" score={audit.marketing_score} />
              <ScoreGauge label="Compliance" score={audit.compliance_score} grade={audit.compliance_grade} />
              <ScoreGauge label="Sales" score={audit.sales_score} />
            </div>
          </div>
        )}

        {/* Validation */}
        {audit.validation_result && (
          <div className={`rounded-xl border p-6 mb-6 ${
            (audit.validation_result as { passed: boolean }).passed
              ? "bg-green-50 border-green-200"
              : "bg-red-50 border-red-200"
          }`}>
            <h3 className={`font-bold mb-2 ${
              (audit.validation_result as { passed: boolean }).passed ? "text-green-700" : "text-red-700"
            }`}>
              Validáció: {(audit.validation_result as { passed: boolean }).passed ? "PASS" : "FAIL"}
            </h3>
            {((audit.validation_result as { errors: string[] }).errors || []).map((err: string, i: number) => (
              <p key={i} className="text-sm text-red-600">- {err}</p>
            ))}
            {((audit.validation_result as { warnings: string[] }).warnings || []).map((w: string, i: number) => (
              <p key={i} className="text-sm text-yellow-600">- {w}</p>
            ))}
          </div>
        )}

        {/* Processing info */}
        {audit.processing_time_ms && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">Feldolgozási idő:</span> <strong>{Math.round(audit.processing_time_ms / 1000)}s</strong></div>
              <div><span className="text-gray-500">LLM token használat:</span> <strong>{audit.llm_tokens_used?.toLocaleString() || "–"}</strong></div>
            </div>
          </div>
        )}

        {/* JSON toggle */}
        {auditJson && (
          <div className="mb-6">
            <button
              onClick={() => setShowJson(!showJson)}
              className="text-sm text-blue-600 hover:underline"
            >
              {showJson ? "JSON elrejtése" : "JSON megtekintése (debug)"}
            </button>
            {showJson && (
              <pre className="mt-3 bg-gray-900 text-gray-100 rounded-xl p-6 overflow-auto text-xs max-h-[600px]">
                {JSON.stringify(auditJson, null, 2)}
              </pre>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
