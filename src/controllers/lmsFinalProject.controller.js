import { LmsFinalProject, FINAL_PROJECT_STAGES } from "../models/LmsFinalProject.model.js";
import { Cohort } from "../models/Cohort.model.js";
import { User } from "../models/User.model.js";
import { LmsCertificate } from "../models/LmsCertificate.model.js";
import { generateAndUploadCertificatePdf } from "../utils/certificate.js";

/**
 * GET /api/lms/cohorts/:cohortId/final-project
 * Retrieves student's project status, current stage (1-8), deliverables, and full audit trail
 */
export const getStudentFinalProject = async (req, res, next) => {
  try {
    const cohort = req.cohort;
    const userId = req.user._id;

    let project = await LmsFinalProject.findOne({
      cohortId: cohort._id,
      studentId: userId,
    }).populate("auditTrail.actor", "firstName lastName avatarUrl");

    if (!project) {
      return res.status(200).json({
        hasProject: false,
        stages: FINAL_PROJECT_STAGES,
        currentStage: 1,
        stageKey: "topic_submission",
        stageStatus: "pending_submission",
      });
    }

    return res.status(200).json({
      hasProject: true,
      project,
      stages: FINAL_PROJECT_STAGES,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/lms/cohorts/:cohortId/final-project
 * Initializes student final project (Stage 1: topic submission)
 */
export const createFinalProject = async (req, res, next) => {
  try {
    const cohort = req.cohort;
    const userId = req.user._id;
    const { title, description, repositoryUrl, liveDemoUrl } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Project title is required" });
    }

    let existing = await LmsFinalProject.findOne({
      cohortId: cohort._id,
      studentId: userId,
    });

    if (existing) {
      return res.status(409).json({ error: "Final project already initialized for this cohort" });
    }

    const project = await LmsFinalProject.create({
      cohortId: cohort._id,
      studentId: userId,
      title: title.trim(),
      description: (description || "").trim(),
      repositoryUrl: (repositoryUrl || "").trim(),
      liveDemoUrl: (liveDemoUrl || "").trim(),
      currentStage: 1,
      stageKey: "topic_submission",
      stageStatus: "submitted",
      auditTrail: [
        {
          stage: 1,
          stageKey: "topic_submission",
          status: "submitted",
          action: "Topic and scope submitted by student",
          actor: userId,
          actorRole: req.user.role,
          notes: description || "Initial topic submission",
          timestamp: new Date(),
        },
      ],
    });

    return res.status(201).json({
      message: "Final project initialized successfully",
      project,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/lms/cohorts/:cohortId/final-project/stage
 * Advances deliverables for current stage (student submission)
 */
export const advanceFinalProjectStage = async (req, res, next) => {
  try {
    const cohort = req.cohort;
    const userId = req.user._id;
    const { deliverables, notes, repositoryUrl, liveDemoUrl } = req.body;

    const project = await LmsFinalProject.findOne({
      cohortId: cohort._id,
      studentId: userId,
    });

    if (!project) {
      return res.status(404).json({ error: "Final project not found. Create project first." });
    }

    if (repositoryUrl) project.repositoryUrl = repositoryUrl.trim();
    if (liveDemoUrl) project.liveDemoUrl = liveDemoUrl.trim();
    if (deliverables) {
      project.deliverables = {
        ...project.deliverables,
        ...deliverables,
      };
    }

    project.stageStatus = "under_review";
    project.auditTrail.push({
      stage: project.currentStage,
      stageKey: project.stageKey,
      status: "under_review",
      action: `Stage ${project.currentStage} deliverables submitted by student`,
      actor: userId,
      actorRole: req.user.role,
      notes: notes || "",
      timestamp: new Date(),
    });

    await project.save();

    return res.status(200).json({
      message: `Stage ${project.currentStage} (${project.stageKey}) submitted for review`,
      project,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/lms/cohorts/:cohortId/final-project/review
 * Instructor/Admin audits and transitions the project stage (approves, requests revision, or grades)
 */
export const reviewFinalProjectStage = async (req, res, next) => {
  try {
    const cohort = req.cohort;
    const { studentId, decision, notes, score } = req.body;

    if (!studentId || !decision) {
      return res.status(400).json({ error: "studentId and decision ('approved' | 'revisions_required') are required" });
    }

    const project = await LmsFinalProject.findOne({
      cohortId: cohort._id,
      studentId,
    });

    if (!project) {
      return res.status(404).json({ error: "Student final project not found" });
    }

    if (decision === "approved") {
      if (project.currentStage < 8) {
        project.currentStage += 1;
        const nextStageConfig = FINAL_PROJECT_STAGES.find((s) => s.stage === project.currentStage);
        project.stageKey = nextStageConfig ? nextStageConfig.key : "final_evaluation";
        project.stageStatus = "pending_submission";
      } else {
        // Stage 8 Final Evaluation approved
        project.stageStatus = "approved";
        project.isApproved = true;
        project.completedAt = new Date();
        if (typeof score === "number") project.score = score;
      }
    } else if (decision === "revisions_required") {
      project.stageStatus = "revisions_required";
    }

    project.auditTrail.push({
      stage: project.currentStage,
      stageKey: project.stageKey,
      status: project.stageStatus,
      action: `Stage reviewed by staff: ${decision}`,
      actor: req.user._id,
      actorRole: req.user.role,
      notes: notes || "",
      timestamp: new Date(),
    });

    await project.save();

    return res.status(200).json({
      message: `Project stage review recorded: ${decision}`,
      project,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/lms/instructor/cohorts/:cohortId/final-projects
 * Instructor/admin roster of all student final projects in the cohort
 */
export const getInstructorFinalProjects = async (req, res, next) => {
  try {
    const cohort = req.cohort;

    const projects = await LmsFinalProject.find({ cohortId: cohort._id })
      .populate("studentId", "firstName lastName email avatarUrl")
      .sort({ currentStage: -1, updatedAt: -1 })
      .lean();

    return res.status(200).json({
      cohortId: cohort._id,
      projects,
      total: projects.length,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getStudentFinalProject,
  createFinalProject,
  advanceFinalProjectStage,
  reviewFinalProjectStage,
  getInstructorFinalProjects,
};

