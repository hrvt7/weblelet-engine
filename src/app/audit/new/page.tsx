"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Client, AuditLevel } from "@/lib/types";
import { DEFAULT_MODULES_SZINT1, DEFAULT_MODULES_SZINT2 } from "@/lib/constants";

export default function NewAuditPage() {
  const [url, setUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [level, setLevel] = useState<AuditLevel>("szint1");
  const [businessType, setBusinessType] = useState("Általános");
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    async function loadClients() {
      const supabase = createClient();
      const { data } = await supabase.from("clients").select("*").order("name");
      setClients((data as Client[]) || []);
    }
    loadClients();
  }, []);

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
          modules: level === "szint2" ? DEFAULT_MODULES_SZINT2 : DEFAULT_MODULES_SZINT1,
        }),
      });

      const data = await res.json();

      if (data.id) {
        router.push(`/audit/${data.id}`);
      } else {
        setError(data.error || "Ismeretlen hiba");
        setLoading(false);
      }
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
            <span className="text-xl font-bold">Web<span className="text-blue-600">Lelet</span> Engine</span>
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/" className="text-gray-500 hover:text-gray-900">Dashboard</Link>
            <Link href="/audit/new" className="font-medium text-blue-600">Új audit</Link>
            <Link href="/clients" className="text-gray-500 hover:text-gray-900">Ügyfelek</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-8">Új audit indítása</h1>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-8 space-y-6">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-3 border border-red-200">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Weboldal URL *</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://pelda.hu"
              required
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Ügyfél</label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              <option value="">— Nincs kiválasztva —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Üzlettípus</label>
            <select
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              {businessTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Audit szint</label>
            <div className="grid grid-cols-2 gap-4">
              {([
                { value: "szint1" as AuditLevel, label: "Szint 1 — Diagnózis", desc: "~10 oldalas PDF, nyilvános adatok" },
                { value: "szint2" as AuditLevel, label: "Szint 2 — Teljes audit", desc: "~15+ oldalas PDF + Sales + Proposal" },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setLevel(opt.value)}
                  className={`text-left rounded-xl border p-4 transition-all ${
                    level === opt.value
                      ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500/20"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <p className="text-sm font-semibold text-gray-900">{opt.label}</p>
                  <p className="text-xs text-gray-500 mt-1">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "Audit indítása..." : "Audit indítása"}
          </button>
        </form>
      </main>
    </div>
  );
}
