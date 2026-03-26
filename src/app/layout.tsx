import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "WebLelet Engine — Admin",
  description: "WebLelet AI weboldal audit rendszer admin felület",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="hu" className={inter.variable}>
      <body className="min-h-screen bg-gray-50 font-sans antialiased text-gray-900">
        {children}
      </body>
    </html>
  );
}
