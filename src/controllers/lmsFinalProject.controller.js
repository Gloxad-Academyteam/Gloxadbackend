import { LmsFinalProject, FINAL_PROJECT_STAGES } from "../models/LmsFinalProject.model.js";
import { Cohort } from "../models/Cohort.model.js";
import { User } from "../models/User.model.js";

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
  })
      .populate("auditTrail.actor", "firstName lastName avatarUrl")
  .populate("tutorRecommendation.recommendedBy", "firstName lastName avatarUrl")
  .populate("adminSignOff.approvedBy", "firstName lastName avatarUrl");

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
      stageSubmissions: [
        {
          stage: 1,
          stageKey: "topic_submission",
          deliverables: { title: title.trim(), description: (description || "").trim() },
          status: "submitted",
          submittedAt: new Date(),
        },
      ],
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
 * POST /api/lms/cohorts/:cohortId/final-project/stages/:stageNumber/submit
 * Submits deliverables for a specific stage with state-machine invariant validation
 */
  export const submitStageDeliverable = async (req, res, next) => {
    try {
      const cohort = req.cohort;
      const userId = req.user._id;
      const stageNum = Number(req.params.stageNumber);
      const { deliverables, notes, repositoryUrl, liveDemoUrl } = req.body;

      if (isNaN(stageNum) || stageNum < 1 || stageNum > 8) {
        return res.status(400).json({ error: "Invalid stageNumber. Must be between 1 and 8" });
      }

      const project = await LmsFinalProject.findOne({
        cohortId: cohort._id,
        studentId: userId,
      });

      if (!project) {
        return res.status(404).json({ error: "Final project not found. Initialize topic first" });
      }

      // Invariant: cannot skip stages
      if (stageNum > project.currentStage) {
        return res.status(403).json({
          error: `Cannot submit Stage ${stageNum} while currently on Stage ${project.currentStage}`,
          code: "STAGE_LOCKED",
        });
      }

      // Invariant: cannot resubmit if stage is already officially approved and finished
      if (project.isApproved) {
        return res.status(409).json({
          error: "Final project is already officially approved and closed",
          code: "PROJECT_ALREADY_APPROVED",
        });
      }

      if (repositoryUrl) project.repositoryUrl = repositoryUrl.trim();
      if (liveDemoUrl) project.liveDemoUrl = liveDemoUrl.trim();
      if (deliverables) {
        project.deliverables = {
          ...project.deliverables,
          ...deliverables,
        };
      }

      const stageConfig = FINAL_PROJECT_STAGES.find((s) => s.stage === stageNum) || {
        stage: stageNum,
        key: `stage_${stageNum}`,
      };

      project.currentStage = stageNum;
      project.stageKey = stageConfig.key;
      project.stageStatus = "under_review";

      // Record submission history for this stage
      project.stageSubmissions.push({
        stage: stageNum,
        stageKey: stageConfig.key,
        deliverables: deliverables || {},
        status: "submitted",
        submittedAt: new Date(),
      });

      project.auditTrail.push({
        stage: stageNum,
        stageKey: stageConfig.key,
        status: "under_review",
        action: `Stage ${stageNum} (${stageConfig.label || stageConfig.key}) submitted by student`,
        actor: userId,
        actorRole: req.user.role,
        notes: notes || "",
        timestamp: new Date(),
      });

      await project.save();

      return res.status(200).json({
        message: `Stage ${stageNum} deliverables submitted successfully for review`,
        project,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * PUT /api/lms/final-projects/:projectId/stages/:stageNumber/review
   * Instructor/Admin stage audit: approves or requests revision
   */
  export const reviewFinalProjectStage = async (req, res, next) => {
    try {
      const { projectId, stageNumber } = req.params;
      const stageNum = Number(stageNumber);
      const { decision, notes, score } = req.body;

        if (!decision || !["approved", "revisions_required"].includes(decision)) {
          return res.status(400).json({
            error: "decision must be either 'approved' or 'revisions_required'",
          });
        }

        const project = await LmsFinalProject.findById(projectId);
        if (!project) {
          return res.status(404).json({ error: "Final project not found" });
        }

        const stageConfig = FINAL_PROJECT_STAGES.find((s) => s.stage === stageNum) || {
          stage: stageNum,
          key: `stage_${stageNum}`,
        };

        if (decision === "approved") {
            if (stageNum < 8) {
              // Advance to next stage
              project.currentStage = stageNum + 1;
              const nextStageConfig = FINAL_PROJECT_STAGES.find((s) => s.stage === project.currentStage);
              project.stageKey = nextStageConfig ? nextStageConfig.key : "final_evaluation";
              project.stageStatus = "pending_submission";
            } else {
              // Stage 8: Tutor recommends mark and forwards to Administrator
              if (req.user.role === "instructor") {
                project.stageStatus = "pending_admin_approval";
                project.tutorRecommendation = {
                  score: typeof score === "number" ? score : 85,
                  notes: notes || "Tutor recommended pass",
                  recommendedBy: req.user._id,
                  recommendedAt: new Date(),
                };
              } else if (req.user.role === "admin") {
                // Direct admin approval
                project.stageStatus = "approved";
                project.isApproved = true;
                project.completedAt = new Date();
                project.score = typeof score === "number" ? score : 85;
                project.adminSignOff = {
                  isApproved: true,
                  approvedBy: req.user._id,
                  approvedAt: new Date(),
                  notes: notes || "Direct administrator approval",
                };
              }
            }
          } else if (decision === "revisions_required") {
            project.stageStatus = "revisions_required";
          }

          project.auditTrail.push({
            stage: stageNum,
            stageKey: stageConfig.key,
            status: project.stageStatus,
            action: `Stage ${stageNum} reviewed by staff: ${decision}`,
            actor: req.user._id,
            actorRole: req.user.role,
            notes: notes || "",
            timestamp: new Date(),
          });

          await project.save();

          return res.status(200).json({
            message: `Stage ${stageNum} review recorded successfully: ${decision}`,
            project,
          });
        } catch (error) {
          next(error);
        }
      };

      /**
       * PUT /api/lms/final-projects/:projectId/admin-approve
       * Admin official final sign-off: converts tutor recommendation into official grade
       */
      export const adminSignOffFinalProject = async (req, res, next) => {
        try {
          const { projectId } = req.params;
          const { decision = "approved", notes = "", score } = req.body;

          const project = await LmsFinalProject.findById(projectId);
          if (!project) {
            return res.status(404).json({ error: "Final project not found" });
          }

          if (decision === "approved") {
            project.isApproved = true;
            project.stageStatus = "approved";
            project.score = typeof score === "number" ? score : (project.tutorRecommendation?.score || 85);
            project.completedAt = new Date();
            project.adminSignOff = {
              isApproved: true,
              approvedBy: req.user._id,
              approvedAt: new Date(),
              notes: notes || "Official administrator final evaluation sign-off",
            };

            project.auditTrail.push({
              stage: 8,
              stageKey: "final_evaluation",
              status: "approved",
              action: "Administrator official final sign-off granted",
              actor: req.user._id,
              actorRole: "admin",
              notes: notes || `Official mark confirmed: ${project.score}`,
              timestamp: new Date(),
            });
          } else if (decision === "returned") {
            project.stageStatus = "revisions_required";
            project.auditTrail.push({
              stage: 8,
              stageKey: "final_evaluation",
              status: "revisions_required",
              action: "Administrator returned final project for additional revisions",
              actor: req.user._id,
              actorRole: "admin",
              notes: notes || "Returned by administrator",
              timestamp: new Date(),
            });
          }

          await project.save();

          return res.status(200).json({
            message: `Final project administrator sign-off status: ${decision}`,
            project,
          });
        } catch (error) {
          next(error);
        }
      };

      /**
       * GET /api/lms/instructor/cohorts/:cohortId/final-projects
       * Instructor/Admin roster of student final projects with filters
       */
      export const getInstructorFinalProjects = async (req, res, next) => {
        try {
          const cohort = req.cohort;
          const { stage, status } = req.query;

          const query = { cohortId: cohort._id };
          if (stage) query.currentStage = Number(stage);
          if (status) query.stageStatus = status;

          const projects = await LmsFinalProject.find(query)
            .populate("studentId", "firstName lastName email avatarUrl")
            .populate("tutorRecommendation.recommendedBy", "firstName lastName")
            .populate("adminSignOff.approvedBy", "firstName lastName")
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

      export const advanceFinalProjectStage = submitStageDeliverable;

      export default {
        getStudentFinalProject,
        createFinalProject,
        submitStageDeliverable,
        advanceFinalProjectStage,
        reviewFinalProjectStage,
        adminSignOffFinalProject,
        getInstructorFinalProjects,
      };
