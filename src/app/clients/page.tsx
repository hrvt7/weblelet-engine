"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import AppShell from "@/components/AppShell";
import type { Client } from "@/lib/types";

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [businessType, setBusinessType] = useState("");

  useEffect(() => { loadClients(); }, []);

  async function loadClients() {
    const { data } = await createClient().from("clients").select("*").order("created_at", { ascending: false });
    setClients((data as Client[]) || []);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/clients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, website, business_type: businessType }) });
    setShowForm(false); setName(""); setEmail(""); setWebsite(""); setBusinessType("");
    loadClients();
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-syne text-2xl font-bold" style={{ color: "var(--text)" }}>Ügyfelek</h1>
        <button onClick={() => setShowForm(!showForm)}
          style={{ background: "var(--accent)", color: "var(--bg)", borderRadius: 9 }}
          className="font-syne font-bold text-xs px-5 py-2.5">+ ÚJ ÜGYFÉL</button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }} className="mb-6 grid grid-cols-2 gap-3">
          <div><p className="label-mono mb-1">NÉV *</p><input value={name} onChange={e => setName(e.target.value)} required /></div>
          <div><p className="label-mono mb-1">EMAIL</p><input value={email} onChange={e => setEmail(e.target.value)} type="email" /></div>
          <div><p className="label-mono mb-1">WEBOLDAL</p><input value={website} onChange={e => setWebsite(e.target.value)} /></div>
          <div><p className="label-mono mb-1">TÍPUS</p><input value={businessType} onChange={e => setBusinessType(e.target.value)} /></div>
          <button type="submit" className="col-span-2 font-syne font-bold text-xs py-2.5" style={{ background: "var(--accent)", color: "var(--bg)", borderRadius: 8, border: "none" }}>MENTÉS</button>
        </form>
      )}

      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12 }} className="overflow-hidden">
        {clients.length === 0 ? (
          <p className="py-12 text-center" style={{ color: "var(--muted)" }}>Még nincs ügyfél</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["Név", "Email", "Weboldal", "Típus"].map(h => <th key={h} className="label-mono px-4 py-3 text-left">{h}</th>)}
            </tr></thead>
            <tbody>
              {clients.map(c => (
                <tr key={c.id} style={{ borderBottom: "1px solid var(--border)" }}
                  className="hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                  <td className="px-4 py-3 font-medium" style={{ color: "var(--text)" }}>{c.name}</td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--muted)" }}>{c.email || "–"}</td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--muted)" }}>{c.website || "–"}</td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--muted)" }}>{c.business_type || "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}
