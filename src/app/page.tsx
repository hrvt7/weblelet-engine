"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import type { Audit } from "@/lib/types";

const statusStyles: Record<string, { bg: string; color: string; border: string; label: string }> = {
  pending:    { bg: "rgba(113,113,122,0.08)", color: "#71717A", border: "rgba(113,113,122,0.2)", label: "Várakozik" },
  scanning:   { bg: "rgba(76,201,240,0.08)",  color: "#4CC9F0", border: "rgba(76,201,240,0.2)",  label: "Scanelés" },
  analyzing:  { bg: "rgba(76,201,240,0.08)",  color: "#4CC9F0", border: "rgba(76,201,240,0.2)",  label: "Elemzés" },
  validating: { bg: "rgba(255,209,102,0.08)", color: "#FFD166", border: "rgba(255,209,102,0.2)", label: "Validálás" },
  generating: { bg: "rgba(76,201,240,0.08)",  color: "#4CC9F0", border: "rgba(76,201,240,0.2)",  label: "PDF generálás" },
  completed:  { bg: "rgba(0,229,160,0.08)",   color: "#00E5A0", border: "rgba(0,229,160,0.2)",   label: "Kész" },
  failed:     { bg: "rgba(255,107,107,0.08)", color: "#FF6B6B", border: "rgba(255,107,107,0.2)", label: "Hiba" },
};

function scoreColor(s: number | null) {
  if (s === null) return "var(--muted)";
  if (s >= 75) return "var(--accent)";
  if (s >= 40) return "var(--yellow)";
  return "var(--red)";
}

export default function Dashboard() {
  const [audits, setAudits] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, thisWeek: 0, avgGeo: 0, avgCompliance: 0 });

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase.from("audits").select("*").order("created_at", { ascending: false }).limit(20);
      const all = (data || []) as Audit[];
      setAudits(all);

      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const thisWeek = all.filter(a => a.created_at > weekAgo);
      const completed = all.filter(a => a.geo_score !== null);
      const avgGeo = completed.length ? Math.round(completed.reduce((s, a) => s + (a.geo_score || 0), 0) / completed.length) : 0;
      const avgC = completed.length ? Math.round(completed.reduce((s, a) => s + (a.compliance_score || 0), 0) / completed.length) : 0;
      setStats({ total: all.length, thisWeek: thisWeek.length, avgGeo, avgCompliance: avgC });
      setLoading(false);
    }
    load();
  }, []);

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-syne text-2xl font-bold" style={{ color: "var(--text)" }}>Dashboard</h1>
        <Link href="/audit/new"
          style={{ background: "var(--accent)", color: "var(--bg)", borderRadius: 9 }}
          className="font-syne font-bold text-xs px-5 py-2.5 hover:opacity-90 transition-opacity">
          + ÚJ AUDIT
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: "ÖSSZES AUDIT", value: stats.total, color: "var(--accent)", gradient: "rgba(0,229,160,0.09), rgba(76,201,240,0.04)" },
          { label: "EZEN A HÉTEN", value: stats.thisWeek, color: "var(--blue)", gradient: "rgba(76,201,240,0.09), rgba(0,229,160,0.04)" },
          { label: "ÁTLAG GEO", value: stats.avgGeo, color: scoreColor(stats.avgGeo), gradient: "rgba(255,209,102,0.06), rgba(0,229,160,0.03)" },
          { label: "ÁTLAG COMPLIANCE", value: stats.avgCompliance, color: scoreColor(stats.avgCompliance), gradient: "rgba(255,107,107,0.06), rgba(255,209,102,0.03)" },
        ].map((kpi) => (
          <div key={kpi.label} style={{
            background: `linear-gradient(135deg, ${kpi.gradient})`,
            border: `1px solid ${kpi.color}33`,
            borderRadius: 12, padding: 18,
          }}>
            <p className="label-mono mb-2">{kpi.label}</p>
            <p className="font-syne text-3xl font-bold" style={{ color: kpi.color }}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Audit Table */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12 }} className="overflow-hidden">
        <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
          <p className="label-mono">UTOLSÓ AUDITOK</p>
        </div>

        {loading ? (
          <p className="px-5 py-12 text-center" style={{ color: "var(--muted)" }}>Betöltés...</p>
        ) : audits.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p style={{ color: "var(--muted)" }} className="mb-4">Még nincs audit</p>
            <Link href="/audit/new" style={{ background: "var(--accent)", color: "var(--bg)", borderRadius: 9 }}
              className="font-syne font-bold text-xs px-5 py-2.5 inline-block">ELSŐ AUDIT</Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Domain", "Szint", "GEO", "Marketing", "Compliance", "Státusz", "Dátum", ""].map(h => (
                  <th key={h} className="label-mono px-4 py-3 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {audits.map((a) => {
                let domain: string;
                try { domain = new URL(a.url).hostname; } catch { domain = a.url; }
                const st = statusStyles[a.status] || statusStyles.pending;
                return (
                  <tr key={a.id} className="transition-colors" style={{ borderBottom: "1px solid var(--border)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <td className="px-4 py-3">
                      <Link href={`/audit/${a.id}`} style={{ color: "var(--accent)" }} className="font-medium hover:underline font-mono text-xs">{domain}</Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--text-sub)" }}>{a.audit_level === "szint2" ? "S2" : "S1"}</td>
                    <td className="px-4 py-3 font-mono text-xs font-bold" style={{ color: scoreColor(a.geo_score) }}>{a.geo_score ?? "–"}</td>
                    <td className="px-4 py-3 font-mono text-xs font-bold" style={{ color: scoreColor(a.marketing_score) }}>{a.marketing_score ?? "–"}</td>
                    <td className="px-4 py-3 font-mono text-xs font-bold" style={{ color: scoreColor(a.compliance_score) }}>
                      {a.compliance_score !== null ? `${a.compliance_score} ${a.compliance_grade}` : "–"}
                    </td>
                    <td className="px-4 py-3">
                      <span style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}`, borderRadius: 6, padding: "2px 8px", fontSize: 10, fontFamily: "'DM Mono'" }}>{st.label}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--muted)" }}>{new Date(a.created_at).toLocaleDateString("hu-HU")}</td>
                    <td className="px-4 py-3 text-right">
                      {a.pdf_path ? <a href={`/api/audit/${a.id}/pdf`} style={{ color: "var(--accent)" }} className="font-mono text-xs hover:underline">PDF</a> : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}
