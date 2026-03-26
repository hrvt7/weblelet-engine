"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Client, AuditLevel, AuditModules } from "@/lib/types";
import { DEFAULT_MODULES_SZINT1, DEFAULT_MODULES_SZINT2 } from "@/lib/constants";

const inputClass = "w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500";

function ModuleCheckbox({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-center gap-2.5 text-sm ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled}
        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
      {label}
    </label>
  );
}

export default function NewAuditPage() {
  const [url, setUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [level, setLevel] = useState<AuditLevel>("szint1");
  const [businessType, setBusinessType] = useState("Általános");
  const [modules, setModules] = useState<AuditModules>(DEFAULT_MODULES_SZINT1);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [partnerData, setPartnerData] = useState<string | null>(null);
  const [partnerFileName, setPartnerFileName] = useState("");
  const router = useRouter();

  useEffect(() => {
    async function loadClients() {
      const supabase = createClient();
      const { data } = await supabase.from("clients").select("*").order("name");
      setClients((data as Client[]) || []);
    }
    loadClients();
  }, []);

  useEffect(() => {
    setModules(level === "szint2" ? { ...DEFAULT_MODULES_SZINT2 } : { ...DEFAULT_MODULES_SZINT1 });
  }, [level]);

  function updateModule(block: keyof AuditModules, key: string, value: boolean) {
    setModules(prev => ({
      ...prev,
      [block]: { ...prev[block], [key]: value },
    }));
  }

  async function handlePartnerFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPartnerFileName(file.name);
    const text = await file.text();
    try { setPartnerData(JSON.stringify(JSON.parse(text))); }
    catch { setPartnerData(JSON.stringify({ raw_text: text })); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url) { setError("URL megadása kötelező"); return; }
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/audit/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.startsWith("http") ? url : `https://${url}`,
          client_id: clientId || null,
          audit_level: level,
          business_type: businessType,
          modules,
          partner_data: partnerData ? JSON.parse(partnerData) : null,
        }),
      });
      const data = await res.json();
      if (data.id) { router.push(`/audit/${data.id}`); }
      else { setError(data.error || "Ismeretlen hiba"); setLoading(false); }
    } catch (err) { setError((err as Error).message); setLoading(false); }
  }

  const businessTypes = [
    "Általános", "Étterem / Vendéglátó", "Szerviz / Műhely", "Szépségszalon",
    "Fogászat / Orvosi", "Panzió / Szálláshely", "Webshop", "Szolgáltató",
    "Ügynökség", "Egyéb",
  ];

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
            <Link href="/audit/new" className="font-medium text-blue-600">Új audit</Link>
            <Link href="/clients" className="text-gray-500 hover:text-gray-900">Ügyfelek</Link>
            <Link href="/settings" className="text-gray-500 hover:text-gray-900">Beállítások</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-8">Új audit indítása</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-3 border border-red-200">{error}</div>}

          {/* Alap mezők */}
          <div className="bg-white rounded-2xl border border-gray-200 p-8 space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Weboldal URL *</label>
              <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://pelda.hu" required className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Ügyfél</label>
                <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={inputClass}>
                  <option value="">— Nincs kiválasztva —</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Üzlettípus</label>
                <select value={businessType} onChange={(e) => setBusinessType(e.target.value)} className={inputClass}>
                  {businessTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Audit szint</label>
              <div className="grid grid-cols-2 gap-4">
                {([
                  { value: "szint1" as AuditLevel, label: "Szint 1 — Diagnózis", desc: "~10 oldalas PDF, nyilvános adatok" },
                  { value: "szint2" as AuditLevel, label: "Szint 2 — Teljes audit", desc: "~15+ oldalas PDF + Sales + Proposal" },
                ]).map((opt) => (
                  <button key={opt.value} type="button" onClick={() => setLevel(opt.value)}
                    className={`text-left rounded-xl border p-4 transition-all ${level === opt.value ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500/20" : "border-gray-200 hover:border-gray-300"}`}>
                    <p className="text-sm font-semibold text-gray-900">{opt.label}</p>
                    <p className="text-xs text-gray-500 mt-1">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Modul checkboxok */}
          <div className="bg-white rounded-2xl border border-gray-200 p-8">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Modulok</h2>
            <div className="grid grid-cols-2 gap-6">
              {/* GEO/SEO */}
              <div className="space-y-2.5">
                <p className="text-xs font-bold text-blue-600 uppercase tracking-wider">GEO / SEO</p>
                <ModuleCheckbox label="AI Crawler hozzáférés" checked={modules.geo_seo.crawler_access} onChange={(v) => updateModule("geo_seo", "crawler_access", v)} />
                <ModuleCheckbox label="Schema markup elemzés" checked={modules.geo_seo.schema_markup} onChange={(v) => updateModule("geo_seo", "schema_markup", v)} />
                <ModuleCheckbox label="Technikai SEO" checked={modules.geo_seo.technical_seo} onChange={(v) => updateModule("geo_seo", "technical_seo", v)} />
                <ModuleCheckbox label="AI idézhetőség" checked={modules.geo_seo.citability} onChange={(v) => updateModule("geo_seo", "citability", v)} />
                <ModuleCheckbox label="Brand jelenlét" checked={modules.geo_seo.brand_mentions} onChange={(v) => updateModule("geo_seo", "brand_mentions", v)} />
                <ModuleCheckbox label="AI platform elemzés" checked={modules.geo_seo.platform_check} onChange={(v) => updateModule("geo_seo", "platform_check", v)} />
                <ModuleCheckbox label="llms.txt" checked={modules.geo_seo.llmstxt} onChange={(v) => updateModule("geo_seo", "llmstxt", v)} />
              </div>

              {/* Marketing */}
              <div className="space-y-2.5">
                <p className="text-xs font-bold text-amber-600 uppercase tracking-wider">Marketing</p>
                <ModuleCheckbox label="Tartalom minőség (E-E-A-T)" checked={modules.marketing.content_quality} onChange={(v) => updateModule("marketing", "content_quality", v)} />
                <ModuleCheckbox label="Konverzió (CTA, UX)" checked={modules.marketing.conversion} onChange={(v) => updateModule("marketing", "conversion", v)} />
                <ModuleCheckbox label="Versenytárs elemzés" checked={modules.marketing.competitor} onChange={(v) => updateModule("marketing", "competitor", v)} />
                <ModuleCheckbox label="Brand & Trust" checked={modules.marketing.brand_trust} onChange={(v) => updateModule("marketing", "brand_trust", v)} />
              </div>

              {/* Compliance */}
              <div className="space-y-2.5">
                <p className="text-xs font-bold text-purple-600 uppercase tracking-wider">Jogi megfelelőség</p>
                <ModuleCheckbox label="GDPR (14 pont)" checked={modules.compliance.gdpr} onChange={(v) => updateModule("compliance", "gdpr", v)} />
                <ModuleCheckbox label="Magyar jogi (8 pont)" checked={modules.compliance.hungarian_legal} onChange={(v) => updateModule("compliance", "hungarian_legal", v)} />
                <ModuleCheckbox label="Akadálymentesség (10 pont)" checked={modules.compliance.accessibility} onChange={(v) => updateModule("compliance", "accessibility", v)} />
                <ModuleCheckbox label="Fizetési biztonság (6 pont)" checked={modules.compliance.pci_dss} onChange={(v) => updateModule("compliance", "pci_dss", v)} />
                <ModuleCheckbox label="E-mail szabályozás (5 pont)" checked={modules.compliance.can_spam} onChange={(v) => updateModule("compliance", "can_spam", v)} />
              </div>

              {/* Sales */}
              <div className="space-y-2.5">
                <p className={`text-xs font-bold uppercase tracking-wider ${level === "szint2" ? "text-green-600" : "text-gray-400"}`}>
                  Sales {level === "szint1" && <span className="text-[10px] normal-case font-normal">(csak Szint 2)</span>}
                </p>
                <ModuleCheckbox label="Cég kutatás" checked={modules.sales.company_research} onChange={(v) => updateModule("sales", "company_research", v)} disabled={level === "szint1"} />
                <ModuleCheckbox label="Döntéshozó azonosítás" checked={modules.sales.contacts} onChange={(v) => updateModule("sales", "contacts", v)} disabled={level === "szint1"} />
                <ModuleCheckbox label="Lead scoring" checked={modules.sales.lead_scoring} onChange={(v) => updateModule("sales", "lead_scoring", v)} disabled={level === "szint1"} />
                <ModuleCheckbox label="Megkeresési stratégia" checked={modules.sales.outreach} onChange={(v) => updateModule("sales", "outreach", v)} disabled={level === "szint1"} />
              </div>
            </div>
          </div>

          {/* Partner adatlap (Szint 2) */}
          {level === "szint2" && (
            <div className="bg-white rounded-2xl border border-gray-200 p-8">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Partner adatlap (opcionális)</label>
              <p className="text-xs text-gray-500 mb-3">JSON vagy szöveges fájl az ügyfél adataival (forgalom, bevétel, célok)</p>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
                <input type="file" accept=".json,.txt,.md,.pdf" onChange={handlePartnerFile} className="hidden" id="partner-file" />
                <label htmlFor="partner-file" className="cursor-pointer">
                  <svg className="mx-auto h-8 w-8 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-sm text-gray-500">{partnerFileName || "Kattints a feltöltéshez (.json, .txt, .md)"}</p>
                </label>
              </div>
            </div>
          )}

          {/* Submit */}
          <button type="submit" disabled={loading}
            className="w-full rounded-lg bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
            {loading && <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
            {loading ? "Audit indítása..." : "Audit indítása"}
          </button>
        </form>
      </main>
    </div>
  );
}
