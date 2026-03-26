import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WebLelet Engine",
  description: "AI weboldal audit rendszer",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hu">
      <body className="min-h-screen flex">
        {children}
      </body>
    </html>
  );
}
