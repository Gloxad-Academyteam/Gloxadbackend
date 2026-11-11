import mongoose from "mongoose";
import { Enrollment } from "../models/Enrollment.model.js";
import {
  getCourseModulesLockState,
  checkModuleAccess,
  checkTaskSubmissionAllowed,
  calculateCourseProgress
} from "../utils/moduleGate.js";

/**
 * Validates whether a string is a valid HTTP/HTTPS URL
 */
const isValidHttpUrl = (string) => {
  try {
    const url = new URL(string);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_) {
    return false;
  }
};

/**
 * Counts words separated by whitespace
 */
const countWords = (text) => {
  if (!text || typeof text !== "string") return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
};

/**
 * GET /api/learning/:courseId/modules
 * Returns module progression, completion criteria, and lock states
 */
export const getModuleLockStates = async (req, res, next) => {
  try {
    const course = req.course;
    const enrollment = req.enrollment;

    const moduleStates = getCourseModulesLockState(course, enrollment);

    return res.status(200).json({
      courseId: course._id,
      courseTitle: course.title,
      sequentialModules: Boolean(course.sequentialModules),
      modules: moduleStates
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/learning/:courseId/modules/:moduleId/task
 * Retrieves written reflection task prompt and student's submission history
 */
export const getModuleTask = async (req, res, next) => {
  try {
    const course = req.course;
    const enrollment = req.enrollment;
    const { moduleId } = req.params;

    const targetModule = course.modules?.find(
      (m) => String(m._id) === String(moduleId)
    );

    if (!targetModule) {
      return res.status(404).json({ error: "Module not found in this course" });
    }

    const task = targetModule.task || {
      prompt: `Reflect on your key takeaways from ${targetModule.title}.`,
      minWords: 50,
      submissionLinkAllowed: true
    };

    // Check lock state
    const access = checkModuleAccess(course, enrollment, moduleId);

    // Find all submissions for this module, sorted newest first
    const submissions = (enrollment.taskSubmissions || [])
      .filter((s) => String(s.moduleId) === String(moduleId))
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

    const currentSubmission = submissions.length > 0 ? submissions[0] : null;

    return res.status(200).json({
      courseId: course._id,
      moduleId: targetModule._id,
      moduleTitle: targetModule.title,
      isLocked: !access.allowed,
      task: {
        prompt: task.prompt,
        minWords: task.minWords || 50,
        submissionLinkAllowed: task.submissionLinkAllowed !== false
      },
      currentSubmission,
      submissionCount: submissions.length,
      history: submissions
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/learning/:courseId/modules/:moduleId/task
 * Submits or updates a written reflection task for a module
 * Enforces minimum word count, optional link validation, sequential gating, and idempotency
 */
export const submitModuleTask = async (req, res, next) => {
  try {
    const course = req.course;
    const enrollment = req.enrollment;
    const { moduleId } = req.params;
    const { text, link } = req.body;

    const targetModule = course.modules?.find(
      (m) => String(m._id) === String(moduleId)
    );

    if (!targetModule) {
      return res.status(404).json({ error: "Module not found in this course" });
    }

    const minWords = targetModule.task?.minWords || 50;

    // 1. Text presence and type validation
    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({
        error: `Submission text is required and must contain at least ${minWords} words`
      });
    }

    const trimmedText = text.trim();
    const wordCount = countWords(trimmedText);

    // 2. Minimum word count validation
    if (wordCount < minWords) {
      return res.status(400).json({
        error: `Written task submission must be at least ${minWords} words (currently ${wordCount} words)`
      });
    }

    // 3. Optional HTTPS link validation
    let trimmedLink = "";
    if (link !== undefined && link !== null && String(link).trim() !== "") {
      trimmedLink = String(link).trim();
      if (!isValidHttpUrl(trimmedLink)) {
        return res.status(400).json({
          error: "Provided submission link must be a valid HTTP or HTTPS URL"
        });
      }
    }

    // 4. Sequential gating validation
    const gateCheck = checkTaskSubmissionAllowed(course, enrollment, moduleId);
    if (!gateCheck.allowed) {
      return res.status(gateCheck.status || 409).json({
        error: gateCheck.error,
        code: gateCheck.code
      });
    }

    // 5. Idempotent check: duplicate send is not a new attempt
    const existingSubmissions = (enrollment.taskSubmissions || []).filter(
      (s) => String(s.moduleId) === String(moduleId)
    );

    if (existingSubmissions.length > 0) {
      const latest = existingSubmissions[existingSubmissions.length - 1];
      if (latest.text === trimmedText && (latest.link || "") === trimmedLink) {
        return res.status(200).json({
          message: "Task submission already received",
          submission: latest,
          progressPercentage: enrollment.progressPercentage,
          isCompleted: enrollment.isCompleted
        });
      }
    }

    // 6. Record new submission (every distinct submission kept, latest counts)
    const newSubmission = {
      moduleId: targetModule._id,
      text: trimmedText,
      link: trimmedLink,
      wordCount,
      submittedAt: new Date()
    };

    if (!Array.isArray(enrollment.taskSubmissions)) {
      enrollment.taskSubmissions = [];
    }
    enrollment.taskSubmissions.push(newSubmission);

    // 7. Recalculate progress percentage
    const progress = calculateCourseProgress(course, enrollment);
    enrollment.progressPercentage = progress;

    if (progress === 100) {
      enrollment.isCompleted = true;
      if (!enrollment.completedAt) {
        enrollment.completedAt = new Date();
      }
    }

    await enrollment.save();

    // 8. Check if next module is unlocked
    const updatedStates = getCourseModulesLockState(course, enrollment);
    const currentIndex = updatedStates.findIndex(
      (m) => String(m._id) === String(moduleId)
    );
    const nextModule = currentIndex >= 0 && currentIndex + 1 < updatedStates.length
      ? updatedStates[currentIndex + 1]
      : null;

    return res.status(200).json({
      message: "Written task submitted successfully",
      submission: newSubmission,
      nextModuleUnlocked: nextModule ? !nextModule.isLocked : false,
      progressPercentage: enrollment.progressPercentage,
      isCompleted: enrollment.isCompleted
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getModuleLockStates,
  getModuleTask,
  submitModuleTask
};
