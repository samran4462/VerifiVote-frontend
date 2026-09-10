import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Navbar } from "../components/Navbar";
import { Toaster } from "react-hot-toast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VerifiVote - Enterprise Web3 Voting",
  description: "Secure, AI-automated KYC Web3 voting platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#F4F9F6] text-slate-900" style={{ backgroundImage: "radial-gradient(#11574022 1px, transparent 1px)", backgroundSize: "32px 32px" }}>
        <Providers>
          <Navbar />
          <Toaster position="top-right" toastOptions={{ style: { background: '#111', border: '1px solid #333', color: '#fff' } }} />
          <main className="flex-1 relative">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
