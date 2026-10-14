/**
 * Frontend client-side storage and cache utilities.
 * Provides unified access to saved demo analysis results and job history.
 */

export {
  saveAnalysis,
  loadAnalysisById,
  loadAllAnalyses,
  deleteAnalysis,
  clearAllAnalyses,
  getAnalysisMetas,
} from "@/services/analysisStorage";
export type { StoredAnalysisMeta } from "@/services/analysisStorage";

export {
  saveJobAnalysis,
  getJobAnalysisById,
  getAllJobAnalyses,
  deleteJobAnalysis,
  clearAllJobAnalyses,
  getJobAnalysisMetas,
} from "@/services/jobAnalysisStorage";
export type { JobAnalysisMeta } from "@/services/jobAnalysisStorage";
