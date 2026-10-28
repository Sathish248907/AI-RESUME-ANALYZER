import Link from "next/link";
import { FileText } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-400 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
                <FileText className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-bold text-white">
                Resume<span className="text-blue-400">AI</span>
              </span>
            </div>
            <p className="text-sm leading-relaxed">
              AI-powered resume analysis to help you land your dream job. Get instant feedback on skills, ATS compatibility, and more.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-white mb-3">Features</h2>
            <ul className="space-y-2 text-sm">
              <li><Link href="/analyze" className="hover:text-white transition-colors">Resume Analysis</Link></li>
              <li><Link href="/dashboard" className="hover:text-white transition-colors">Dashboard</Link></li>
              <li><Link href="/history" className="hover:text-white transition-colors">History</Link></li>
            </ul>
          </div>

          <div>
            <h2 className="font-semibold text-white mb-3">How it works</h2>
            <ul className="space-y-2 text-sm">
              <li>Upload your resume (PDF or DOCX)</li>
              <li>Paste the job description</li>
              <li>Get instant AI analysis</li>
              <li>Track your progress</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-8 pt-6 text-xs text-center">
          © {new Date().getFullYear()} ResumeAI. Match scores are estimates based on defined criteria, not objective truths.
        </div>
      </div>
    </footer>
  );
}
