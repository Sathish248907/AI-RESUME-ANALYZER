import type {
  AtsAssessment,
  AtsCategory,
  AtsCategoryKey,
  AtsFinding,
  AtsAutoFix,
  AtsHistory,
  AtsCheckResult,
  ValidationIssue,
  ValidationReport,
  ApplyFixResult,
  AutoFixKind,
  RoleCard,
  RoleRecommendations,
  AssistantReply,
  AssistantDraft,
  AssistantIntent,
  ResumeVersion,
  ResumeVersionSummary,
  ResumeContent,
  ResumeSection,
  SectionType,
  Formatting,
  Template,
  TemplateId,
  Suggestion,
  SuggestionGroup,
  SuggestionStatus,
  Priority,
  TailorResult,
  QualityReport,
  QualityIssue,
  CompareResult,
  Personal,
  ExperienceEntry,
  ProjectEntry,
  EducationEntry,
  CertificationEntry,
  SkillGroup,
} from "@/services/resumeBuilderService";

export interface JobDescriptionOption {
  id: string;
  jobTitle: string;
  companyName?: string | null;
}

/**
 * One exchange with the writing assistant, kept on the page (not the server) so
 * switching tabs does not lose the thread. `reply` is null while in flight and
 * `error` is set when the request failed, so the turn stays visible either way.
 */
export interface AssistantTurn {
  id: string;
  intent: AssistantIntent;
  intentLabel: string;
  question: string;
  scopeLabel: string;
  askedAt: string;
  reply: AssistantReply | null;
  error: string | null;
}

export type {
  AtsAssessment,
  AtsCategory,
  AtsCategoryKey,
  AtsFinding,
  AtsAutoFix,
  AtsHistory,
  AtsCheckResult,
  ValidationIssue,
  ValidationReport,
  ApplyFixResult,
  AutoFixKind,
  RoleCard,
  RoleRecommendations,
  AssistantReply,
  AssistantDraft,
  AssistantIntent,
  ResumeVersion,
  ResumeVersionSummary,
  ResumeContent,
  ResumeSection,
  SectionType,
  Formatting,
  Template,
  TemplateId,
  Suggestion,
  SuggestionGroup,
  SuggestionStatus,
  Priority,
  TailorResult,
  QualityReport,
  QualityIssue,
  CompareResult,
  Personal,
  ExperienceEntry,
  ProjectEntry,
  EducationEntry,
  CertificationEntry,
  SkillGroup,
};

/** The assistant's menu of requests, so panels do not restate the list. */
export { ASSISTANT_INTENTS } from "@/services/resumeBuilderService";
