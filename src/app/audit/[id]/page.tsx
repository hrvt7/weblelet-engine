"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import type { Audit, Finding, QuickWin } from "@/lib/types";

function scoreColor(s: number | null) {
  if (s === null) return "var(--muted)";
  if (s >= 75) return "var(--accent)";
  if (s >= 40) return "var(--yellow)";
  return "var(--red)";
}

function ScoreGauge({ label, score, grade }: { label: string; score: number | null; grade?: string | null }) {
  if (score === null) return null;
  return (
    <div style={{ background: "var(--bg-card)", border: `1px solid ${scoreColor(score)}40`, borderRadius: 12, padding: 18, textAlign: "center" }}>
      <p className="font-syne text-3xl font-bold" style={{ color: scoreColor(score) }}>{score}</p>
      <p className="label-mono mt-1">{label}{grade ? ` (${grade})` : ""}</p>
    </div>
  );
}

function FindingCard({ f }: { f: Finding }) {
  const colors: Record<string, string> = { "KRITIKUS": "var(--red)", "MAGAS": "var(--yellow)", "KÖZEPES": "var(--blue)" };
  const c = colors[f.severity] || "var(--muted)";
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderLeft: `3px solid ${c}`, borderRadius: "0 10px 10px 0", padding: "14px 16px" }}>
      <div className="flex items-center gap-2 mb-2">
        <span style={{ background: `${c}15`, color: c, border: `1px solid ${c}30`, borderRadius: 5, padding: "1px 7px", fontSize: 10, fontFamily: "'DM Mono'" }}>{f.severity}</span>
        <span className="font-mono text-[10px]" style={{ color: "var(--muted)" }}>{f.tag}</span>
      </div>
      <p className="text-sm font-semibold mb-1" style={{ color: "var(--text)" }}>{f.title}</p>
      {f.evidence && <p className="text-xs mb-1" style={{ color: "var(--text-sub)" }}><strong>Mit látunk:</strong> {f.evidence}</p>}
      {f.why_problem && <p className="text-xs mb-1" style={{ color: "var(--text-sub)" }}><strong>Miért probléma:</strong> {f.why_problem}</p>}
      {f.fix && <p className="text-xs" style={{ color: "var(--text-sub)" }}><strong>Javítás:</strong> {f.fix}</p>}
    </div>
  );
}

const STEPS = ["scanning", "analyzing", "validating", "generating", "completed"];
const STEP_LABELS = ["Scan", "13 Agent", "Validálás", "PDF", "Kész"];

