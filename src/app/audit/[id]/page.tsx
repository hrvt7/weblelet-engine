"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { Audit, Finding, QuickWin } from "@/lib/types";

function ScoreGauge({ label, score, grade }: { label: string; score: number | null; grade?: string | null }) {
  if (score === null) return null;
  const color = score >= 75 ? "text-green-600" : score >= 50 ? "text-yellow-600" : "text-red-600";
  const bg = score >= 75 ? "bg-green-50" : score >= 50 ? "bg-yellow-50" : "bg-red-50";
  return (
    <div className={`text-center rounded-xl ${bg} p-4`}>
      <div className={`text-3xl font-bold ${color}`}>{score}</div>
      <div className="text-xs text-gray-500 mt-1">{label}{grade ? ` (${grade})` : ""}</div>
    </div>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  const sevColors: Record<string, string> = {
    "KRITIKUS": "border-l-red-500 bg-red-50/50",
    "MAGAS": "border-l-amber-500 bg-amber-50/50",
    "KÖZEPES": "border-l-blue-500 bg-blue-50/50",
  };
  const badgeColors: Record<string, string> = {
    "KRITIKUS": "bg-red-100 text-red-700",
    "MAGAS": "bg-amber-100 text-amber-700",
    "KÖZEPES": "bg-blue-100 text-blue-700",
  };
  return (
    <div className={`border border-gray-200 border-l-4 rounded-lg p-4 ${sevColors[finding.severity] || ""}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeColors[finding.severity] || ""}`}>{finding.severity}</span>
        <span className="text-[10px] text-gray-500">{finding.tag}</span>
      </div>
      <h4 className="font-semibold text-sm text-gray-900 mb-1">{finding.title}</h4>
      {finding.evidence && <p className="text-xs text-gray-600 mb-1"><strong>Mit látunk:</strong> {finding.evidence}</p>}
      {finding.why_problem && <p className="text-xs text-gray-600 mb-1"><strong>Miért probléma:</strong> {finding.why_problem}</p>}
      {finding.fix && <p className="text-xs text-gray-600"><strong>Javítás:</strong> {finding.fix}</p>}
    </div>
  );
}

function QuickWinCard({ qw, index }: { qw: QuickWin; index: number }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 flex gap-3">
      <div className="h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold shrink-0">{index + 1}</div>
      <div>
        <p className="font-semibold text-sm text-gray-900">{qw.title}</p>
        <p className="text-xs text-gray-500 mt-1">Ki: {qw.who} · Idő: {qw.time} · Költség: {qw.cost}</p>
      </div>
    </div>
  );
}

