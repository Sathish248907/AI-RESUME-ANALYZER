import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { ToastProvider } from "@/components/common/Toast";

export const metadata: Metadata = {
  title: "ResumeAI — AI-Powered Resume Analyzer",
  description:
    "Upload your resume and a job description to get instant AI-powered analysis: skills match, ATS score, missing skills, keyword gaps, and interview questions.",
  keywords: ["resume analyzer", "AI resume", "ATS checker", "job match", "career tools"],
  openGraph: {
    title: "ResumeAI — AI-Powered Resume Analyzer",
    description: "Get instant AI feedback on your resume vs any job description.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex flex-col min-h-screen">
        <ToastProvider>
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
        </ToastProvider>
      </body>
    </html>
  );
}
