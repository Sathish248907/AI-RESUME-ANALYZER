import { extractResumeText } from "../services/resume/resumeParserService.js";

export const resumeController = {
  /** POST /api/resume/parse — multipart/form-data with a `resume` file field. */
  async parse(req, res, next) {
    try {
      const { text, charCount, mimeType } = await extractResumeText(req.file);
      res.json({ text, charCount, mimeType, fileName: req.file.originalname, fileSize: req.file.size });
    } catch (err) {
      next(err);
    }
  },
};
