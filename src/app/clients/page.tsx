"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import type { Client } from "@/lib/types";

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [businessType, setBusinessType] = useState("");

  useEffect(() => {
    loadClients();
  }, []);

  async function loadClients() {
    const supabase = createClient();
    const { data } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
    setClients((data as Client[]) || []);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, website, business_type: businessType }),
    });
    setShowForm(false);
    setName(""); setEmail(""); setWebsite(""); setBusinessType("");
    loadClients();
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
            <Link href="/audit/new" className="text-gray-500 hover:text-gray-900">Új audit</Link>
            <Link href="/clients" className="font-medium text-blue-600">Ügyfelek</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Ügyfelek</h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            + Új ügyfél
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="bg-white rounded-xl border border-gray-200 p-6 mb-6 grid grid-cols-2 gap-4">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cégnév *" required
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email"
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
            <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="Weboldal"
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
            <input value={businessType} onChange={(e) => setBusinessType(e.target.value)} placeholder="Üzlettípus"
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
            <button type="submit" className="col-span-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
              Mentés
            </button>
          </form>
        )}

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {clients.length === 0 ? (
            <p className="p-8 text-center text-gray-400">Még nincs ügyfél</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-5 py-3 text-left font-medium text-gray-500">Név</th>
                  <th className="px-5 py-3 text-left font-medium text-gray-500">Email</th>
                  <th className="px-5 py-3 text-left font-medium text-gray-500">Weboldal</th>
                  <th className="px-5 py-3 text-left font-medium text-gray-500">Típus</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium">{c.name}</td>
                    <td className="px-5 py-3 text-gray-500">{c.email || "–"}</td>
                    <td className="px-5 py-3 text-gray-500">{c.website || "–"}</td>
                    <td className="px-5 py-3 text-gray-500">{c.business_type || "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
