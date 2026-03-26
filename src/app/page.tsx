"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import type { Audit } from "@/lib/types";

export default function Dashboard() {
  const [audits, setAudits] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, thisWeek: 0, avgGeo: 0, avgCompliance: 0 });

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("audits")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);

      const all = data || [];
      setAudits(all as Audit[]);

      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const thisWeek = all.filter((a: Audit) => a.created_at > weekAgo);
      const completed = all.filter((a: Audit) => a.geo_score !== null);
      const avgGeo = completed.length ? Math.round(completed.reduce((s: number, a: Audit) => s + (a.geo_score || 0), 0) / completed.length) : 0;
      const avgCompliance = completed.length ? Math.round(completed.reduce((s: number, a: Audit) => s + (a.compliance_score || 0), 0) / completed.length) : 0;

      setStats({ total: all.length, thisWeek: thisWeek.length, avgGeo, avgCompliance });
      setLoading(false);
    }
    load();
  }, []);

  const statusLabels: Record<string, { label: string; color: string }> = {
    pending: { label: "Várakozik", color: "bg-gray-100 text-gray-600" },
    scanning: { label: "Scanelés", color: "bg-blue-100 text-blue-700" },
    analyzing: { label: "Elemzés", color: "bg-blue-100 text-blue-700" },
    validating: { label: "Validálás", color: "bg-yellow-100 text-yellow-700" },
    generating: { label: "PDF generálás", color: "bg-purple-100 text-purple-700" },
    completed: { label: "Kész", color: "bg-green-100 text-green-700" },
    failed: { label: "Hiba", color: "bg-red-100 text-red-700" },
  };

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
            <span className="text-xl font-bold">Web<span className="text-blue-600">Lelet</span> Engine</span>
          </div>
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/" className="font-medium text-blue-600">Dashboard</Link>
            <Link href="/audit/new" className="text-gray-500 hover:text-gray-900">Új audit</Link>
            <Link href="/clients" className="text-gray-500 hover:text-gray-900">Ügyfelek</Link>
            <Link href="/settings" className="text-gray-500 hover:text-gray-900">Beállítások</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Összes audit", value: stats.total },
            { label: "Ezen a héten", value: stats.thisWeek },
            { label: "Átlag GEO score", value: stats.avgGeo },
            { label: "Átlag Compliance", value: stats.avgCompliance },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500 mb-1">{stat.label}</p>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-bold text-gray-900">Utolsó auditok</h2>
          <Link href="/audit/new" className="inline-flex items-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors">
            + Új audit
          </Link>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">Betöltés...</div>
        ) : audits.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-400 mb-4">Még nincs audit</p>
            <Link href="/audit/new" className="inline-flex items-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
              Első audit indítása
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-5 py-3 text-left font-medium text-gray-500">Domain</th>
                  <th className="px-5 py-3 text-left font-medium text-gray-500">Dátum</th>
                  <th className="px-5 py-3 text-center font-medium text-gray-500">GEO</th>
                  <th className="px-5 py-3 text-center font-medium text-gray-500">Marketing</th>
                  <th className="px-5 py-3 text-center font-medium text-gray-500">Compliance</th>
                  <th className="px-5 py-3 text-center font-medium text-gray-500">Státusz</th>
                  <th className="px-5 py-3 text-right font-medium text-gray-500">PDF</th>
                </tr>
              </thead>
              <tbody>
                {audits.map((audit) => {
                  let domain: string;
                  try { domain = new URL(audit.url).hostname; } catch { domain = audit.url; }
                  const st = statusLabels[audit.status] || statusLabels.pending;
                  return (
                    <tr key={audit.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <Link href={`/audit/${audit.id}`} className="font-medium text-blue-600 hover:underline">{domain}</Link>
                      </td>
                      <td className="px-5 py-3 text-gray-500">{new Date(audit.created_at).toLocaleDateString("hu-HU")}</td>
                      <td className="px-5 py-3 text-center font-medium">{audit.geo_score ?? "–"}</td>
                      <td className="px-5 py-3 text-center font-medium">{audit.marketing_score ?? "–"}</td>
                      <td className="px-5 py-3 text-center font-medium">
                        {audit.compliance_score !== null ? `${audit.compliance_score} (${audit.compliance_grade})` : "–"}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${st.color}`}>{st.label}</span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {audit.pdf_path ? (
                          <a href={`/api/audit/${audit.id}/pdf`} className="text-blue-600 hover:underline text-xs font-medium">Letöltés</a>
                        ) : "–"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
