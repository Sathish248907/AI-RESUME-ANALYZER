export interface AnalysisResult {
  matchScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  strengths: string[];
  suggestions: string[];
  atsIssues: string[];
  interviewQuestions: string[];
  experienceAlignment: string;
  educationAlignment: string;
  keywordAnalysis: {
    found: string[];
    missing: string[];
  };
}

export interface JobDescriptionParsed {
  role: string;
  skills: string[];
  experience: string;
  education: string;
  responsibilities: string[];
}

export interface AnalysisRecord {
  id: string;
  jobTitle: string;
  jobDescription: string;
  matchScore: number;
  result: AnalysisResult;
  createdAt: string;
  resume: {
    id: string;
    fileName: string;
  };
}

export interface UploadState {
  file: File | null;
  text: string;
  loading: boolean;
  error: string | null;
}
