"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import AppShell from "@/components/AppShell";

export default function SettingsPage() {
  const [companyName, setCompanyName] = useState("WebLelet");
  const [tagline, setTagline] = useState("AI-alapú weboldal elemző rendszer");
  const [primaryColor, setPrimaryColor] = useState("#2563EB");
  const [accentColor, setAccentColor] = useState("#F59E0B");
  const [contactEmail, setContactEmail] = useState("info@weblelet.hu");
  const [contactPhone, setContactPhone] = useState("");
  const [contactWebsite, setContactWebsite] = useState("https://weblelet.hu");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    createClient().from("audit_config").select("*").limit(1).single().then(({ data }) => {
      if (data) {
        setCompanyName(data.company_name || ""); setTagline(data.company_tagline || "");
        setPrimaryColor(data.primary_color || "#2563EB"); setAccentColor(data.accent_color || "#F59E0B");
        setContactEmail(data.contact_email || ""); setContactPhone(data.contact_phone || ""); setContactWebsite(data.contact_website || "");
      }
    });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    const { data: existing } = await supabase.from("audit_config").select("id").limit(1).single();
    const config = { company_name: companyName, company_tagline: tagline, primary_color: primaryColor, accent_color: accentColor, contact_email: contactEmail, contact_phone: contactPhone, contact_website: contactWebsite };
    if (existing) await supabase.from("audit_config").update(config).eq("id", existing.id);
    else await supabase.from("audit_config").insert(config);
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  return (
    <AppShell>
      <h1 className="font-syne text-2xl font-bold mb-8" style={{ color: "var(--text)" }}>Beállítások</h1>

      <form onSubmit={handleSave} className="max-w-2xl space-y-5">
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 24 }} className="space-y-4">
          <p className="label-mono mb-2">WHITE-LABEL KONFIGURÁCIÓ</p>
          <div className="grid grid-cols-2 gap-4">
            <div><p className="label-mono mb-1">CÉGNÉV</p><input value={companyName} onChange={e => setCompanyName(e.target.value)} /></div>
            <div><p className="label-mono mb-1">SZLOGEN</p><input value={tagline} onChange={e => setTagline(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="label-mono mb-1">ELSŐDLEGES SZÍN</p>
              <div className="flex items-center gap-2">
                <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} />
                <input value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} />
              </div>
            </div>
            <div>
              <p className="label-mono mb-1">MÁSODLAGOS SZÍN</p>
              <div className="flex items-center gap-2">
                <input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)} />
                <input value={accentColor} onChange={e => setAccentColor(e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 24 }} className="space-y-4">
          <p className="label-mono mb-2">KAPCSOLAT</p>
          <div className="grid grid-cols-2 gap-4">
            <div><p className="label-mono mb-1">EMAIL</p><input value={contactEmail} onChange={e => setContactEmail(e.target.value)} type="email" /></div>
            <div><p className="label-mono mb-1">TELEFON</p><input value={contactPhone} onChange={e => setContactPhone(e.target.value)} /></div>
          </div>
          <div><p className="label-mono mb-1">WEBOLDAL</p><input value={contactWebsite} onChange={e => setContactWebsite(e.target.value)} /></div>
        </div>

        <button type="submit" style={{ background: saved ? "var(--accent)" : "var(--accent)", color: "var(--bg)", borderRadius: 10, width: "100%", padding: "14px", border: "none" }}
          className="font-syne font-bold text-sm hover:opacity-90 transition-opacity">
          {saved ? "✓ MENTVE" : "MENTÉS"}
        </button>
      </form>
    </AppShell>
  );
}
