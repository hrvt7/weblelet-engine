"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

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
    async function load() {
      const supabase = createClient();
      const { data } = await supabase.from("audit_config").select("*").limit(1).single();
      if (data) {
        setCompanyName(data.company_name || "WebLelet");
        setTagline(data.company_tagline || "");
        setPrimaryColor(data.primary_color || "#2563EB");
        setAccentColor(data.accent_color || "#F59E0B");
        setContactEmail(data.contact_email || "");
        setContactPhone(data.contact_phone || "");
        setContactWebsite(data.contact_website || "");
      }
    }
    load();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();

    const { data: existing } = await supabase.from("audit_config").select("id").limit(1).single();

    const configData = {
      company_name: companyName,
      company_tagline: tagline,
      primary_color: primaryColor,
      accent_color: accentColor,
      contact_email: contactEmail,
      contact_phone: contactPhone,
      contact_website: contactWebsite,
    };

    if (existing) {
      await supabase.from("audit_config").update(configData).eq("id", existing.id);
    } else {
      await supabase.from("audit_config").insert(configData);
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

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
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/" className="text-gray-500 hover:text-gray-900">Dashboard</Link>
            <Link href="/settings" className="font-medium text-blue-600">Beállítások</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-8">Beállítások</h1>

        <form onSubmit={handleSave} className="bg-white rounded-2xl border border-gray-200 p-8 space-y-6">
          <h2 className="text-lg font-bold text-gray-900">White-label konfiguráció</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Cégnév</label>
              <input value={companyName} onChange={(e) => setCompanyName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Szlogen</label>
              <input value={tagline} onChange={(e) => setTagline(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Elsődleges szín</label>
              <div className="flex items-center gap-3">
                <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-10 w-10 rounded cursor-pointer" />
                <input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Másodlagos szín</label>
              <div className="flex items-center gap-3">
                <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="h-10 w-10 rounded cursor-pointer" />
                <input value={accentColor} onChange={(e) => setAccentColor(e.target.value)}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
              </div>
            </div>
          </div>

          <h2 className="text-lg font-bold text-gray-900 pt-4">Kapcsolat</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} type="email"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Telefon</label>
              <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Weboldal</label>
            <input value={contactWebsite} onChange={(e) => setContactWebsite(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
          </div>

          <button type="submit" className="w-full rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition-colors">
            {saved ? "Mentve!" : "Mentés"}
          </button>
        </form>
      </main>
    </div>
  );
}
