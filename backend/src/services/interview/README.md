# services/interview

Interview-question generation currently happens inside the resume analysis call
(`services/resume/resumeAnalysisService.js` → `interviewQuestions`), because the
questions depend on the same resume/job evidence. Put standalone interview features
(MCQs, coding challenges, mock-interview evaluation) in this folder when they are built.
