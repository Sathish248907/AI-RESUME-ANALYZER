import { Lightbulb, AlertTriangle, Star, HelpCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/Card";

interface SuggestionsListProps {
  strengths: string[];
  suggestions: string[];
  atsIssues: string[];
  interviewQuestions: string[];
}

export default function SuggestionsList({
  strengths,
  suggestions,
  atsIssues,
  interviewQuestions,
}: SuggestionsListProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Strengths */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-500" />
            <CardTitle>Strengths</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="mt-0.5 w-5 h-5 bg-amber-100 rounded-full flex items-center justify-center text-amber-700 font-bold text-xs flex-shrink-0">
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Suggestions */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-blue-500" />
            <CardTitle>Improvement Suggestions</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {suggestions.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="mt-0.5 w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-xs flex-shrink-0">
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* ATS Issues */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            <CardTitle>ATS Analysis</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {atsIssues.length === 0 ? (
            <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
              ✓ No major ATS issues detected
            </p>
          ) : (
            <ul className="space-y-2">
              {atsIssues.map((issue, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-gray-700 bg-orange-50 rounded-lg px-3 py-2"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-orange-500 mt-0.5 flex-shrink-0" />
                  {issue}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Interview Questions */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-purple-500" />
            <CardTitle>Likely Interview Questions</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {interviewQuestions.map((q, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-gray-700 bg-purple-50 rounded-lg px-3 py-2"
              >
                <span className="text-purple-500 font-bold flex-shrink-0">Q{i + 1}.</span>
                {q}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
