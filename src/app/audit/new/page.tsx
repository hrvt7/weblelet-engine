"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import type { Client, AuditLevel, AuditModules } from "@/lib/types";
import { DEFAULT_MODULES_SZINT1, DEFAULT_MODULES_SZINT2 } from "@/lib/constants";

function Checkbox({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-center gap-2.5 text-xs ${disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}`} style={{ color: "var(--text-sub)" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} style={{ width: 14, height: 14 }} />
      {label}
    </label>
  );
}

export default function NewAuditPage() {
  const [url, setUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [level, setLevel] = useState<AuditLevel>("szint1");
  const [businessType, setBusinessType] = useState("Általános");
  const [modules, setModules] = useState<AuditModules>({ ...DEFAULT_MODULES_SZINT1 });
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [partnerData, setPartnerData] = useState<string | null>(null);
  const [partnerFileName, setPartnerFileName] = useState("");
  const router = useRouter();

  useEffect(() => {
    createClient().from("clients").select("*").order("name").then(({ data }) => setClients((data as Client[]) || []));
  }, []);

  useEffect(() => {
    setModules(level === "szint2" ? { ...DEFAULT_MODULES_SZINT2 } : { ...DEFAULT_MODULES_SZINT1 });
  }, [level]);

  function updateModule(block: keyof AuditModules, key: string, value: boolean) {
    setModules(prev => ({ ...prev, [block]: { ...prev[block], [key]: value } }));
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
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/audit/start", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.startsWith("http") ? url : `https://${url}`,
          client_id: clientId || null, audit_level: level,
          business_type: businessType, modules,
          partner_data: partnerData ? JSON.parse(partnerData) : null,
        }),
      });
      const data = await res.json();
      if (data.id) router.push(`/audit/${data.id}`);
      else { setError(data.error || "Hiba"); setLoading(false); }
    } catch (err) { setError((err as Error).message); setLoading(false); }
  }

  const types = ["Általános","Étterem / Vendéglátó","Szerviz / Műhely","Szépségszalon","Fogászat / Orvosi","Panzió / Szálláshely","Webshop","Szolgáltató","Ügynökség","Egyéb"];

  return (
    <AppShell>
      <h1 className="font-syne text-2xl font-bold mb-8" style={{ color: "var(--text)" }}>Új audit</h1>

      <form onSubmit={handleSubmit} className="max-w-3xl space-y-5">
        {error && <div style={{ background: "rgba(255,107,107,0.08)", border: "1px solid rgba(255,107,107,0.2)", borderRadius: 8, color: "var(--red)" }} className="text-xs px-4 py-3">{error}</div>}

        {/* URL + Alap mezők */}
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 24 }} className="space-y-4">
          <div>
            <p className="label-mono mb-2">WEBOLDAL URL *</p>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://pelda.hu" required
              style={{ fontSize: 15, padding: "12px 16px" }} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="label-mono mb-2">ÜGYFÉL</p>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">— Nincs —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <p className="label-mono mb-2">ÜZLETTÍPUS</p>
              <select value={businessType} onChange={(e) => setBusinessType(e.target.value)}>
                {types.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Szint választó */}
          <div>
            <p className="label-mono mb-3">AUDIT SZINT</p>
            <div className="grid grid-cols-2 gap-3">
              {([
                { v: "szint1" as AuditLevel, l: "Szint 1 — GEO Scan", d: "GEO + SEO diagnózis PDF" },
                { v: "szint2" as AuditLevel, l: "Szint 2 — Teljes GEO+SEO audit", d: "Részletes audit + schema kód + implementációs terv" },
              ]).map(o => (
                <button key={o.v} type="button" onClick={() => setLevel(o.v)}
                  style={{
                    background: level === o.v ? "var(--accent-dim)" : "var(--bg)",
                    border: `1px solid ${level === o.v ? "var(--accent-border)" : "var(--border)"}`,
                    borderRadius: 10, padding: "14px 16px", textAlign: "left",
                  }} className="transition-colors">
                  <p className="font-syne text-sm font-bold" style={{ color: level === o.v ? "var(--accent)" : "var(--text)" }}>{o.l}</p>
                  <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>{o.d}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Modulok */}
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 24 }}>
          <p className="label-mono mb-4">MODULOK</p>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <p className="font-mono text-[10px] font-bold mb-1" style={{ color: "var(--accent)" }}>GEO — AI LÁTHATÓSÁG</p>
              <Checkbox label="AI Crawler hozzáférés" checked={modules.geo.crawler_access} onChange={v => updateModule("geo","crawler_access",v)} />
              <Checkbox label="Schema markup" checked={modules.geo.schema_markup} onChange={v => updateModule("geo","schema_markup",v)} />
              <Checkbox label="AI idézhetőség" checked={modules.geo.citability} onChange={v => updateModule("geo","citability",v)} />
              <Checkbox label="Brand jelenlét" checked={modules.geo.brand_mentions} onChange={v => updateModule("geo","brand_mentions",v)} />
              <Checkbox label="AI platform elemzés" checked={modules.geo.platform_check} onChange={v => updateModule("geo","platform_check",v)} />
              <Checkbox label="llms.txt" checked={modules.geo.llmstxt} onChange={v => updateModule("geo","llmstxt",v)} />
            </div>
            <div className="space-y-2">
              <p className="font-mono text-[10px] font-bold mb-1" style={{ color: "var(--blue)" }}>SEO — KERESŐOPTIMALIZÁLÁS</p>
              <Checkbox label="Technikai SEO" checked={modules.seo.technical_seo} onChange={v => updateModule("seo","technical_seo",v)} />
              <Checkbox label="On-page SEO" checked={modules.seo.on_page} onChange={v => updateModule("seo","on_page",v)} />
              <Checkbox label="Teljesítmény (CWV)" checked={modules.seo.performance} onChange={v => updateModule("seo","performance",v)} />
              <Checkbox label="Feltérképezhetőség" checked={modules.seo.crawlability} onChange={v => updateModule("seo","crawlability",v)} />
              <Checkbox label="Belső linkelés" checked={modules.seo.internal_linking} onChange={v => updateModule("seo","internal_linking",v)} />
            </div>
          </div>
        </div>

        {/* Partner adatlap (Szint 2) */}
        {level === "szint2" && (
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 24 }}>
            <p className="label-mono mb-2">PARTNER ADATLAP (OPCIONÁLIS)</p>
            <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>JSON vagy szöveges fájl (forgalom, bevétel, célok)</p>
            <div style={{ border: "2px dashed var(--border)", borderRadius: 10, padding: "28px 20px", textAlign: "center" }}
              className="hover:border-[var(--accent)] transition-colors cursor-pointer">
              <input type="file" accept=".json,.txt,.md" onChange={handlePartnerFile} className="hidden" id="pf" />
              <label htmlFor="pf" className="cursor-pointer">
                <svg className="mx-auto mb-2" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                <p className="font-mono text-xs" style={{ color: partnerFileName ? "var(--accent)" : "var(--muted)" }}>
                  {partnerFileName || "Kattints a feltöltéshez"}
                </p>
              </label>
            </div>
          </div>
        )}

        <button type="submit" disabled={loading}
          style={{ background: "var(--accent)", color: "var(--bg)", borderRadius: 10, width: "100%", padding: "14px", border: "none" }}
          className="font-syne font-bold text-sm hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center justify-center gap-2">
          {loading && <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
          {loading ? "AUDIT INDÍTÁSA..." : "AUDIT INDÍTÁSA"}
        </button>
      </form>
    </AppShell>
  );
}