export default function AuditResultPage() {
  const { id } = useParams<{ id: string }>();
  const [audit, setAudit] = useState<Audit | null>(null);
  const [loading, setLoading] = useState(true);
  const [showJson, setShowJson] = useState(false);

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`/api/audit/${id}`);
      if (res.ok) setAudit(await res.json() as Audit);
      setLoading(false);
    };
    load();
    const interval = setInterval(async () => {
      const res = await fetch(`/api/audit/${id}`);
      if (res.ok) {
        const d = await res.json();
        setAudit(d as Audit);
        if (d.status === "completed" || d.status === "failed") clearInterval(interval);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [id]);

  if (loading) return <AppShell><p style={{ color: "var(--muted)" }}>Betöltés...</p></AppShell>;
  if (!audit) return <AppShell><p style={{ color: "var(--red)" }}>Audit nem található</p></AppShell>;

  const currentStep = STEPS.indexOf(audit.status);
  const json = audit.audit_json as Record<string, unknown> | null;
  const findings = (json?.findings || []) as Finding[];
  const quickWins = (json?.quick_wins || []) as QuickWin[];
  const strengths = (json?.strengths || []) as string[];
  const gaps = (json?.biggest_gaps || []) as string[];

  return (
    <AppShell>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-syne text-xl font-bold" style={{ color: "var(--text)" }}>{audit.url}</h1>
          <p className="font-mono text-xs mt-1" style={{ color: "var(--muted)" }}>
            {audit.audit_level === "szint2" ? "Szint 2 — Teljes audit" : "Szint 1 — Diagnózis"} · {new Date(audit.created_at).toLocaleDateString("hu-HU")}
          </p>
        </div>
        {audit.pdf_path && (
          <a href={`/api/audit/${audit.id}/pdf`}
            style={{ background: "var(--accent)", color: "var(--bg)", borderRadius: 9 }}
            className="font-syne font-bold text-xs px-5 py-2.5">PDF LETÖLTÉS</a>
        )}
      </div>

      {/* Progress */}
      {audit.status !== "completed" && audit.status !== "failed" && (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }} className="mb-6">
          <div className="flex items-center justify-between mb-3">
            {STEPS.map((step, i) => (
              <div key={step} className="flex items-center">
                <div style={{
                  width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                  background: i <= currentStep ? "var(--accent)" : "var(--border)",
                  color: i <= currentStep ? "var(--bg)" : "var(--muted)",
                  fontSize: 11, fontWeight: 700, fontFamily: "'Syne'",
                }}>{i + 1}</div>
                {i < STEPS.length - 1 && <div style={{ width: 40, height: 2, margin: "0 4px", background: i < currentStep ? "var(--accent)" : "var(--border)" }} />}
              </div>
            ))}
          </div>
          <div className="flex justify-between px-1">
            {STEP_LABELS.map((l, i) => <span key={l} className="label-mono" style={{ color: i <= currentStep ? "var(--accent)" : "var(--muted)" }}>{l}</span>)}
          </div>
          <p className="text-xs text-center mt-3" style={{ color: "var(--muted)" }}>Az audit ~1-2 percet vesz igénybe</p>
        </div>
      )}

      {/* Failed */}
      {audit.status === "failed" && (
        <div style={{ background: "rgba(255,107,107,0.06)", border: "1px solid rgba(255,107,107,0.2)", borderRadius: 12, padding: 20 }} className="mb-6">
          <p className="font-syne font-bold text-sm mb-2" style={{ color: "var(--red)" }}>Hiba történt</p>
          <p className="font-mono text-xs" style={{ color: "var(--red)" }}>{audit.error_message}</p>
          <Link href="/audit/new" style={{ background: "var(--red)", color: "white", borderRadius: 8 }}
            className="inline-block font-syne font-bold text-xs px-4 py-2 mt-3">ÚJRAPRÓBÁLÁS</Link>
        </div>
      )}

      {/* Scores */}
      {audit.geo_score !== null && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <ScoreGauge label="GEO" score={audit.geo_score} />
          <ScoreGauge label="SEO" score={audit.seo_score} />
        </div>
      )}

      {/* Quick Wins */}
      {quickWins.length > 0 && (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }} className="mb-6">
          <p className="label-mono mb-4">AZONNALI TEENDŐK</p>
          <div className="space-y-3">
            {quickWins.map((qw, i) => (
              <div key={i} className="flex gap-3 items-start" style={{ background: "var(--bg)", border: "1px solid var(--accent-border)", borderRadius: 10, padding: 14 }}>
                <div style={{ background: "var(--accent)", color: "var(--bg)", width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, fontFamily: "'Syne'", flexShrink: 0 }}>{i + 1}</div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{qw.title}</p>
                  <p className="font-mono text-[10px] mt-1" style={{ color: "var(--muted)" }}>Ki: {qw.who} · Idő: {qw.time} · Költség: {qw.cost}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Strengths + Gaps */}
      {(strengths.length > 0 || gaps.length > 0) && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          {strengths.length > 0 && (
            <div style={{ background: "rgba(0,229,160,0.04)", border: "1px solid var(--accent-border)", borderRadius: 12, padding: 18 }}>
              <p className="label-mono mb-3" style={{ color: "var(--accent)" }}>ERŐSSÉGEK</p>
              {strengths.map((s, i) => <p key={i} className="text-xs mb-1.5" style={{ color: "var(--text-sub)" }}>✓ {s}</p>)}
            </div>
          )}
          {gaps.length > 0 && (
            <div style={{ background: "rgba(255,209,102,0.04)", border: "1px solid rgba(255,209,102,0.2)", borderRadius: 12, padding: 18 }}>
              <p className="label-mono mb-3" style={{ color: "var(--yellow)" }}>HIÁNYOSSÁGOK</p>
              {gaps.map((g, i) => <p key={i} className="text-xs mb-1.5" style={{ color: "var(--text-sub)" }}>! {g}</p>)}
            </div>
          )}
        </div>
      )}

      {/* Findings */}
      {findings.length > 0 && (
        <div className="mb-6">
          <p className="label-mono mb-4">FELTÁRT PROBLÉMÁK ({findings.length})</p>
          <div className="space-y-3">
            {findings.map((f, i) => <FindingCard key={i} f={f} />)}
          </div>
        </div>
      )}

      {/* Validation + Meta */}
      {audit.validation_result && (
        <div className="mb-4">
          <span style={{
            background: (audit.validation_result as { passed: boolean }).passed ? "rgba(0,229,160,0.08)" : "rgba(255,107,107,0.08)",
            color: (audit.validation_result as { passed: boolean }).passed ? "var(--accent)" : "var(--red)",
            border: `1px solid ${(audit.validation_result as { passed: boolean }).passed ? "var(--accent-border)" : "rgba(255,107,107,0.2)"}`,
            borderRadius: 6, padding: "3px 10px", fontSize: 10, fontFamily: "'DM Mono'",
          }}>Validáció: {(audit.validation_result as { passed: boolean }).passed ? "PASS" : "FAIL"}</span>
        </div>
      )}

      {audit.processing_time_ms && (
        <p className="font-mono text-[10px] mb-4" style={{ color: "var(--muted)" }}>
          Feldolgozás: {Math.round(audit.processing_time_ms / 1000)}s · Token: {audit.llm_tokens_used?.toLocaleString() || "–"}
        </p>
      )}

      {json && (
        <div className="mb-8">
          <button onClick={() => setShowJson(!showJson)} className="font-mono text-[10px] hover:underline" style={{ color: "var(--accent)" }}>
            {showJson ? "JSON elrejtése" : "JSON (debug)"}
          </button>
          {showJson && (
            <pre className="mt-2 p-4 rounded-lg overflow-auto text-[10px] max-h-[400px]"
              style={{ background: "#000", color: "var(--accent)", border: "1px solid var(--border)" }}>
              {JSON.stringify(json, null, 2)}
            </pre>
          )}
        </div>
      )}
    </AppShell>
  );
}
