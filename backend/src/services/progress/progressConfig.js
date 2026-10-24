/**
 * progressConfig.js — every tunable number for Phase 10 in one place: point values,
 * daily caps, level thresholds, progress-score weights, achievement criteria and
 * streak rules. Nothing elsewhere hardcodes these; change them here.
 *
 * Methods are versioned so stored snapshots / transactions can be interpreted later.
 */

export const GAMIFICATION_METHOD = "gamification-1.0";
export const PROGRESS_SCORE_METHOD = "career-progress-1.0";
export const ANALYTICS_METHOD = "career-analytics-1.0";
export const REPORT_METHOD = "progress-report-1.0";

/**
 * Point values per eligible event type. `dailyCap` limits how many events of that
 * type can earn points on one local day (repeated trivial actions earn nothing extra);
 * `min*` fields are eligibility thresholds documented to the user.
 */
export const POINT_RULES = {
  learning_task_completed: { points: 10, label: "Completed a learning task", category: "learning", dailyCap: 8 },
  learning_optional_task_completed: { points: 5, label: "Completed an optional learning task", category: "learning", dailyCap: 4 },
  checkpoint_passed: { points: 15, label: "Passed a knowledge checkpoint (verified quiz)", category: "learning", dailyCap: 4 },
  milestone_completed: { points: 40, label: "Completed a roadmap milestone", category: "learning", dailyCap: 3 },
  roadmap_completed: { points: 100, label: "Finished a learning roadmap", category: "learning", dailyCap: 1 },
  interview_completed: { points: 25, label: "Finished a mock interview (≥ 3 evaluated answers)", category: "interview", dailyCap: 3, minEvaluated: 3 },
  interview_strong_score: { points: 15, label: "Scored 80 % or more in a mock interview", category: "interview", dailyCap: 3, minScore: 80 },
  coding_session_completed: { points: 30, label: "Completed a coding interview session (≥ 2 evaluated answers)", category: "interview", dailyCap: 2, minEvaluated: 2 },
  resume_improved: { points: 20, label: "Improved a resume version's quality score by 5+ points", category: "resume", dailyCap: 3, minDelta: 5, minAbsolute: 70 },
  resume_analysis_run: { points: 5, label: "Ran a resume–job analysis", category: "resume", dailyCap: 2 },
  application_submitted: { points: 10, label: "Submitted a job application (status beyond Interested)", category: "application", dailyCap: 5 },
  application_interview_stage: { points: 20, label: "Reached the interview or offer stage", category: "application", dailyCap: 5 },
  career_assessment_completed: { points: 5, label: "Ran a career readiness assessment", category: "career", dailyCap: 1 },
  plan_task_completed: { points: 5, label: "Completed a weekly plan task", category: "career", dailyCap: 6 },
  weekly_plan_completed: { points: 50, label: "Completed every required task of a weekly plan", category: "career", dailyCap: 1 },
  consistency_week: { points: 20, label: "Learned on 3+ days in one week", category: "gamification", dailyCap: 1, minActiveDays: 3 },
};

/** Level thresholds (cumulative points). Beyond the last entry, each level needs `LEVEL_STEP_AFTER_LAST` more points. */
export const LEVELS = [
  { level: 1, name: "Career Explorer", minPoints: 0 },
  { level: 2, name: "Skill Builder", minPoints: 200 },
  { level: 3, name: "Interview Ready", minPoints: 600 },
  { level: 4, name: "Career Achiever", minPoints: 1200 },
  { level: 5, name: "Professional Growth", minPoints: 2000 },
];
export const LEVEL_STEP_AFTER_LAST = 1000;
export const LEVEL_DISCLAIMER = "Levels describe activity in this app, not your qualification for any role.";

/** Progress score dimensions (weights sum to 100; a dimension without evidence is excluded and the rest re-normalised). */
export const PROGRESS_WEIGHTS = {
  resume_improvement: 20,
  interview_performance: 20,
  skill_development: 15,
  learning_completion: 15,
  application_activity: 15,
  career_readiness: 15,
};
export const PROGRESS_MIN_DIMENSIONS = 2;

/**
 * Achievement criteria. `metric` names a value in the stats object produced by
 * gamificationService.computeStats; unlock when value >= threshold.
 */
