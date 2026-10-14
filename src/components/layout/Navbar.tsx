"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  FileText, LayoutDashboard, History, Menu, X,
  Sparkles, BookOpen, ChevronDown, Briefcase, FolderSearch,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";

const primaryLinks = [
  { href: "/analyze", label: "AI Analyze", icon: Sparkles },
  { href: "/dashboard/resume-analyzer", label: "Resume Analyzer", icon: FileText },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
];

const dashboardDropdown = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/resume-analyzer", label: "Resume Analyzer", icon: FileText },
  { href: "/dashboard/my-resumes", label: "My Resumes", icon: BookOpen },
  { href: "/dashboard/job-analyzer", label: "Job Analyzer", icon: Briefcase },
  { href: "/dashboard/job-history", label: "Saved Jobs", icon: FolderSearch },
  { href: "/history", label: "AI History", icon: History },
];

export default function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const isDashboardActive = pathname.startsWith("/dashboard") || pathname === "/history";

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900 text-lg">
              Resume<span className="text-blue-600">AI</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {/* AI Analyze */}
            <Link
              href="/analyze"
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                pathname === "/analyze"
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              <Sparkles className="w-4 h-4" />
              AI Analyze
            </Link>

            {/* Dashboard dropdown */}
            <div ref={dropdownRef} className="relative">
              <button
                onClick={() => setDropdownOpen((o) => !o)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                  isDashboardActive
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                )}
              >
                <LayoutDashboard className="w-4 h-4" />
                Dashboard
                <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", dropdownOpen && "rotate-180")} />
              </button>

              {dropdownOpen && (
                <div className="absolute top-full left-0 mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-50">
                  {dashboardDropdown.map(({ href, label, icon: Icon }) => (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setDropdownOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors",
                        pathname === href
                          ? "bg-blue-50 text-blue-700"
                          : "text-gray-700 hover:bg-gray-50"
                      )}
                    >
                      <Icon className="w-4 h-4 text-gray-400" />
                      {label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* CTA */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              href="/dashboard/resume-analyzer"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Analyze Resume
            </Link>
          </div>

          {/* Mobile toggle */}
          <button
            className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-gray-200 bg-white px-4 py-3 space-y-1">
          {/* All links flat on mobile */}
          {[
            { href: "/analyze", label: "AI Analyze", icon: Sparkles },
            ...dashboardDropdown,
          ].map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium",
                pathname === href
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-100"
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
          <Link
            href="/dashboard/resume-analyzer"
            onClick={() => setMobileOpen(false)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium mt-2"
          >
            <Sparkles className="w-4 h-4" />
            Analyze Resume
          </Link>
        </div>
      )}
    </nav>
  );
}
