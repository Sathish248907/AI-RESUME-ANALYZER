import Link from "next/link";
import {
  FileText,
  Zap,
  CheckCircle,
  Target,
  BarChart3,
  ArrowRight,
  Star,
  Shield,
  TrendingUp,
} from "lucide-react";

const features = [
  {
    icon: Target,
    title: "Resume–Job Match Score",
    description:
      "Get an estimated match percentage based on skills overlap, keywords, and experience — instantly.",
    color: "blue",
  },
  {
    icon: CheckCircle,
    title: "Skills Gap Analysis",
    description:
      "See exactly which skills you have, which are missing, and what to learn to close the gap.",
    color: "green",
  },
  {
    icon: Shield,
    title: "ATS Compatibility",
    description:
      "Identify formatting issues and missing keywords that could get your resume filtered out.",
    color: "orange",
  },
  {
    icon: BarChart3,
    title: "Keyword Analysis",
    description:
      "Map job description keywords to your resume and spot what's absent at a glance.",
    color: "indigo",
  },
  {
    icon: Star,
    title: "AI Improvement Tips",
    description:
      "Actionable, specific suggestions to strengthen your resume for the exact role you want.",
    color: "amber",
  },
  {
    icon: TrendingUp,
    title: "Interview Questions",
    description:
      "Get likely interview questions generated from your resume and the job description.",
    color: "purple",
  },
];

const steps = [
  {
    num: "01",
    title: "Upload your resume",
    desc: "Drop in a PDF or DOCX. We extract the text automatically.",
  },
  {
    num: "02",
    title: "Paste the job description",
    desc: "Copy the full job posting — the more detail, the better the analysis.",
  },
  {
    num: "03",
    title: "Get instant AI analysis",
    desc: "Our AI returns a structured breakdown in seconds, not minutes.",
  },
];

const colorMap: Record<string, string> = {
  blue: "bg-blue-100 text-blue-700",
  green: "bg-green-100 text-green-700",
  orange: "bg-orange-100 text-orange-700",
  indigo: "bg-indigo-100 text-indigo-700",
  amber: "bg-amber-100 text-amber-700",
  purple: "bg-purple-100 text-purple-700",
};

export default function Home() {
  return (
    <div className="overflow-hidden">
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-900 text-white">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-28 text-center">
          <div className="inline-flex items-center gap-2 bg-blue-800/50 border border-blue-700 rounded-full px-4 py-1.5 text-sm text-blue-200 mb-8">
            <Zap className="w-3.5 h-3.5" />
            Powered by Google Gemini AI
          </div>
          <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight leading-tight">
            Get Your Resume
            <br />
            <span className="text-blue-400">Match-Ready</span>
          </h1>
          <p className="mt-6 text-xl text-blue-200 max-w-2xl mx-auto leading-relaxed">
            Upload your resume and any job description. Our AI instantly tells
            you what matches, what&apos;s missing, and exactly how to improve.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/analyze"
              className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-blue-900 rounded-xl font-semibold text-lg hover:bg-blue-50 transition-colors shadow-lg"
            >
              Analyze My Resume
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/history"
              className="inline-flex items-center gap-2 px-8 py-3.5 bg-blue-800/60 border border-blue-700 text-white rounded-xl font-semibold text-lg hover:bg-blue-800 transition-colors"
            >
              View Past Analyses
            </Link>
          </div>
          <p className="mt-5 text-xs text-blue-400">
            Free to use · No account required to analyze
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-gray-900">How it works</h2>
            <p className="text-gray-500 mt-3 text-lg">
              Three steps from upload to actionable insights.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((step, i) => (
              <div
                key={step.num}
                className="relative flex flex-col items-center text-center p-8 rounded-2xl bg-gray-50 border border-gray-100"
              >
                <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-bold text-lg mb-5">
                  {step.num}
                </div>
                {i < 2 && (
                  <div className="hidden md:block absolute top-14 -right-4 z-10">
                    <ArrowRight className="w-8 h-8 text-gray-300" />
                  </div>
                )}
                <h3 className="text-lg font-semibold text-gray-900">{step.title}</h3>
                <p className="text-gray-500 mt-2 text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-gray-900">
              Everything you need to compete
            </h2>
            <p className="text-gray-500 mt-3 text-lg max-w-2xl mx-auto">
              One analysis gives you a full picture — from ATS flags to the
              interview questions you should prepare for.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map(({ icon: Icon, title, description, color }) => (
              <div
                key={title}
                className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${colorMap[color]}`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Example result preview */}
      <section className="py-20 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900">
              Example analysis result
            </h2>
            <p className="text-gray-500 mt-3">
              Here&apos;s what a Frontend Developer resume analysis might look like.
            </p>
          </div>

          <div className="bg-gray-50 rounded-2xl border border-gray-200 p-6 space-y-6">
            {/* Score row */}
            <div className="flex flex-wrap gap-4 items-center justify-between">
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-6 py-4 text-center min-w-[120px]">
                <div className="text-4xl font-bold text-yellow-600">78%</div>
                <div className="text-xs text-yellow-700 font-medium mt-1">Match Score</div>
                <div className="text-xs text-gray-400 mt-0.5">estimate</div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
                {[
                  { label: "Matched Skills", value: 5, color: "green" },
                  { label: "Missing Skills", value: 3, color: "red" },
                  { label: "ATS Issues", value: 1, color: "orange" },
                  { label: "Interview Qs", value: 6, color: "purple" },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className={`rounded-xl p-3 text-center border ${
                      stat.color === "green"
                        ? "bg-green-50 border-green-200 text-green-700"
                        : stat.color === "red"
                        ? "bg-red-50 border-red-200 text-red-700"
                        : stat.color === "orange"
                        ? "bg-orange-50 border-orange-200 text-orange-700"
                        : "bg-purple-50 border-purple-200 text-purple-700"
                    }`}
                  >
                    <div className="text-2xl font-bold">{stat.value}</div>
                    <div className="text-xs font-medium mt-0.5">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Skills */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
                  ✓ Matched Skills
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {["React", "JavaScript", "HTML", "CSS", "Git"].map((s) => (
                    <span key={s} className="px-2.5 py-1 bg-green-50 text-green-800 border border-green-200 rounded-full text-xs font-medium">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
                  ✗ Missing Skills
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {["TypeScript", "Next.js", "Jest"].map((s) => (
                    <span key={s} className="px-2.5 py-1 bg-red-50 text-red-800 border border-red-200 rounded-full text-xs font-medium">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Suggestions */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
                Suggestions
              </p>
              <ul className="space-y-1.5">
                {[
                  "Add TypeScript experience if applicable.",
                  "Mention specific React projects with measurable impact.",
                  "Quantify achievements with numbers and results.",
                ].map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="w-5 h-5 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-blue-600">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-white">
            Ready to improve your resume?
          </h2>
          <p className="text-blue-200 mt-3 text-lg">
            Takes under 60 seconds. No account needed.
          </p>
          <Link
            href="/analyze"
            className="inline-flex items-center gap-2 mt-8 px-8 py-3.5 bg-white text-blue-900 rounded-xl font-semibold text-lg hover:bg-blue-50 transition-colors shadow-lg"
          >
            Start Free Analysis
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>
    </div>
  );
}
