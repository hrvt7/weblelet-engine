"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    if (error) { setError("Hibás email vagy jelszó"); setLoading(false); return; }
    router.push("/"); router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-4">
            <div style={{ background: "var(--accent)", width: 36, height: 36, borderRadius: 10 }} className="flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#09090B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
            </div>
            <span className="font-syne text-xl font-bold" style={{ color: "var(--accent)" }}>WebLelet</span>
          </div>
          <p className="label-mono">ADMIN FELÜLET</p>
        </div>

        <form onSubmit={handleLogin} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 28 }} className="space-y-5">
          {error && <div style={{ background: "rgba(255,107,107,0.08)", border: "1px solid rgba(255,107,107,0.2)", borderRadius: 8, color: "var(--red)" }} className="text-xs px-4 py-3 font-mono">{error}</div>}

          <div>
            <p className="label-mono mb-2">EMAIL</p>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="admin@weblelet.hu" />
          </div>
          <div>
            <p className="label-mono mb-2">JELSZÓ</p>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>

          <button type="submit" disabled={loading}
            style={{ background: "var(--accent)", color: "var(--bg)", borderRadius: 9, width: "100%", padding: 12, border: "none" }}
            className="font-syne font-bold text-sm hover:opacity-90 disabled:opacity-40 transition-opacity">
            {loading ? "BEJELENTKEZÉS..." : "BEJELENTKEZÉS"}
          </button>
        </form>
      </div>
    </div>
  );
}
