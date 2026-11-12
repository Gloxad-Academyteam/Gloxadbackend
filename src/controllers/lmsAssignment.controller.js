import { LmsAssignment } from "../models/LmsAssignment.model.js";
import { LmsSubmission } from "../models/LmsSubmission.model.js";
import { Course } from "../models/Course.model.js";
import { notifyUsers } from "../utils/notify.js";
import { Notification } from "../models/Notification.model.js";

/**
 * GET /api/lms/assignments
 * Lists cohort assignments with status filters and student's own submission state
 */
export const listAssignments = async (req, res, next) => {
  try {
    const cohort = req.cohort;
    const userId = req.user._id;
    const { status } = req.query; // all | upcoming | past

    let dateFilter = {};
    if (status === "upcoming") {
      dateFilter = { dueAt: { $gte: new Date() } };
    } else if (status === "past") {
      dateFilter = { dueAt: { $lt: new Date() } };
    }

    const assignments = await LmsAssignment.find({
      cohortId: cohort._id,
      ...dateFilter,
    }).sort({ dueAt: 1 });

    const assignmentIds = assignments.map((a) => a._id);
    const submissions = await LmsSubmission.find({
      assignmentId: { $in: assignmentIds },
      userId,
    });
    const subMap = new Map(
      submissions.map((s) => [String(s.assignmentId), s])
    );

    const result = assignments.map((a) => {
      const sub = subMap.get(String(a._id));
      return {
        _id: a._id,
        title: a.title,
        summary: a.summary,
        dueAt: a.dueAt,
        maxFileMB: a.maxFileMB,
        allowedTypes: a.allowedTypes,
        allowRepoLink: a.allowRepoLink,
        submissionStatus: sub ? sub.status : "not_started",
        isLate: sub ? sub.isLate : false,
        score: sub?.grade?.score ?? null,
        maxScore: sub?.grade?.max ?? 100,
      };
    });

    res.status(200).json({
      assignments: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/lms/assignments/:id
 * Full assignment detail, rubric breakdown, and student's own submission
 */
export const getAssignment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const assignment = await LmsAssignment.findById(id);
    if (!assignment) {
      return res.status(404).json({ error: "Assignment not found" });
    }

    const submission = await LmsSubmission.findOne({
      assignmentId: assignment._id,
      userId,
    });

    res.status(200).json({
      ...assignment.toObject(),
      submission: submission || null,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/lms/assignments/:id/submissions
 * Submits assignment via GitHub repo URL or S3 fileKey; permits pre-grading resubmission
 */
export const submitAssignment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const cohort = req.cohort;
    const userId = req.user._id;
    const { repoUrl, fileKey, comment } = req.body;

    // Validate GitHub Repo URL if provided
    if (repoUrl) {
      const githubRegex = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/;
      if (!githubRegex.test(repoUrl.trim())) {
        return res.status(400).json({
          error: "Invalid GitHub repository URL",
          code: "INVALID_REPO_URL",
        });
      }
    }

    const assignment = await LmsAssignment.findById(id);
    if (!assignment) {
      return res.status(404).json({ error: "Assignment not found" });
    }

    // Check existing submission lock (cannot resubmit once graded)
    const existingSub = await LmsSubmission.findOne({
      assignmentId: assignment._id,
      userId,
    });

    if (existingSub && existingSub.status === "graded") {
      return res.status(400).json({
        error: "Assignment has already been graded and cannot be resubmitted",
        code: "SUBMISSION_LOCKED",
      });
    }

    const isLate = Date.now() > new Date(assignment.dueAt).getTime();
    if (isLate && !assignment.allowLate) {
      return res.status(400).json({
        error: "Late submissions are not accepted for this assignment",
        code: "LATE_SUBMISSION_REJECTED",
      });
    }

    if (existingSub) {
      // Update existing submission before instructor grades
      if (repoUrl !== undefined) existingSub.repoUrl = repoUrl.trim();
      if (fileKey !== undefined) existingSub.fileKey = fileKey;
      if (comment !== undefined) existingSub.comment = comment;
      existingSub.submittedAt = new Date();
      existingSub.isLate = isLate;
      existingSub.status = "pending_review";
      await existingSub.save();

      return res.status(200).json({
        submission: existingSub,
        message: "Assignment resubmitted successfully",
      });
    }

    // Create new submission
    const newSubmission = await LmsSubmission.create({
      assignmentId: assignment._id,
      cohortId: cohort._id,
      userId,
      repoUrl: repoUrl ? repoUrl.trim() : "",
      fileKey: fileKey || "",
      comment: comment || "",
      submittedAt: new Date(),
      isLate,
      status: "pending_review",
    });

    await notifyUsers(cohort.instructorIds, { title: "Submission received", message: `A learner submitted "${assignment.title}".`, type: "submission_received", link: "/lms/instructor/grading-queue" });

    res.status(201).json({
      submission: newSubmission,
      message: "Assignment submitted successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/lms/instructor/grading-queue
 * Instructor queue of pending submissions with student details and overdue indicators
 */
export const getGradingQueue = async (req, res, next) => {
  try {
    const cohort = req.cohort;

    const pendingSubmissions = await LmsSubmission.find({
      cohortId: cohort._id,
      status: "pending_review",
    })
      .populate("userId", "firstName lastName name email avatar")
      .populate("assignmentId")
      .sort({ submittedAt: 1 });

    const course = await Course.findById(cohort.courseId);
    const moduleMap = new Map();
    course?.modules?.forEach((m) => moduleMap.set(String(m._id), m.title));

    const items = pendingSubmissions.map((sub) => {
      const assignment = sub.assignmentId;
      const modTitle = assignment?.moduleId
        ? moduleMap.get(String(assignment.moduleId)) || "Module 1"
        : "Module 1";
      const studentName =
        sub.userId?.name ||
        `${sub.userId?.firstName || ""} ${sub.userId?.lastName || ""}`.trim();

      return {
        submissionId: sub._id,
        module: modTitle,
        assignmentTitle: assignment?.title || "Project Assignment",
        student: {
          _id: sub.userId?._id,
          name: studentName,
          email: sub.userId?.email,
        },
        submittedAt: sub.submittedAt,
        isLate: sub.isLate,
        overdue: assignment?.dueAt ? new Date(assignment.dueAt) < new Date() : false,
        repoUrl: sub.repoUrl,
        fileKey: sub.fileKey,
        comment: sub.comment,
      };
    });

    res.status(200).json({
      pending: items.length,
      items,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/lms/submissions/:id/grade
 * Records score, rubric breakdown, feedback, and triggers student notification
 */
export const gradeSubmission = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { score, max, feedback, rubricScores } = req.body;

    const submission = await LmsSubmission.findById(id);
    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    const parsedScore = Number(score);
    const parsedMax = Number(max || 100);

    submission.status = "graded";
    submission.grade = {
      score: parsedScore,
      max: parsedMax,
      feedback: feedback || "",
      rubricScores: Array.isArray(rubricScores) ? rubricScores : [],
      gradedBy: req.user._id,
      gradedAt: new Date(),
    };

    await submission.save();

    // Trigger student notification
    try {
      await Notification.create({
        recipient: submission.userId,
        sender: req.user._id,
        type: "assignment_graded",
        title: "Assignment Graded",
        message: `Your assignment submission has been graded: ${parsedScore}/${parsedMax}`,
        referenceId: submission._id,
        isRead: false,
      });
    } catch {
      // Non-blocking notification
    }

    res.status(200).json({
      message: "Submission graded successfully",
      submission,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/lms/assignments/:id/revisions
 * Submits a new assignment revision, preserving previous work in revision history
 */
export const submitAssignmentRevision = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const { repoUrl, fileKey, comment } = req.body;

    const assignment = await LmsAssignment.findById(id);
    if (!assignment) {
      return res.status(404).json({ error: "Assignment not found" });
    }

    const submission = await LmsSubmission.findOne({
      assignmentId: assignment._id,
      userId,
    });

    if (!submission) {
      return res.status(404).json({ error: "No initial submission found. Submit assignment first." });
    }

    // Preserve prior submission in revisions array
    if (!submission.revisions) submission.revisions = [];
    submission.revisions.push({
      fileKey: submission.fileKey,
      repoUrl: submission.repoUrl,
      comment: submission.comment,
      submittedAt: submission.submittedAt,
      feedback: submission.grade?.feedback || "",
    });

    if (repoUrl !== undefined) submission.repoUrl = repoUrl.trim();
    if (fileKey !== undefined) submission.fileKey = fileKey;
    if (comment !== undefined) submission.comment = comment;
    submission.submittedAt = new Date();
    submission.status = "pending_review";

    await submission.save();

    return res.status(200).json({
      message: "Assignment revision submitted successfully",
      submission,
      revisionCount: submission.revisions.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/lms/assignments/:id/history
 * Returns student's submission history, revisions, grade, and feedback timeline
 */
export const getAssignmentSubmissionHistory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const submission = await LmsSubmission.findOne({
      assignmentId: id,
      userId,
    })
      .populate("grade.gradedBy", "firstName lastName avatarUrl")
      .lean();

    if (!submission) {
      return res.status(200).json({
        hasSubmission: false,
        history: [],
      });
    }

    return res.status(200).json({
      hasSubmission: true,
      current: {
        _id: submission._id,
        fileKey: submission.fileKey,
        repoUrl: submission.repoUrl,
        comment: submission.comment,
        status: submission.status,
        submittedAt: submission.submittedAt,
        grade: submission.grade,
      },
      revisions: submission.revisions || [],
    });
  } catch (error) {
    next(error);
  }
};
