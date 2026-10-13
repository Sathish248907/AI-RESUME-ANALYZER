import { CheckCircle, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

interface SkillsPanelProps {
  matched: string[];
  missing: string[];
}

export default function SkillsPanel({ matched, missing }: SkillsPanelProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Matched Skills */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <CardTitle className="text-green-700">Matched Skills</CardTitle>
            <span className="ml-auto text-sm font-semibold bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
              {matched.length}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {matched.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No matching skills found.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {matched.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-50 text-green-800 text-xs font-medium border border-green-200"
                >
                  <CheckCircle className="w-3 h-3" />
                  {skill}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Missing Skills */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <XCircle className="w-5 h-5 text-red-500" />
            <CardTitle className="text-red-700">Missing Skills</CardTitle>
            <span className="ml-auto text-sm font-semibold bg-red-100 text-red-800 px-2 py-0.5 rounded-full">
              {missing.length}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {missing.length === 0 ? (
            <p className="text-sm text-gray-400 italic">
              No missing skills — great match!
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {missing.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 text-red-800 text-xs font-medium border border-red-200"
                >
                  <XCircle className="w-3 h-3" />
                  {skill}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
