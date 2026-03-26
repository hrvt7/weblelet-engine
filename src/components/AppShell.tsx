"use client";

import Sidebar from "./Sidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar />
      <main style={{ marginLeft: 220, minHeight: "100vh", padding: "28px 32px" }} className="flex-1">
        {children}
      </main>
    </>
  );
}