const STATUS_STEPS = ["scanning", "analyzing", "validating", "generating", "completed"];
const STATUS_LABELS: Record<string, string> = {
  pending: "Várakozik", scanning: "Scanelés", analyzing: "13 agent elemez...",
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
        if (res.ok) setAudit(await res.json() as Audit);
      } catch (e) { console.error("Load error:", e); }
      setLoading(false);
    }
    load();

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/audit/${id}`);
        if (res.ok) {
          const data = await res.json();
          setAudit(data as Audit);
          if (data.status === "completed" || data.status === "failed") clearInterval(interval);
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [id]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Betöltés...</div>;
  if (!audit) return <div className="min-h-screen flex items-center justify-center text-red-500">Audit nem található</div>;

  const currentStep = STATUS_STEPS.indexOf(audit.status);
  const auditJson = audit.audit_json as Record<string, unknown> | null;
  const findings = (auditJson?.findings || []) as Finding[];
  const quickWins = (auditJson?.quick_wins || []) as QuickWin[];
  const strengths = (auditJson?.strengths || []) as string[];
  const biggestGaps = (auditJson?.biggest_gaps || []) as string[];

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
            </div>
            <span className="text-xl font-bold">Web<span className="text-blue-600">Lelet</span> Engine</span>
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/" className="text-gray-500 hover:text-gray-900">Dashboard</Link>
            <Link href="/audit/new" className="text-gray-500 hover:text-gray-900">Új audit</Link>
            <Link href="/settings" className="text-gray-500 hover:text-gray-900">Beállítások</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{audit.url}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {audit.audit_level === "szint2" ? "Teljes audit" : "Diagnózis"} — {new Date(audit.created_at).toLocaleDateString("hu-HU")}
            </p>
          </div>
          {audit.pdf_path && (
            <a href={`/api/audit/${audit.id}/pdf`} className="inline-flex items-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
              PDF letöltés
            </a>
          )}
        </div>

        {/* Progress */}
        {audit.status !== "completed" && audit.status !== "failed" && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              {STATUS_STEPS.map((step, i) => (
                <div key={step} className="flex items-center">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    i <= currentStep ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-400"
                  }`}>{i + 1}</div>
                  {i < STATUS_STEPS.length - 1 && <div className={`w-12 h-0.5 mx-1 ${i < currentStep ? "bg-blue-600" : "bg-gray-200"}`} />}
                </div>
              ))}
            </div>
            <p className="text-sm text-center text-gray-500">{STATUS_LABELS[audit.status]}...</p>
            <p className="text-xs text-center text-gray-400 mt-1">Az audit ~1-2 percet vesz igénybe (13 agent elemez)</p>
          </div>
        )}

        {/* Error + Retry */}
        {audit.status === "failed" && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6">
            <h3 className="font-bold text-red-700 mb-2">Hiba történt</h3>
            <p className="text-sm text-red-600 mb-4">{audit.error_message || "Ismeretlen hiba"}</p>
            <Link href="/audit/new" className="inline-flex items-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">
              Újrapróbálás
            </Link>
          </div>
        )}

        {/* Scores */}
        {audit.geo_score !== null && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-bold text-gray-900 mb-4">Pontszámok</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <ScoreGauge label="GEO/SEO" score={audit.geo_score} />
              <ScoreGauge label="Marketing" score={audit.marketing_score} />
              <ScoreGauge label="Compliance" score={audit.compliance_score} grade={audit.compliance_grade} />
              <ScoreGauge label="Sales" score={audit.sales_score} />
            </div>
          </div>
        )}

        {/* Quick Wins */}
        {quickWins.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-bold text-gray-900 mb-4">Azonnali teendők</h3>
            <div className="space-y-3">
              {quickWins.map((qw, i) => <QuickWinCard key={i} qw={qw} index={i} />)}
            </div>
          </div>
        )}

        {/* Strengths + Gaps */}
        {(strengths.length > 0 || biggestGaps.length > 0) && (
          <div className="grid md:grid-cols-2 gap-4">
            {strengths.length > 0 && (
              <div className="bg-green-50 rounded-xl border border-green-200 p-6">
                <h3 className="font-bold text-green-800 mb-3">Erősségek</h3>
                <ul className="space-y-2">{strengths.map((s, i) => <li key={i} className="text-sm text-green-700 flex gap-2"><span>✓</span>{s}</li>)}</ul>
              </div>
            )}
            {biggestGaps.length > 0 && (
              <div className="bg-amber-50 rounded-xl border border-amber-200 p-6">
                <h3 className="font-bold text-amber-800 mb-3">Legnagyobb hiányosságok</h3>
                <ul className="space-y-2">{biggestGaps.map((g, i) => <li key={i} className="text-sm text-amber-700 flex gap-2"><span>!</span>{g}</li>)}</ul>
              </div>
            )}
          </div>
        )}

        {/* Findings */}
        {findings.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-bold text-gray-900 mb-4">Feltárt problémák ({findings.length})</h3>
            <div className="space-y-3">
              {findings.map((f, i) => <FindingCard key={i} finding={f} />)}
            </div>
          </div>
        )}

        {/* Validation */}
        {audit.validation_result && (
          <div className={`rounded-xl border p-4 text-sm ${
            (audit.validation_result as { passed: boolean }).passed ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"
          }`}>
            Validáció: {(audit.validation_result as { passed: boolean }).passed ? "PASS" : "FAIL"}
            {((audit.validation_result as { errors: string[] }).errors || []).map((e: string, i: number) => <p key={i} className="text-xs mt-1">- {e}</p>)}
          </div>
        )}

        {/* Processing info */}
        {audit.processing_time_ms && (
          <div className="flex gap-6 text-xs text-gray-400">
            <span>Feldolgozás: {Math.round(audit.processing_time_ms / 1000)}s</span>
            <span>Token: {audit.llm_tokens_used?.toLocaleString() || "–"}</span>
          </div>
        )}

        {/* JSON debug */}
        {auditJson && (
          <div>
            <button onClick={() => setShowJson(!showJson)} className="text-xs text-blue-600 hover:underline">
              {showJson ? "JSON elrejtése" : "JSON megtekintése (debug)"}
            </button>
            {showJson && (
              <pre className="mt-2 bg-gray-900 text-gray-100 rounded-xl p-4 overflow-auto text-[10px] max-h-[400px]">
                {JSON.stringify(auditJson, null, 2)}
              </pre>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
