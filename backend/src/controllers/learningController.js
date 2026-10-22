import { ApiError, badRequest } from "../utils/errors.js";
import { pageMeta } from "../validators/common.js";
import { analyzeSkillGaps, selectRoadmapSkills } from "../services/learning/skillGapService.js";
import { generateRoadmap, mergeProgress, publicCheckpoint, gradeMcq, ROADMAP_SCHEMA_VERSION } from "../services/learning/learningRoadmapService.js";
import { roadmapProgress, milestoneStatuses, buildWeeklyPlan, nextAction } from "../services/learning/learningProgressService.js";
import { buildLearningRecommendations } from "../services/learning/learningRecommendationService.js";
import { resourcesForTask } from "../services/learning/learningResourceService.js";
import { buildRecommendations as interviewRecommendations, toEvidence } from "../services/interview/weakTopicService.js";
import { logger } from "../utils/logger.js";

/**
 * @param {{ repo, resumeRepo, jobDescriptionRepo, analysisRepo, interviewRepo, getLlm: Function }} deps
 */
export function createLearningController({ repo, resumeRepo, jobDescriptionRepo, analysisRepo, interviewRepo, getLlm }) {
  // ── helpers ──────────────────────────────────────────────────────────────

  /** Collect every evidence source the user selected (all owner-checked). */
  async function collectInputs(userId, body) {
    const sources = [];
    let jobSkills = [];
    let jobDescription = null;
    let analysis = null;
    let resumeSummary = null;

    if (body.jobDescriptionId) {
      const jd = await jobDescriptionRepo.findByIdForUser(body.jobDescriptionId, userId);
      jobDescription = jd.description;
      jobSkills = (jd.extractedRequirements?.skills ?? []).map((s) => ({ name: s.name, priority: s.priority, category: s.category }));
      sources.push({ type: "job_description", id: jd.id, label: `${jd.jobTitle}${jd.companyName ? ` · ${jd.companyName}` : ""}` });
    }
    let analysisRow = null;
    if (body.analysisId) analysisRow = await analysisRepo.findByIdForUser(body.analysisId, userId);
    else if (body.resumeId || body.jobDescriptionId) {
      const { items } = await analysisRepo.listForUser(userId, { mode: "ai", limit: 1, page: 1, sort: "newest", ...(body.resumeId ? { resumeId: body.resumeId } : {}), ...(body.jobDescriptionId ? { jobDescriptionId: body.jobDescriptionId } : {}) });
      if (items[0]) analysisRow = await analysisRepo.findByIdForUser(items[0].id, userId);
    }
    if (analysisRow) {
      const r = analysisRow.result ?? {};
      analysis = { matched: (r.matchedSkills ?? []).map((s) => s.name), partial: (r.partiallyMatchedSkills ?? []).map((s) => s.name), missing: (r.missingOrUnverifiedSkills ?? []).map((s) => ({ name: s.name, priority: s.priority })) };
      if (jobSkills.length === 0) jobSkills = [...(r.matchedSkills ?? []), ...(r.partiallyMatchedSkills ?? []), ...(r.missingOrUnverifiedSkills ?? [])].map((s) => ({ name: s.name, priority: s.priority, category: s.category }));
      if (!jobDescription && analysisRow.jobDescription) jobDescription = analysisRow.jobDescription;
      resumeSummary = { matchedSkills: analysis.matched };
      sources.push({ type: "resume_analysis", id: analysisRow.id, label: `${analysisRow.jobTitle} (${analysisRow.matchScore}%)` });
    }
    if (body.resumeId) {
      const resume = await resumeRepo.findByIdForUser(body.resumeId, userId);
      sources.push({ type: "resume", id: resume.id, label: resume.name });
      if (!resumeSummary) resumeSummary = { matchedSkills: [] };
    }

    let interview = { weakTopics: [], candidateTopics: [], strongTopics: [], recurringGaps: [] };
    if (body.useInterviewHistory !== false) {
      const { answers, sessionCount } = await interviewRepo.loadEvaluatedAnswersForUser(userId);
      const filtered = body.interviewSessionIds?.length ? answers.filter((a) => body.interviewSessionIds.includes(a.sessionId)) : answers;
      const recs = interviewRecommendations(toEvidence(filtered), { sessionCount });
      interview = { weakTopics: recs.weakTopics.map((t) => t.topic), candidateTopics: recs.candidateTopics.map((t) => t.topic), strongTopics: recs.strongTopics.map((t) => t.topic), recurringGaps: recs.recurringGaps.map((g) => g.concept) };
      if (recs.evidence.evaluatedAnswers > 0) sources.push({ type: "mock_interviews", id: null, label: `${recs.evidence.evaluatedAnswers} evaluated answers across ${sessionCount} sessions` });
    }

    const existingGaps = await repo.listSkillGaps(userId);
    const confirmedSkills = [...(body.confirmedSkills ?? []), ...existingGaps.filter((g) => g.userConfirmed && g.proficiencyStatus === "demonstrated").map((g) => g.skillName)];
    return { sources, jobSkills, jobDescription, analysis, resumeSummary, interview, confirmedSkills };
  }

  async function buildPlan(userId, body) {
    const llm = getLlm();
    const inputs = await collectInputs(userId, body);
    const gaps = analyzeSkillGaps({ targetRole: body.targetRole, jobSkills: inputs.jobSkills, analysis: inputs.analysis, interview: inputs.interview, confirmedSkills: inputs.confirmedSkills, goalSkills: body.goalSkills });
    const gapSkills = selectRoadmapSkills(gaps, { max: 12 });
    if (gapSkills.length === 0) throw badRequest("Every identified skill is already demonstrated — nothing to plan. Add goal skills or pick a job description to target.");
    const weeks = body.targetCompletionDate ? Math.max(1, Math.ceil((new Date(body.targetCompletionDate) - Date.now()) / (7 * 86_400_000))) : body.currentSkillLevel === "beginner" ? 12 : 8;
    const { roadmap, provider, model } = await generateRoadmap(llm, {
      targetRole: body.targetRole, currentSkillLevel: body.currentSkillLevel, objective: body.objective, weeklyStudyHours: body.weeklyStudyHours, preferredFormat: body.preferredFormat ?? "mixed", targetWeeks: weeks,
      gapSkills, demonstratedSkills: gaps.skills.filter((s) => s.proficiencyStatus === "demonstrated").map((s) => s.skillName), weakTopics: inputs.interview.weakTopics, jobDescription: inputs.jobDescription, resumeSummary: inputs.resumeSummary,
    });
    return { roadmap, gaps, inputs, provider, model };
  }

  function metaFromBody(body, { provider, model, sources, version = 1, previousVersionId = null, changeSummary = null }) {
    return {
      targetRole: body.targetRole, objective: body.objective, currentSkillLevel: body.currentSkillLevel, weeklyStudyHours: body.weeklyStudyHours, preferredSchedule: body.preferredSchedule ?? "flexible", preferredFormat: body.preferredFormat ?? "mixed",
      targetCompletionDate: body.targetCompletionDate ?? null, sourceResumeId: body.resumeId ?? null, sourceJobDescriptionId: body.jobDescriptionId ?? null, sourceAnalysisId: body.analysisId ?? null,
      sourceInterviewSessionIds: sources.some((s) => s.type === "mock_interviews") ? (body.interviewSessionIds?.length ? body.interviewSessionIds : ["all"]) : null, provider, model, version, previousVersionId, changeSummary,
    };
  }

  function view(roadmap) {
    const statuses = milestoneStatuses(roadmap);
    const progress = roadmapProgress(roadmap);
    return {
      id: roadmap.id, title: roadmap.title, targetRole: roadmap.targetRole, objective: roadmap.objective, currentSkillLevel: roadmap.currentSkillLevel, weeklyStudyHours: roadmap.weeklyStudyHours,
      preferredSchedule: roadmap.preferredSchedule, preferredFormat: roadmap.preferredFormat, targetCompletionDate: roadmap.targetCompletionDate, estimatedHours: roadmap.estimatedHours, estimatedWeeks: roadmap.estimatedWeeks,
      status: roadmap.status, version: roadmap.version, previousVersionId: roadmap.previousVersionId, changeSummary: roadmap.changeSummary, skillGapSummary: roadmap.skillGapSummary,
      sources: { resumeId: roadmap.sourceResumeId, jobDescriptionId: roadmap.sourceJobDescriptionId, analysisId: roadmap.sourceAnalysisId, interviewSessionIds: roadmap.sourceInterviewSessionIds },
      provider: roadmap.provider, model: roadmap.model, schemaVersion: ROADMAP_SCHEMA_VERSION, createdAt: roadmap.createdAt, updatedAt: roadmap.updatedAt,
      progress,
      milestones: (roadmap.milestones ?? []).map((m) => {
        const st = statuses.get(m.id);
        return {
          id: m.id, sequenceNumber: m.sequenceNumber, title: m.title, description: m.description, requiredSkills: m.requiredSkills, learningObjectives: m.learningObjectives, estimatedHours: m.estimatedHours,
          prerequisiteSequences: m.prerequisiteSequences, completionCriteria: m.completionCriteria, status: st?.status ?? m.status, unmetPrerequisites: st?.unmetPrerequisites ?? [], completedAt: m.completedAt, progress: st?.progress,
          tasks: (m.tasks ?? []).map((t) => taskView(t, st?.status === "locked")),
        };
      }),
    };
  }

  function taskView(t, locked = false) {
    const attempted = Array.isArray(t.checkpointAttempts) && t.checkpointAttempts.length > 0;
    return {
      id: t.id, milestoneId: t.milestoneId, sequenceNumber: t.sequenceNumber, title: t.title, description: t.description, skillName: t.skillName, taskType: t.taskType, difficulty: t.difficulty, estimatedMinutes: t.estimatedMinutes,
      isRequired: t.isRequired, scheduledDate: t.scheduledDate, completionCriteria: t.completionCriteria, status: t.status, locked, notes: t.notes, actualStudyMinutes: t.actualStudyMinutes, startedAt: t.startedAt, completedAt: t.completedAt,
      checkpoint: publicCheckpoint(t.checkpoint, { reveal: attempted || t.status === "completed" }), checkpointAttempts: t.checkpointAttempts ?? [], resources: t.resources ?? [], updatedAt: t.updatedAt,
    };
  }

  // ── Roadmaps ─────────────────────────────────────────────────────────────
  return {
    async create(req, res, next) {
      try {
        const body = req.body;
        const { roadmap, gaps, inputs, provider, model } = await buildPlan(req.user.id, body);
        const created = await repo.createRoadmap(req.user.id, metaFromBody(body, { provider, model, sources: inputs.sources }), roadmap);
        await repo.supersedeActive(req.user.id, created.id);
        await repo.replaceSkillGaps(req.user.id, created.id, gaps.skills);
        logger.info("roadmap created", { roadmapId: created.id, milestones: roadmap.milestones.length, provider, model });
        res.status(201).json({ roadmap: view(created), sources: inputs.sources, skillGaps: gaps });
      } catch (err) { next(err); }
    },

    async list(req, res, next) {
      try {
        const { page, limit } = req.query;
        const { total, items } = await repo.listRoadmaps(req.user.id, req.query);
        res.json({ roadmaps: items.map((r) => ({ id: r.id, title: r.title, targetRole: r.targetRole, objective: r.objective, currentSkillLevel: r.currentSkillLevel, status: r.status, version: r.version, estimatedHours: r.estimatedHours, estimatedWeeks: r.estimatedWeeks, weeklyStudyHours: r.weeklyStudyHours, createdAt: r.createdAt, updatedAt: r.updatedAt, progress: roadmapProgress(r) })), ...pageMeta(page, limit, total) });
      } catch (err) { next(err); }
    },

    async getOne(req, res, next) {
      try { res.json({ roadmap: view(await repo.findRoadmap(req.params.id, req.user.id)) }); } catch (err) { next(err); }
    },

    async update(req, res, next) {
      try {
        const data = { ...req.body };
        if (data.status === "active") await repo.supersedeActive(req.user.id, req.params.id);
        res.json({ roadmap: view(await repo.updateRoadmap(req.params.id, req.user.id, data)) });
      } catch (err) { next(err); }
    },

    async remove(req, res, next) {
      try { await repo.deleteRoadmap(req.params.id, req.user.id); res.status(204).end(); } catch (err) { next(err); }
    },

    /** POST /:id/regenerate — preview (apply=false) or create a new version carrying completed work. */
    async regenerate(req, res, next) {
      try {
        const old = await repo.findRoadmap(req.params.id, req.user.id);
        const body = {
          targetRole: req.body.targetRole ?? old.targetRole, currentSkillLevel: req.body.currentSkillLevel ?? old.currentSkillLevel, objective: req.body.objective ?? old.objective, weeklyStudyHours: req.body.weeklyStudyHours ?? old.weeklyStudyHours,
          preferredSchedule: old.preferredSchedule, preferredFormat: req.body.preferredFormat ?? old.preferredFormat, targetCompletionDate: old.targetCompletionDate,
          resumeId: req.body.resumeId ?? old.sourceResumeId ?? undefined, jobDescriptionId: req.body.jobDescriptionId ?? old.sourceJobDescriptionId ?? undefined, analysisId: req.body.analysisId ?? undefined,
          interviewSessionIds: [], useInterviewHistory: true, goalSkills: req.body.goalSkills ?? [], confirmedSkills: req.body.confirmedSkills ?? [],
        };
        const { roadmap, gaps, inputs, provider, model } = await buildPlan(req.user.id, body);
        const merged = mergeProgress(old, roadmap);
        const changeSummary = { ...merged.changes, reason: req.body.reason ?? null, previousVersion: old.version, generatedAt: new Date().toISOString() };
        if (!req.body.apply) {
          return res.json({ preview: true, changes: changeSummary, roadmap: { title: merged.roadmap.title, summary: merged.roadmap.summary, estimatedHours: merged.roadmap.estimatedHours, estimatedWeeks: merged.roadmap.estimatedWeeks, milestones: merged.roadmap.milestones.map((m) => ({ sequenceNumber: m.sequenceNumber, title: m.title, requiredSkills: m.requiredSkills, estimatedHours: m.estimatedHours, tasks: m.tasks.map((t) => ({ title: t.title, skillName: t.skillName, taskType: t.taskType, estimatedMinutes: t.estimatedMinutes, status: t.status ?? "not_started" })) })) }, skillGaps: gaps, sources: inputs.sources });
        }
        const created = await repo.createRoadmap(req.user.id, metaFromBody(body, { provider, model, sources: inputs.sources, version: old.version + 1, previousVersionId: old.id, changeSummary }), merged.roadmap);
        await repo.supersedeActive(req.user.id, created.id);
        await repo.replaceSkillGaps(req.user.id, created.id, gaps.skills);
        res.status(201).json({ roadmap: view(created), changes: changeSummary, sources: inputs.sources });
      } catch (err) { next(err); }
    },

    async progress(req, res, next) {
      try {
        const roadmap = await repo.findRoadmap(req.params.id, req.user.id);
        const gaps = await repo.listSkillGaps(req.user.id);
        const prio = new Map(gaps.map((g) => [g.skillName.toLowerCase(), g.priorityScore]));
        res.json({ progress: roadmapProgress(roadmap), weeklyPlan: buildWeeklyPlan(roadmap), nextAction: nextAction(roadmap, { skillPriority: prio, availableMinutes: req.query.availableMinutes ?? null }) });
      } catch (err) { next(err); }
    },

    // ── Tasks ─────────────────────────────────────────────────────────────
    async listTasks(req, res, next) {
      try {
        const roadmap = await repo.findRoadmap(req.params.id, req.user.id);
        const statuses = milestoneStatuses(roadmap);
        const tasks = await repo.listTasks(req.params.id, req.user.id, req.query);
        res.json({ tasks: tasks.map((t) => ({ ...taskView(t, statuses.get(t.milestoneId)?.status === "locked"), milestone: t.milestone })) });
      } catch (err) { next(err); }
    },

    async updateTask(req, res, next) {
      try {
        const task = await repo.getTask(req.params.taskId, req.user.id);
        if (task.status === "completed" && req.body.status) throw new ApiError(409, "Reopen the task before changing its status.", { code: "TASK_COMPLETED" });
        const data = {};
        if (req.body.status) { data.status = req.body.status; if (req.body.status === "in_progress" && !task.startedAt) data.startedAt = new Date(); }
        if (req.body.notes !== undefined) data.notes = req.body.notes;
        if (req.body.scheduledDate !== undefined) data.scheduledDate = req.body.scheduledDate;
        if (req.body.actualStudyMinutes !== undefined) data.actualStudyMinutes = req.body.actualStudyMinutes;
        if (req.body.addStudyMinutes) data.actualStudyMinutes = (task.actualStudyMinutes ?? 0) + req.body.addStudyMinutes;
        res.json({ task: taskView(await repo.updateTask(task.id, req.user.id, data)) });
      } catch (err) { next(err); }
    },

    /** Complete a task. Checkpoint tasks require a passed attempt (MCQ) or explicit manual completion data. */
    async completeTask(req, res, next) {
      try {
        const task = await repo.getTask(req.params.taskId, req.user.id);
        const roadmap = await repo.findRoadmap(task.milestone.roadmap.id, req.user.id);
        const st = milestoneStatuses(roadmap).get(task.milestoneId);
        if (st?.status === "locked") throw new ApiError(409, "This milestone is locked until its prerequisites are completed.", { code: "MILESTONE_LOCKED", details: st.unmetPrerequisites });
        const data = { status: "completed", completedAt: new Date() };
        if (req.body.notes !== undefined) data.notes = req.body.notes;
        if (req.body.actualStudyMinutes !== undefined) data.actualStudyMinutes = req.body.actualStudyMinutes;
        if (task.checkpoint) {
          const cp = task.checkpoint;
          const attempts = Array.isArray(task.checkpointAttempts) ? task.checkpointAttempts : [];
          if (cp.type === "mcq") {
            if (!attempts.some((a) => a.passed)) throw new ApiError(409, `Pass the checkpoint quiz (${cp.passScore}% or more) before completing this task.`, { code: "CHECKPOINT_NOT_PASSED" });
          } else {
            const hasEvidence = req.body.checkpointNotes || req.body.projectLink || (req.body.checkedItems?.length ?? 0) > 0 || attempts.length > 0;
            if (!hasEvidence) throw new ApiError(409, "Add checkpoint notes, a project link or tick the checklist items to complete this checkpoint.", { code: "CHECKPOINT_EVIDENCE_REQUIRED" });
            if (!attempts.length) data.checkpointAttempts = [...attempts, { at: new Date().toISOString(), type: cp.type, manual: true, notes: req.body.checkpointNotes ?? null, projectLink: req.body.projectLink ?? null, checkedItems: req.body.checkedItems ?? [], passed: true, verified: false }];
          }
        }
        const updated = await repo.updateTask(task.id, req.user.id, data);
        const fresh = await repo.findRoadmap(roadmap.id, req.user.id);
        res.json({ task: taskView(updated), progress: roadmapProgress(fresh), milestoneStatus: milestoneStatuses(fresh).get(task.milestoneId) });
      } catch (err) { next(err); }
    },

    async reopenTask(req, res, next) {
      try {
        const task = await repo.getTask(req.params.taskId, req.user.id);
        if (task.status !== "completed" && task.status !== "skipped") throw new ApiError(409, "Only completed or skipped tasks can be reopened.", { code: "TASK_NOT_COMPLETED" });
        const updated = await repo.updateTask(task.id, req.user.id, { status: "in_progress", completedAt: null });
        const fresh = await repo.findRoadmap(task.milestone.roadmap.id, req.user.id);
        res.json({ task: taskView(updated), progress: roadmapProgress(fresh) });
      } catch (err) { next(err); }
    },

    async taskResources(req, res, next) {
      try {
        const task = await repo.getTask(req.params.taskId, req.user.id);
        const stored = task.resources ?? [];
        res.json({ resources: stored.length ? stored : resourcesForTask(task).map((r) => ({ ...r, id: null, taskId: task.id })) });
      } catch (err) { next(err); }
    },

    /** POST /tasks/:taskId/checkpoints/:checkpointId/submit */
    async submitCheckpoint(req, res, next) {
      try {
        const task = await repo.getTask(req.params.taskId, req.user.id);
        const cp = task.checkpoint;
        if (!cp || (cp.id ?? "cp") !== req.params.checkpointId) throw notFoundCheckpoint();
        const lockState = milestoneStatuses(await repo.findRoadmap(task.milestone.roadmap.id, req.user.id)).get(task.milestoneId);
        if (lockState?.status === "locked") throw new ApiError(409, "This milestone is locked until its prerequisites are completed.", { code: "MILESTONE_LOCKED", details: lockState.unmetPrerequisites });
        const attempts = Array.isArray(task.checkpointAttempts) ? task.checkpointAttempts : [];
        let attempt;
        if (cp.type === "mcq") {
          if (!req.body.answers || Object.keys(req.body.answers).length === 0) throw badRequest("Provide answers for the quiz questions.");
          const graded = gradeMcq(cp, req.body.answers);
          attempt = { at: new Date().toISOString(), type: "mcq", score: graded.score, correct: graded.correct, total: graded.total, passed: graded.passed, answers: req.body.answers, verified: true };
          const data = { checkpointAttempts: [...attempts, attempt] };
          if (graded.passed && task.status !== "completed") Object.assign(data, { status: "completed", completedAt: new Date() });
          const updated = await repo.updateTask(task.id, req.user.id, data);
          const fresh = await repo.findRoadmap(task.milestone.roadmap.id, req.user.id);
          return res.json({ attempt, results: graded.results, passed: graded.passed, score: graded.score, task: taskView(updated), progress: roadmapProgress(fresh) });
        }
        const hasEvidence = req.body.notes || req.body.projectLink || (req.body.checkedItems?.length ?? 0) > 0;
        if (!hasEvidence) throw badRequest("Add notes, a project link or tick checklist items for this checkpoint.");
        attempt = { at: new Date().toISOString(), type: cp.type, manual: true, notes: req.body.notes ?? null, projectLink: req.body.projectLink ?? null, checkedItems: req.body.checkedItems ?? [], passed: true, verified: false };
        const updated = await repo.updateTask(task.id, req.user.id, { checkpointAttempts: [...attempts, attempt], status: "completed", completedAt: new Date() });
        const fresh = await repo.findRoadmap(task.milestone.roadmap.id, req.user.id);
        res.json({ attempt, passed: true, verified: false, note: "Manual checkpoint recorded. It was not automatically verified or executed.", task: taskView(updated), progress: roadmapProgress(fresh) });
      } catch (err) { next(err); }
    },

    // ── Skill gaps ─────────────────────────────────────────────────────────
    async skillGaps(req, res, next) {
      try {
        const rows = await repo.listSkillGaps(req.user.id);
        const active = await repo.activeRoadmap(req.user.id);
        const inProgress = new Set(active ? (active.milestones ?? []).flatMap((m) => m.tasks ?? []).filter((t) => t.status === "in_progress" || t.status === "paused").map((t) => t.skillName.toLowerCase()) : []);
        res.json({ skillGaps: rows.map((g) => ({ ...g, proficiencyStatus: !g.userConfirmed && inProgress.has(g.skillName.toLowerCase()) && g.proficiencyStatus !== "demonstrated" ? "learning_in_progress" : g.proficiencyStatus })), summary: summarise(rows), method: "skill-gap-1.0" });
      } catch (err) { next(err); }
    },

    async updateSkillGap(req, res, next) {
      try {
        const data = { ...req.body, lastAssessedAt: new Date() };
        if (req.body.proficiencyStatus !== undefined) data.userConfirmed = req.body.userConfirmed ?? true;
        res.json({ skillGap: await repo.updateSkillGap(req.params.id, req.user.id, data) });
      } catch (err) { next(err); }
    },

    // ── Recommendations ────────────────────────────────────────────────────
    async recommendations(req, res, next) {
      try {
        const [roadmap, gaps, dismissed, iv] = await Promise.all([repo.activeRoadmap(req.user.id), repo.listSkillGaps(req.user.id), repo.dismissedKeys(req.user.id), interviewRepo.loadEvaluatedAnswersForUser(req.user.id)]);
        const ivRecs = interviewRecommendations(toEvidence(iv.answers), { sessionCount: iv.sessionCount });
        const recs = buildLearningRecommendations({ roadmap, skillGaps: gaps, interview: { weakTopics: ivRecs.weakTopics.map((t) => t.topic), recurringGaps: ivRecs.recurringGaps.map((g) => g.concept) }, dismissedKeys: dismissed, preferences: { weeklyStudyHours: roadmap?.weeklyStudyHours } });
        const prio = new Map(gaps.map((g) => [g.skillName.toLowerCase(), g.priorityScore]));
        res.json({ recommendations: recs, nextAction: roadmap ? nextAction(roadmap, { skillPriority: prio, availableMinutes: req.query.availableMinutes ?? null }) : null, roadmapId: roadmap?.id ?? null });
      } catch (err) { next(err); }
    },

    async dismissRecommendation(req, res, next) {
      try { await repo.dismiss(req.user.id, req.params.id); res.status(204).end(); } catch (err) { next(err); }
    },
  };
}

function notFoundCheckpoint() { return new ApiError(404, "Checkpoint not found on this task.", { code: "NOT_FOUND" }); }

function summarise(rows) {
  const count = (s) => rows.filter((g) => g.proficiencyStatus === s).length;
  return { total: rows.length, demonstrated: count("demonstrated"), needsImprovement: count("needs_improvement"), notDemonstrated: count("not_demonstrated"), notAssessed: count("not_assessed"), learningInProgress: count("learning_in_progress"), highPriority: rows.filter((g) => g.priority === "high").length };
}