export const ACHIEVEMENTS = [
  { key: "first_analysis", title: "First Resume Analysis", description: "Run your first resume–job analysis.", metric: "analyses", threshold: 1, category: "resume", icon: "search" },
  { key: "resume_improver", title: "Resume Improvement", description: "Raise a resume version's quality score by at least 5 points.", metric: "resumeImprovements", threshold: 1, category: "resume", icon: "file" },
  { key: "resume_polisher", title: "Resume Polisher", description: "Improve three different resume versions.", metric: "resumeImprovements", threshold: 3, category: "resume", icon: "sparkles" },
  { key: "first_interview", title: "First Mock Interview", description: "Finish a mock interview with at least 3 evaluated answers.", metric: "interviewsCompleted", threshold: 1, category: "interview", icon: "mic" },
  { key: "interview_practice_5", title: "Interview Practice Milestone", description: "Finish five mock interviews.", metric: "interviewsCompleted", threshold: 5, category: "interview", icon: "mic" },
  { key: "strong_interview", title: "Strong Performance", description: "Score 80 % or more in a mock interview.", metric: "strongInterviews", threshold: 1, category: "interview", icon: "award" },
  { key: "first_milestone", title: "First Learning Milestone", description: "Complete a roadmap milestone.", metric: "milestonesCompleted", threshold: 1, category: "learning", icon: "flag" },
  { key: "learning_tasks_10", title: "Skill Development Milestone", description: "Complete ten learning tasks.", metric: "learningTasksCompleted", threshold: 10, category: "learning", icon: "book" },
  { key: "roadmap_finisher", title: "Roadmap Finisher", description: "Complete every required task of a learning roadmap.", metric: "roadmapsCompleted", threshold: 1, category: "learning", icon: "map" },
  { key: "consistent_learner", title: "Consistent Learner", description: "Reach a 7-day learning streak.", metric: "longestStreak", threshold: 7, category: "gamification", icon: "flame" },
  { key: "first_application", title: "First Job Application", description: "Move an application past “Interested”.", metric: "applicationsSubmitted", threshold: 1, category: "application", icon: "briefcase" },
  { key: "interview_invite", title: "Interview Invitation", description: "Reach the interview stage with an application.", metric: "applicationsInterviewStage", threshold: 1, category: "application", icon: "calendar" },
  { key: "plan_completed", title: "Career Plan Completed", description: "Complete every required task of a weekly career plan.", metric: "plansCompleted", threshold: 1, category: "career", icon: "check" },
  { key: "self_aware", title: "Self-Assessed", description: "Run a career readiness assessment.", metric: "assessments", threshold: 1, category: "career", icon: "target" },
];

/** Streak rules — which event types count as a "learning day". */
export const STREAK_QUALIFYING_TYPES = new Set([
  "learning_task_completed", "learning_optional_task_completed", "checkpoint_passed", "milestone_completed", "roadmap_completed",
  "interview_completed", "coding_session_completed", "plan_task_completed",
]);
export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100];

/** Default notification preferences (all on; the user can switch each category off). */
export const DEFAULT_NOTIFICATION_PREFERENCES = { achievements: true, levels: true, milestones: true, assessments: true, reports: true, goals: true, streaks: true };

/** Goal types the goal engine can measure from records. */
export const GOAL_TYPES = {
  mock_interviews: { label: "Finish mock interviews", unit: "interviews", measurable: true },
  learning_tasks: { label: "Complete learning tasks", unit: "tasks", measurable: true },
  roadmap_completion: { label: "Finish a learning roadmap", unit: "%", measurable: true, percent: true },
  resume_quality: { label: "Reach a resume quality score", unit: "score", measurable: true, absolute: true },
  skill_practice: { label: "Practise a specific skill", unit: "activities", measurable: true },
  applications: { label: "Submit job applications", unit: "applications", measurable: true },
  custom: { label: "Custom goal (tracked manually)", unit: "steps", measurable: false },
};

export const ANALYTICS_RANGES = { "7d": 7, "30d": 30, "90d": 90, all: null };
export const MIN_SAMPLE_FOR_RATES = 5;
