"use client";

import { useState } from "react";
import { GraduationCap, Clock, Award, Building, BarChart2, Pencil, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { DEGREE_PATTERNS, SENIORITY_PATTERNS } from "@/services/skillDictionary";
import type { EducationRequirement, ExperienceRequirement } from "@/services/jobDescriptionParser";

interface ExperienceEducationCardProps {
  experience: ExperienceRequirement;
  education: EducationRequirement;
  certifications: string[];
  onUpdateExperience?: (patch: Partial<ExperienceRequirement>) => void;
  onUpdateEducation?: (patch: Partial<EducationRequirement>) => void;
}

const NOT_SPECIFIED = <span className="text-gray-400 italic">Not specified</span>;

export default function ExperienceEducationCard({
  experience,
  education,
  certifications,
  onUpdateExperience,
  onUpdateEducation,
}: ExperienceEducationCardProps) {
  const [editingExp, setEditingExp] = useState(false);
  const [editingEdu, setEditingEdu] = useState(false);

  // Experience draft
  const [minYears, setMinYears] = useState(experience.minYears?.toString() ?? "");
  const [maxYears, setMaxYears] = useState(experience.maxYears?.toString() ?? "");
  const [seniority, setSeniority] = useState(experience.seniority ?? "");
  const [expError, setExpError] = useState<string | null>(null);

  // Education draft
  const [degrees, setDegrees] = useState<string[]>(education.degrees);
  const [fields, setFields] = useState(education.fields.join(", "));
  const [eduPriority, setEduPriority] = useState<EducationRequirement["priority"]>(education.priority);

  function startEditExp() {
    setMinYears(experience.minYears?.toString() ?? "");
    setMaxYears(experience.maxYears?.toString() ?? "");
    setSeniority(experience.seniority ?? "");
    setExpError(null);
    setEditingExp(true);
  }

  function saveExp() {
    const min = minYears.trim() === "" ? null : Number(minYears);
    const max = maxYears.trim() === "" ? null : Number(maxYears);
    if ((min !== null && (Number.isNaN(min) || min < 0 || min > 50)) || (max !== null && (Number.isNaN(max) || max < 0 || max > 50))) {
      setExpError("Years must be a whole number between 0 and 50.");
      return;
    }
    if (min !== null && max !== null && max < min) {
      setExpError("Maximum years cannot be less than minimum years.");
      return;
    }
    onUpdateExperience?.({
      minYears: min,
      maxYears: min === null ? null : max,
      seniority: seniority || null,
      userConfirmed: true,
    });
    setEditingExp(false);
  }

  function startEditEdu() {
    setDegrees(education.degrees);
    setFields(education.fields.join(", "));
    setEduPriority(education.priority);
    setEditingEdu(true);
  }

  function saveEdu() {
    onUpdateEducation?.({
      degrees,
      fields: fields.split(",").map((f) => f.trim()).filter(Boolean),
      priority: eduPriority,
      userConfirmed: true,
    });
    setEditingEdu(false);
  }

  const degreeOptions = DEGREE_PATTERNS.map((d) => d.label);
  const seniorityOptions = [...new Set(SENIORITY_PATTERNS.map((s) => s.label))];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-blue-600" />
          Experience &amp; Education
        </CardTitle>
        <p className="text-xs text-gray-500 mt-1">Values are only shown when the text states them. Confirm or correct them so the overview stays accurate.</p>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Experience */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2"><Clock className="w-4 h-4 text-gray-400" /> Experience</h4>
            {onUpdateExperience && !editingExp && (
              <button type="button" onClick={startEditExp} className="text-xs text-blue-600 hover:underline flex items-center gap-1"><Pencil className="w-3 h-3" /> {experience.userConfirmed ? "Edit" : "Confirm / correct"}</button>
            )}
          </div>

          {editingExp ? (
            <div className="space-y-2 bg-blue-50/60 border border-blue-100 rounded-lg p-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-gray-600">Min years
                  <input type="number" min={0} max={50} value={minYears} onChange={(e) => setMinYears(e.target.value)} placeholder="—" className="mt-1 w-full text-sm px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </label>
                <label className="text-xs text-gray-600">Max years
                  <input type="number" min={0} max={50} value={maxYears} onChange={(e) => setMaxYears(e.target.value)} placeholder="—" className="mt-1 w-full text-sm px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </label>
              </div>
              <label className="text-xs text-gray-600 block">Seniority
                <select value={seniority} onChange={(e) => setSeniority(e.target.value)} className="mt-1 w-full text-sm px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Not specified</option>
                  {seniorityOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
              {expError && <p className="text-xs text-red-600">{expError}</p>}
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={saveExp}><Check className="w-3.5 h-3.5" /> Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingExp(false)}><X className="w-3.5 h-3.5" /> Cancel</Button>
              </div>
            </div>
          ) : (
            <dl className="text-sm space-y-2.5">
              <Row label="Minimum years">
                {experience.minYears === null ? NOT_SPECIFIED : (
                  <span className="font-medium text-gray-900">
                    {experience.maxYears !== null ? `${experience.minYears}–${experience.maxYears} years` : `${experience.minYears}+ years`}
                  </span>
                )}
                {experience.evidence && !experience.userConfirmed && <Evidence text={experience.evidence} />}
              </Row>
              <Row label="Seniority level">
                {experience.seniority ? <span className="font-medium text-gray-900">{experience.seniority}</span> : NOT_SPECIFIED}
                {experience.seniorityEvidence && !experience.userConfirmed && <Evidence text={experience.seniorityEvidence} />}
              </Row>
              <Row label="Industry experience" icon={Building}>
                {experience.industries.length === 0 ? NOT_SPECIFIED : (
                  <div className="flex flex-wrap gap-1.5 mt-0.5">{experience.industries.map((i) => <Badge key={i} variant="neutral">{i}</Badge>)}</div>
                )}
              </Row>
              {experience.userConfirmed && <p className="text-[11px] text-green-700 flex items-center gap-1"><Check className="w-3 h-3" /> Confirmed by you</p>}
            </dl>
          )}
        </section>

        {/* Education */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2"><GraduationCap className="w-4 h-4 text-gray-400" /> Education</h4>
            {onUpdateEducation && !editingEdu && (
              <button type="button" onClick={startEditEdu} className="text-xs text-blue-600 hover:underline flex items-center gap-1"><Pencil className="w-3 h-3" /> {education.userConfirmed ? "Edit" : "Confirm / correct"}</button>
            )}
          </div>

          {editingEdu ? (
            <div className="space-y-2 bg-blue-50/60 border border-blue-100 rounded-lg p-3">
              <p className="text-xs text-gray-600">Degree level(s)</p>
              <div className="flex flex-wrap gap-1.5">
                {degreeOptions.map((d) => {
                  const on = degrees.includes(d);
                  return (
                    <button key={d} type="button" onClick={() => setDegrees((prev) => on ? prev.filter((x) => x !== d) : [...prev, d])} className={`text-xs px-2 py-1 rounded-full border transition-colors ${on ? "bg-blue-100 text-blue-800 border-blue-300" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
                      {on && <Check className="inline w-3 h-3 mr-0.5" />}{d}
                    </button>
                  );
                })}
              </div>
              <label className="text-xs text-gray-600 block">Fields (comma-separated)
                <input value={fields} onChange={(e) => setFields(e.target.value)} placeholder="Computer Science, Engineering" className="mt-1 w-full text-sm px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </label>
              <label className="text-xs text-gray-600 block">Priority
                <select value={eduPriority ?? ""} onChange={(e) => setEduPriority((e.target.value || null) as EducationRequirement["priority"])} className="mt-1 w-full text-sm px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Not stated</option>
                  <option value="required">Required</option>
                  <option value="preferred">Preferred / or equivalent experience</option>
                </select>
              </label>
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={saveEdu}><Check className="w-3.5 h-3.5" /> Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingEdu(false)}><X className="w-3.5 h-3.5" /> Cancel</Button>
              </div>
            </div>
          ) : (
            <dl className="text-sm space-y-2.5">
              <Row label="Qualification">
                {education.degrees.length === 0 ? NOT_SPECIFIED : (
                  <span className="font-medium text-gray-900">{education.degrees.join(" or ")}</span>
                )}
                {education.priority && (
                  <Badge variant={education.priority === "required" ? "info" : "success"} className="ml-2">{education.priority === "required" ? "Required" : "Preferred"}</Badge>
                )}
                {education.evidence && !education.userConfirmed && <Evidence text={education.evidence} />}
              </Row>
              <Row label="Field of study">
                {education.fields.length === 0 ? NOT_SPECIFIED : (
                  <div className="flex flex-wrap gap-1.5 mt-0.5">{education.fields.map((f) => <Badge key={f} variant="neutral">{f}</Badge>)}</div>
                )}
              </Row>
              <Row label="Certifications" icon={Award}>
                {certifications.length === 0 ? NOT_SPECIFIED : (
                  <ul className="mt-0.5 space-y-1">
                    {certifications.map((c) => <li key={c} className="text-gray-800 text-sm">• {c}</li>)}
                  </ul>
                )}
              </Row>
              {education.userConfirmed && <p className="text-[11px] text-green-700 flex items-center gap-1"><Check className="w-3 h-3" /> Confirmed by you</p>}
            </dl>
          )}
        </section>

        <p className="md:col-span-2 text-[11px] text-gray-400 flex items-center gap-1.5 pt-2 border-t border-gray-100">
          <BarChart2 className="w-3 h-3" /> Requirements are never invented. “Not specified” means the demo parser found no supporting text.
        </p>
      </CardContent>
    </Card>
  );
}

function Row({ label, icon: Icon, children }: { label: string; icon?: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-500 flex items-center gap-1">{Icon && <Icon className="w-3 h-3" />}{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function Evidence({ text }: { text: string }) {
  return <p className="text-[11px] text-gray-500 mt-1 leading-snug"><span className="font-medium">From text:</span> “{text}”</p>;
}
