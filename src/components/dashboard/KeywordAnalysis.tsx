import { Tag } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";

interface KeywordAnalysisProps {
  found: string[];
  missing: string[];
  experienceAlignment: string;
  educationAlignment: string;
}

export default function KeywordAnalysis({
  found,
  missing,
  experienceAlignment,
  educationAlignment,
}: KeywordAnalysisProps) {
  const total = found.length + missing.length;
  const density = total === 0 ? 0 : Math.round((found.length / total) * 100);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-indigo-500" />
            <CardTitle>Keyword Coverage</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ProgressBar
            value={density}
            barClassName={density >= 70 ? "bg-green-500" : density >= 40 ? "bg-yellow-500" : "bg-red-500"}
            label="Job keyword match"
            showValue
          />
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Found in resume</p>
            <div className="flex flex-wrap gap-1.5">
              {found.map((kw) => (
                <span
                  key={kw}
                  className="px-2 py-0.5 bg-indigo-50 text-indigo-800 border border-indigo-200 rounded text-xs font-medium"
                >
                  {kw}
                </span>
              ))}
            </div>
          </div>
          {missing.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Missing keywords</p>
              <div className="flex flex-wrap gap-1.5">
                {missing.map((kw) => (
                  <span
                    key={kw}
                    className="px-2 py-0.5 bg-gray-50 text-gray-600 border border-gray-200 rounded text-xs"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alignment Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <p className="text-xs font-semibold text-blue-700 uppercase mb-1">Experience</p>
            <p className="text-sm text-gray-800">{experienceAlignment}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <p className="text-xs font-semibold text-green-700 uppercase mb-1">Education</p>
            <p className="text-sm text-gray-800">{educationAlignment}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
