import { ApiError, badRequest } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { computeReadiness } from "../services/career/careerReadinessService.js";
import { buildCareerRecommendations } from "../services/career/careerRecommendationService.js";
import { prioritiseJobs } from "../services/career/jobPriorityService.js";
import { buildActionPlan, planProgress, weekBounds } from "../services/career/careerActionPlanService.js";
import { buildInterviewPrep } from "../services/career/interviewPrepService.js";
import { buildCareerDashboard } from "../services/career/careerDashboardService.js";
import { buildFacts, answerQuestion, titleFromMessage } from "../services/career/careerCoachService.js";

/**
 * @param {{ repo, getLlm: Function }} deps
 */
export function createCareerController({ repo, getLlm }) {
  const profileView = (p) => p && ({ id: p.id, careerLevel: p.careerLevel, targetRoles: p.targetRoles, industries: p.industries, skills: p.skills, locations: p.locations, workMode: p.workMode, salaryMin: p.salaryMin, salaryMax: p.salaryMax, salaryCurrency: p.salaryCurrency, goals: p.goals, learningInterests: p.learningInterests, createdAt: p.createdAt, updatedAt: p.updatedAt });

  async function resolveRole(userId, requested, snapshot) {
    if (requested) return requested;
    const snap = snapshot ?? (await repo.loadSnapshot(userId));
    const role = snap.profile?.targetRoles?.[0] ?? snap.roadmap?.targetRole ?? snap.resumes.find((r) => r.targetRole)?.targetRole ?? snap.analyses[0]?.targetRole;
    if (!role) throw badRequest("Set a target role in your career profile first (or pass targetRole).", [{ field: "targetRole", message: "No target role known yet." }]);
    return role;
  }

  /** Recompute recommendations from current records and persist them (keeps done/dismissed state). */
  async function refreshRecommendations(userId, snapshot, assessment) {
    const snap = snapshot ?? (await repo.loadSnapshot(userId));
    const latest = assessment ?? (await repo.latestAssessment(userId, snap.profile?.targetRoles?.[0]));
    const recs = buildCareerRecommendations(snap, latest);
    return repo.syncRecommendations(userId, latest?.id ?? null, recs);
  }

  return {
    // ── Profile ─────────────────────────────────────────────────────────────
    async getProfile(req, res, next) {
      try { res.json({ profile: profileView(await repo.getProfile(req.user.id)) }); } catch (err) { next(err); }
    },
    async putProfile(req, res, next) {
      try {
        const data = { ...req.body, salaryMin: req.body.salaryMin ?? null, salaryMax: req.body.salaryMax ?? null, salaryCurrency: req.body.salaryCurrency ?? null, goals: req.body.goals ?? null };
        const p = await repo.upsertProfile(req.user.id, data);
        await refreshRecommendations(req.user.id);
        res.json({ profile: profileView(p) });
      } catch (err) { next(err); }
    },

    // ── Assessments ─────────────────────────────────────────────────────────
    async createAssessment(req, res, next) {
      try {
        const snapshot = await repo.loadSnapshot(req.user.id);
        const targetRole = await resolveRole(req.user.id, req.body.targetRole, snapshot);
        const result = computeReadiness(snapshot, targetRole);
        const row = await repo.createAssessment(req.user.id, { targetRole, overallScore: result.overallScore ?? 0, readinessLabel: result.readinessLabel, components: result.components, skills: result.skills, strengths: result.strengths, improvements: result.improvements, missingEvidence: result.missingEvidence, nextActions: result.nextActions, sources: result.sources, method: result.method });
        const recommendations = await refreshRecommendations(req.user.id, snapshot, { ...row, overallScore: result.overallScore });
        logger.info("career assessment created", { assessmentId: row.id, targetRole, score: result.overallScore });
        res.status(201).json({ assessment: { ...result, id: row.id, createdAt: row.createdAt, overallScore: result.overallScore }, recommendations });
      } catch (err) { next(err); }
    },
    async listAssessments(req, res, next) {
      try { res.json({ assessments: await repo.listAssessments(req.user.id, req.query) }); } catch (err) { next(err); }
    },
    async getAssessment(req, res, next) {
      try {
        const a = await repo.findAssessment(req.params.assessmentId, req.user.id);
        res.json({ assessment: { ...a, overallScore: a.readinessLabel === "Insufficient evidence" ? null : a.overallScore, disclaimer: "Scores summarise the evidence in your records; they are not a prediction of interview or job outcomes." } });
      } catch (err) { next(err); }
    },

    // ── Recommendations ─────────────────────────────────────────────────────
    async recommendations(req, res, next) {
      try {
        if (req.query.refresh) await refreshRecommendations(req.user.id);
        let rows = await repo.listRecommendations(req.user.id, { status: req.query.status });
        if (!rows.length && !req.query.status && !req.query.refresh) rows = await refreshRecommendations(req.user.id);
        res.json({ recommendations: rows });
      } catch (err) { next(err); }
    },
    async updateRecommendation(req, res, next) {
      try {
        const data = { status: req.body.status, completedAt: req.body.status === "done" ? new Date() : null };
        res.json({ recommendation: await repo.updateRecommendation(req.params.id, req.user.id, data) });
      } catch (err) { next(err); }
    },

    // ── Dashboard, jobs, interview prep ─────────────────────────────────────
    async dashboard(req, res, next) {
      try {
        const snapshot = await repo.loadSnapshot(req.user.id);
        const role = req.query.targetRole ?? snapshot.profile?.targetRoles?.[0];
        const [latest, recommendations, plan] = await Promise.all([repo.latestAssessment(req.user.id, role), repo.listRecommendations(req.user.id), repo.currentPlan(req.user.id)]);
        res.json({ dashboard: buildCareerDashboard({ snapshot, latestAssessment: latest, recommendations, plan }), targetRole: role ?? null });
      } catch (err) { next(err); }
    },
    async jobPriorities(req, res, next) {
      try {
        const snapshot = await repo.loadSnapshot(req.user.id);
        const q = req.query;
        const weights = Object.fromEntries([["match", q.wMatch], ["skills", q.wSkills], ["relevance", q.wRelevance], ["preference", q.wPreference], ["urgency", q.wUrgency]].filter(([, v]) => v !== undefined));
        const out = prioritiseJobs(snapshot, { weights });
        res.json({ ...out, items: q.includeClosed ? out.items : out.items.filter((i) => !i.closed), closedCount: out.items.filter((i) => i.closed).length, hasProfile: Boolean(snapshot.profile) });
      } catch (err) { next(err); }
    },
    async interviewPrep(req, res, next) {
      try {
        const snapshot = await repo.loadSnapshot(req.user.id);
        const targetRole = await resolveRole(req.user.id, req.query.targetRole, snapshot);
        res.json({ prep: buildInterviewPrep(snapshot, targetRole) });
      } catch (err) { next(err); }
    },

    // ── Action plans ────────────────────────────────────────────────────────
    async generatePlan(req, res, next) {
      try {
        const userId = req.user.id;
        const snapshot = await repo.loadSnapshot(userId);
        const recommendations = await refreshRecommendations(userId, snapshot);
        const current = await repo.currentPlan(userId);
        const { start } = weekBounds(new Date());
        // Completed work from an existing plan for this week is preserved (not regenerated).
        const sameWeek = current && new Date(current.weekStart).getTime() === start.getTime();
        const existingDone = sameWeek ? current.tasks.filter((t) => t.status !== "pending") : [];
        const built = buildActionPlan({ snapshot, recommendations, existingDone, weeklyMinutes: req.body.weeklyMinutes });
        if (sameWeek) {
          // Replace only pending *generated* tasks; done / skipped tasks and the user's own tasks stay in place.
          for (const t of current.tasks.filter((x) => x.status === "pending" && x.sourceKey)) await repo.deleteTask(t.id, userId);
          for (const t of built.tasks) await repo.addTask(current.id, userId, t);
          const plan = await repo.currentPlan(userId);
          return res.json({ plan: { ...plan, progress: planProgress(plan) }, regenerated: true, summary: built.summary });
        }
        await repo.archivePlans(userId);
        const plan = await repo.createPlan(userId, { weekStart: built.weekStart, weekEnd: built.weekEnd, targetRole: snapshot.profile?.targetRoles?.[0] ?? null, summary: built.summary }, built.tasks);
        res.status(201).json({ plan: { ...plan, progress: planProgress(plan) }, regenerated: false, summary: built.summary });
      } catch (err) { next(err); }
    },
    async currentPlan(req, res, next) {
      try {
        const plan = await repo.currentPlan(req.user.id);
        if (!plan) return res.json({ plan: null, history: [] });
        const history = (await repo.listPlans(req.user.id, { limit: 6 })).filter((p) => p.id !== plan.id).map((p) => ({ id: p.id, weekStart: p.weekStart, weekEnd: p.weekEnd, status: p.status, progress: planProgress(p) }));
        res.json({ plan: { ...plan, progress: planProgress(plan) }, history });
      } catch (err) { next(err); }
    },
    async updateTask(req, res, next) {
      try {
        const data = {};
        if (req.body.status) { data.status = req.body.status; data.completedAt = req.body.status === "done" ? new Date() : null; }
        if (req.body.dueDate !== undefined) data.dueDate = req.body.dueDate;
        if (req.body.notes !== undefined) data.notes = req.body.notes;
        if (req.body.title !== undefined) data.title = req.body.title;
        if (req.body.estimatedMinutes !== undefined) data.estimatedMinutes = req.body.estimatedMinutes;
        const task = await repo.updateTask(req.params.taskId, req.user.id, data);
        if (task.sourceKey?.startsWith("rec:") && req.body.status === "done") {
          const key = task.sourceKey.slice(4);
          const rec = (await repo.listRecommendations(req.user.id, { status: "open" })).find((r) => r.key === key);
          if (rec) await repo.updateRecommendation(rec.id, req.user.id, { status: "done", completedAt: new Date() });
        }
        const plan = await repo.currentPlan(req.user.id);
        res.json({ task, progress: plan ? planProgress(plan) : null });
      } catch (err) { next(err); }
    },
    async addTask(req, res, next) {
      try {
        let plan = await repo.currentPlan(req.user.id);
        if (!plan) { const { start, end } = weekBounds(new Date()); plan = await repo.createPlan(req.user.id, { weekStart: start, weekEnd: end, summary: { totalMinutes: 0, requiredMinutes: 0, budgetMinutes: 360, byCategory: {}, sources: {} } }, []); }
        const task = await repo.addTask(plan.id, req.user.id, { ...req.body, dueDate: req.body.dueDate ?? null, sourceKey: null });
        res.status(201).json({ task });
      } catch (err) { next(err); }
    },
    async deleteTask(req, res, next) {
      try { await repo.deleteTask(req.params.taskId, req.user.id); res.status(204).end(); } catch (err) { next(err); }
    },

    // ── Coach ───────────────────────────────────────────────────────────────
    async createConversation(req, res, next) {
      try {
        const title = req.body.title ?? (req.body.message ? titleFromMessage(req.body.message) : "New conversation");
        const c = await repo.createConversation(req.user.id, title);
        if (!req.body.message) return res.status(201).json({ conversation: { ...c, messages: [] } });
        req.params.id = c.id;
        req.body = { content: req.body.message };
        return this.sendMessage(req, res, next, 201);
      } catch (err) { next(err); }
    },
    async listConversations(req, res, next) {
      try { const rows = await repo.listConversations(req.user.id); res.json({ conversations: rows.map((c) => ({ id: c.id, title: c.title, messageCount: c._count?.messages ?? 0, createdAt: c.createdAt, updatedAt: c.updatedAt })) }); } catch (err) { next(err); }
    },
    async getConversation(req, res, next) {
      try { res.json({ conversation: await repo.findConversation(req.params.id, req.user.id) }); } catch (err) { next(err); }
    },
    async sendMessage(req, res, next, statusCode = 200) {
      try {
        const userId = req.user.id;
        const conversation = await repo.findConversation(req.params.id, userId);
        const llm = getLlm();
        const snapshot = await repo.loadSnapshot(userId);
        const latest = await repo.latestAssessment(userId, snapshot.profile?.targetRoles?.[0]);
        const facts = buildFacts(snapshot, latest);
        const userMsg = await repo.addMessage(conversation.id, { role: "user", content: req.body.content });
        let answer;
        try {
          answer = await answerQuestion(llm, { facts, history: conversation.messages, message: req.body.content });
        } catch (err) {
          // Keep the user's message; surface the provider error.
          throw err instanceof ApiError ? err : new ApiError(502, "The coach could not answer right now. Please try again.", { code: "LLM_INVALID_OUTPUT", retryable: true });
        }
        const reply = await repo.addMessage(conversation.id, { role: "assistant", content: answer.reply, factsUsed: answer.factsUsed, suggestions: answer.suggestions, links: answer.links, clarifying: Boolean(answer.clarifyingQuestion), provider: answer.provider, model: answer.model });
        if (conversation.title === "New conversation" && conversation.messages.length === 0) await repo.renameConversation(conversation.id, userId, titleFromMessage(req.body.content));
        res.status(statusCode).json({ conversationId: conversation.id, userMessage: userMsg, reply: { ...reply, clarifyingQuestion: answer.clarifyingQuestion }, factsCount: facts.length });
      } catch (err) { next(err); }
    },
    async renameConversation(req, res, next) {
      try { await repo.renameConversation(req.params.id, req.user.id, req.body.title); res.json({ ok: true }); } catch (err) { next(err); }
    },
    async deleteConversation(req, res, next) {
      try { await repo.deleteConversation(req.params.id, req.user.id); res.status(204).end(); } catch (err) { next(err); }
    },
  };
}
