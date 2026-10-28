"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  FileText, LayoutDashboard, History, Menu, X,
  Sparkles, BookOpen, ChevronDown, Briefcase, FolderSearch, ClipboardList, LineChart, Bot, Mic, Map, Target, PenSquare, Compass, Activity, Search, Plug, Settings as SettingsIcon,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/services/authService";
import NotificationBell from "@/components/progress/NotificationBell";

const primaryLinks = [
  { href: "/analyze", label: "AI Analyze", icon: Sparkles },
  { href: "/dashboard/resume-analyzer", label: "Resume Analyzer", icon: FileText },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
];

/**
 * The dashboard menu, grouped.
 *
 * Phase 16 audit: this was a flat list of eighteen links in no particular
 * order, which made it hard to tell that "Resume Analyzer", "ATS Analyzer" and
 * "Job Analyzer (rules)" are three different things. Grouping them by what a
 * user is trying to do costs nothing and makes the duplication legible; every
 * route that existed before is still here, none were renamed.
 */
const dashboardGroups: Array<{ label: string; items: Array<{ href: string; label: string; icon: typeof LayoutDashboard; hint?: string }> }> = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/dashboard/progress", label: "Progress & achievements", icon: Activity },
      { href: "/dashboard/analytics", label: "Career analytics", icon: LineChart },
    ],
  },
  {
    label: "Resume",
    items: [
      { href: "/dashboard/my-resumes", label: "My resumes", icon: FileText },
      { href: "/dashboard/resume-builder", label: "Resume builder", icon: PenSquare },
      { href: "/dashboard/resume-analyzer", label: "ATS & match analysis", icon: Sparkles },
      { href: "/dashboard/analysis-history", label: "Analysis history", icon: Bot },
    ],
  },
  {
    label: "Jobs & applications",
    items: [
      { href: "/dashboard/jobs", label: "Job discovery", icon: Search },
      { href: "/dashboard/applications", label: "My applications", icon: ClipboardList },
      { href: "/dashboard/job-descriptions", label: "Saved job descriptions", icon: BookOpen },
    ],
  },
  {
    label: "Practice & learning",
    items: [
      { href: "/dashboard/interviews", label: "Mock interviews", icon: Mic },
      { href: "/dashboard/learning", label: "Learning roadmap", icon: Map },
      { href: "/dashboard/learning/skill-gaps", label: "Skill gap analysis", icon: Target },
      { href: "/dashboard/career", label: "Career coach", icon: Compass },
    ],
  },
  {
    label: "Setup",
    items: [
      { href: "/dashboard/settings", label: "Settings", icon: SettingsIcon },
      { href: "/dashboard/integrations", label: "Integrations & automation", icon: Plug },
    ],
  },
  {
    label: "Rule-based tools",
    items: [
      { href: "/dashboard/job-analyzer", label: "Job analyzer", icon: Briefcase, hint: "no AI" },
      { href: "/dashboard/job-history", label: "Local job analyses", icon: FolderSearch, hint: "this browser" },
      { href: "/history", label: "Legacy analysis history", icon: History, hint: "Phase 1" },
    ],
  },
];

/** Flat list, kept for the mobile menu and for active-state checks. */
const dashboardDropdown = dashboardGroups.flatMap((g) => g.items);

export default function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { user, logout } = useAuth();

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
                <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-50 max-h-[80vh] overflow-y-auto">
                  {dashboardGroups.map((group, i) => (
                    <div key={group.label} className={cn(i > 0 && "border-t border-gray-100 mt-1 pt-1")}>
                      <p className="px-4 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                        {group.label}
                      </p>
                      {group.items.map(({ href, label, icon: Icon, hint }) => (
                        <Link
                          key={href}
                          href={href}
                          onClick={() => setDropdownOpen(false)}
                          aria-current={pathname === href ? "page" : undefined}
                          className={cn(
                            "flex items-center gap-3 px-4 py-2 text-sm font-medium transition-colors",
                            pathname === href
                              ? "bg-blue-50 text-blue-700"
                              : "text-gray-700 hover:bg-gray-50"
                          )}
                        >
                          <Icon className="w-4 h-4 text-gray-400 shrink-0" />
                          <span className="flex-1 truncate">{label}</span>
                          {hint && <span className="text-[10px] text-gray-400 shrink-0">{hint}</span>}
                        </Link>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* CTA */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-2 text-sm">
                <NotificationBell enabled={Boolean(user)} />
                <span className="text-gray-600 max-w-[160px] truncate" title={user.email}>{user.name || user.email}</span>
                <button type="button" onClick={logout} className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors">
                  Sign out
                </button>
              </div>
            ) : (
              <Link href="/auth/login" className="px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors">
                Sign in
              </Link>
            )}
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
          {user ? (
            <button type="button" onClick={() => { logout(); setMobileOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100">
              Sign out ({user.name || user.email})
            </button>
          ) : (
            <Link href="/auth/login" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100">
              Sign in for AI analysis
            </Link>
          )}
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
