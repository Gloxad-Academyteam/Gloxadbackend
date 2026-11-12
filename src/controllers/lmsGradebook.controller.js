import mongoose from "mongoose";
import { Cohort } from "../models/Cohort.model.js";
import { User } from "../models/User.model.js";
import { LmsLessonProgress } from "../models/LmsLessonProgress.model.js";
import { LmsQuizAttempt } from "../models/LmsQuizAttempt.model.js";
import { LmsAssignment } from "../models/LmsAssignment.model.js";
import { LmsSubmission } from "../models/LmsSubmission.model.js";
import { LmsLiveSession } from "../models/LmsLiveSession.model.js";
import { LmsAttendance } from "../models/LmsAttendance.model.js";
import { LmsFinalProject } from "../models/LmsFinalProject.model.js";
import { LmsLab, LmsLabSubmission } from "../models/LmsLab.model.js";
import { GradeAudit } from "../models/GradeAudit.model.js";

/**
 * Letter grade calculation helper
 */
const calculateLetterGrade = (score) => {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
};

/**
 * Calculates student academic summary across all 7 assessment categories
 */
export const calculateStudentAcademicMetrics = async (cohortId, studentId, cohortWeights) => {
  const weights = cohortWeights || {
    quizzes: 15,
    assignments: 15,
    practicals: 15,
    codingChallenges: 10,
    attendance: 10,
    weeklyTasks: 10,
    finalProject: 25,
    passingThreshold: 70,
  };

  // 1. Quizzes: Best completed score per quiz
  const quizAttempts = await LmsQuizAttempt.find({
    cohortId,
    userId: studentId,
    status: "completed",
  }).lean();

  const quizScoresMap = {};
  for (const attempt of quizAttempts) {
    const qId = attempt.quizId.toString();
    const pct = attempt.totalQuestions > 0 ? (attempt.score / attempt.totalQuestions) * 100 : 0;
    if (quizScoresMap[qId] === undefined || pct > quizScoresMap[qId]) {
      quizScoresMap[qId] = pct;
    }
  }
  const quizScores = Object.values(quizScoresMap);
  const quizAverage = quizScores.length > 0 ? quizScores.reduce((a, b) => a + b, 0) / quizScores.length : 0;

  // 2. Assignments: Graded submissions
  const assignments = await LmsAssignment.find({ cohortId }).select("_id maxScore dueAt").lean();
  const assignmentSubmissions = await LmsSubmission.find({
    cohortId,
    userId: studentId,
    "grade.score": { $ne: null },
  }).lean();

  let assignmentAverage = 0;
  if (assignmentSubmissions.length > 0) {
    const sum = assignmentSubmissions.reduce((acc, sub) => {
      const max = sub.grade?.max || 100;
      return acc + (sub.grade.score / max) * 100;
    }, 0);
    assignmentAverage = sum / assignmentSubmissions.length;
  }

  // 3. Coding Challenges & Labs: Verified lab submissions
  const labs = await LmsLab.find({ cohortId }).select("_id").lean();
  const labSubmissions = await LmsLabSubmission.find({
    cohortId,
    userId: studentId,
    status: "submitted",
  }).lean();

  let practicalsAverage = 0;
  let codingChallengesAverage = 0;
  if (labSubmissions.length > 0) {
    const totalScore = labSubmissions.reduce((acc, sub) => {
      const pct = sub.totalTests > 0 ? (sub.passedTests / sub.totalTests) * 100 : 0;
      return acc + pct;
    }, 0);
    practicalsAverage = totalScore / labSubmissions.length;
    codingChallengesAverage = practicalsAverage;
  }

  // 4. Live Attendance
  const totalSessions = await LmsLiveSession.countDocuments({
    cohortId,
    status: { $in: ["live", "ended"] },
  });
  const attendedSessions = await LmsAttendance.countDocuments({
    cohortId,
    userId: studentId,
    status: "present",
  });
  const attendancePercent = totalSessions > 0 ? (attendedSessions / totalSessions) * 100 : 100;

  // 5. Weekly Assessments / Module Tasks
  const lessonProgress = await LmsLessonProgress.find({
    cohortId,
    userId: studentId,
    status: "completed",
  }).lean();
  const completedLessonsCount = lessonProgress.length;
  const weeklyTasksPercent = completedLessonsCount > 0 ? 100 : 0;

  // 6. Final Project
  const finalProject = await LmsFinalProject.findOne({
    cohortId,
    studentId,
  }).lean();

  const finalProjectScore = finalProject?.isApproved ? (finalProject.score || 0) : (finalProject?.tutorRecommendation?.score || 0);
  const finalProjectApproved = !!(finalProject && finalProject.isApproved);

  // Check manual overrides
  const overrides = await GradeAudit.find({
    cohortId,
    studentId,
    assessmentType: "override",
  }).sort({ createdAt: -1 }).lean();

  // Weighted total calculation (weights sum to 100)
  const weightedQuizzes = (quizAverage * (weights.quizzes || 15)) / 100;
  const weightedAssignments = (assignmentAverage * (weights.assignments || 15)) / 100;
  const weightedPracticals = (practicalsAverage * (weights.practicals || 15)) / 100;
  const weightedCoding = (codingChallengesAverage * (weights.codingChallenges || 10)) / 100;
  const weightedAttendance = (attendancePercent * (weights.attendance || 10)) / 100;
  const weightedWeeklyTasks = (weeklyTasksPercent * (weights.weeklyTasks || 10)) / 100;
  const weightedFinalProject = (finalProjectScore * (weights.finalProject || 25)) / 100;

  let totalWeightedScore =
    weightedQuizzes +
    weightedAssignments +
    weightedPracticals +
    weightedCoding +
    weightedAttendance +
    weightedWeeklyTasks +
    weightedFinalProject;

  // Apply latest manual override if applicable
  if (overrides.length > 0 && typeof overrides[0].newMark === "number") {
    totalWeightedScore = overrides[0].newMark;
  }

  totalWeightedScore = Math.min(100, Math.max(0, Math.round(totalWeightedScore * 100) / 100));

  const passingThreshold = weights.passingThreshold || 70;
  const isPassing = totalWeightedScore >= passingThreshold;
  const letterGrade = calculateLetterGrade(totalWeightedScore);

  // Three separate states per specification:
  // 1. learningCompletion: completed learning activities
  // 2. academicPerformance: passing threshold achieved
  // 3. certificateEligibility: completion + academic performance + attendance >= 70% + final project approved
  const learningCompletion = completedLessonsCount > 0;
  const academicPerformance = isPassing;
  const certificateEligibility =
    learningCompletion &&
    academicPerformance &&
    attendancePercent >= 70 &&
    (finalProject ? finalProject.isApproved : true);

  return {
    components: {
      quizzes: {
        rawAverage: Math.round(quizAverage * 10) / 10,
        weight: weights.quizzes || 15,
        weightedContribution: Math.round(weightedQuizzes * 10) / 10,
      },
      assignments: {
        rawAverage: Math.round(assignmentAverage * 10) / 10,
        weight: weights.assignments || 15,
        weightedContribution: Math.round(weightedAssignments * 10) / 10,
        totalAssignments: assignments.length,
        submittedAssignments: assignmentSubmissions.length,
      },
      practicals: {
        rawAverage: Math.round(practicalsAverage * 10) / 10,
        weight: weights.practicals || 15,
        weightedContribution: Math.round(weightedPracticals * 10) / 10,
      },
      codingChallenges: {
        rawAverage: Math.round(codingChallengesAverage * 10) / 10,
        weight: weights.codingChallenges || 10,
        weightedContribution: Math.round(weightedCoding * 10) / 10,
      },
      attendance: {
        rawAverage: Math.round(attendancePercent * 10) / 10,
        weight: weights.attendance || 10,
        weightedContribution: Math.round(weightedAttendance * 10) / 10,
        attendedSessions,
        totalSessions,
      },
      weeklyTasks: {
        rawAverage: Math.round(weeklyTasksPercent * 10) / 10,
        weight: weights.weeklyTasks || 10,
        weightedContribution: Math.round(weightedWeeklyTasks * 10) / 10,
      },
      finalProject: {
        rawAverage: Math.round(finalProjectScore * 10) / 10,
        weight: weights.finalProject || 25,
        weightedContribution: Math.round(weightedFinalProject * 10) / 10,
        currentStage: finalProject?.currentStage || 1,
        stageKey: finalProject?.stageKey || "topic_submission",
        isApproved: finalProjectApproved,
      },
    },
    totalWeightedScore,
    letterGrade,
    passingThreshold,
    isPassing,
    states: {
      learningCompletion,
      academicPerformance,
      certificateEligibility,
    },
    hasOverride: overrides.length > 0,
    latestOverride: overrides[0] || null,
  };
};

/**
 * GET /api/lms/cohorts/:cohortId/gradebook
 * Instructor/admin full cohort roster gradebook
 */
export const getCohortGradebook = async (req, res, next) => {
  try {
    const { cohortId } = req.params;
    const cohort = await Cohort.findById(cohortId).lean();
    if (!cohort) {
      return res.status(404).json({ error: "Cohort not found" });
    }

    const students = await User.find({
      _id: { $in: cohort.studentIds || [] },
    })
      .select("firstName lastName email avatarUrl")
      .lean();

    const roster = await Promise.all(
      students.map(async (student) => {
        const metrics = await calculateStudentAcademicMetrics(
          cohort._id,
          student._id,
          cohort.completionWeights
        );
        return {
          student: {
            _id: student._id,
            name: `${student.firstName} ${student.lastName}`.trim(),
            email: student.email,
            avatarUrl: student.avatarUrl,
          },
          ...metrics,
        };
      })
    );

    return res.status(200).json({
      cohortId: cohort._id,
      cohortName: cohort.name,
      weights: cohort.completionWeights,
      totalStudents: roster.length,
      roster,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/lms/cohorts/:cohortId/my-transcript
 * Student personal academic transcript
 */
export const getStudentTranscript = async (req, res, next) => {
  try {
    const { cohortId } = req.params;
    const userId = req.user._id;

    const cohort = await Cohort.findById(cohortId).select("name completionWeights").lean();
    if (!cohort) {
      return res.status(404).json({ error: "Cohort not found" });
    }

    const metrics = await calculateStudentAcademicMetrics(
      cohort._id,
      userId,
      cohort.completionWeights
    );

    return res.status(200).json({
      cohortId: cohort._id,
      cohortName: cohort.name,
      studentId: userId,
      transcript: metrics,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/lms/cohorts/:cohortId/gradebook/export
 * Downloadable CSV export of the full cohort gradebook
 */
export const exportCohortGradebookCsv = async (req, res, next) => {
  try {
    const { cohortId } = req.params;
    const cohort = await Cohort.findById(cohortId).lean();
    if (!cohort) {
      return res.status(404).json({ error: "Cohort not found" });
    }

    const students = await User.find({
      _id: { $in: cohort.studentIds || [] },
    })
      .select("firstName lastName email")
      .lean();

    const headers = [
      "Student ID",
      "Full Name",
      "Email",
      "Quizzes (%)",
      "Assignments (%)",
      "Practicals (%)",
      "Coding Challenges (%)",
      "Attendance (%)",
      "Weekly Tasks (%)",
      "Final Project (%)",
      "Overall Score (%)",
      "Letter Grade",
      "Passing Status",
      "Certificate Eligible",
    ];

    const rows = await Promise.all(
      students.map(async (student) => {
        const metrics = await calculateStudentAcademicMetrics(
          cohort._id,
          student._id,
          cohort.completionWeights
        );
        return [
          student._id,
          `"${student.firstName} ${student.lastName}"`,
          student.email,
          metrics.components.quizzes.rawAverage,
          metrics.components.assignments.rawAverage,
          metrics.components.practicals.rawAverage,
          metrics.components.codingChallenges.rawAverage,
          metrics.components.attendance.rawAverage,
          metrics.components.weeklyTasks.rawAverage,
          metrics.components.finalProject.rawAverage,
          metrics.totalWeightedScore,
          metrics.letterGrade,
          metrics.isPassing ? "PASSED" : "FAILED",
          metrics.states.certificateEligibility ? "ELIGIBLE" : "INELIGIBLE",
        ].join(",");
      })
    );

    const csvContent = [headers.join(","), ...rows].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="cohort-${cohortId}-gradebook.csv"`
    );
    return res.status(200).send(csvContent);
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/lms/cohorts/:cohortId/gradebook/override
 * Manual score override with mandatory reason and GradeAudit logging
 */
export const overrideStudentGrade = async (req, res, next) => {
  try {
    const { cohortId } = req.params;
    const { studentId, newMark, reason, assessmentType = "override" } = req.body;

    if (!studentId || typeof newMark !== "number" || !reason || !reason.trim()) {
      return res.status(400).json({
        error: "studentId, numeric newMark, and reason are required",
      });
    }

    const cohort = await Cohort.findById(cohortId);
    if (!cohort) {
      return res.status(404).json({ error: "Cohort not found" });
    }

    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    const currentMetrics = await calculateStudentAcademicMetrics(
      cohort._id,
      studentId,
      cohort.completionWeights
    );

    const audit = await GradeAudit.create({
      cohortId: cohort._id,
      studentId,
      assessmentType,
      previousMark: currentMetrics.totalWeightedScore,
      newMark,
      reason: reason.trim(),
      actor: req.user._id,
      actorRole: req.user.role,
    });

    const updatedMetrics = await calculateStudentAcademicMetrics(
      cohort._id,
      studentId,
      cohort.completionWeights
    );

    return res.status(200).json({
      message: "Grade override recorded successfully",
      audit,
      updatedTranscript: updatedMetrics,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/lms/cohorts/:cohortId/assessment-weights
 * Admin-only: Updates cohort completion weights with strict 100% total validation and GradeAudit log
 */
export const updateCohortAssessmentWeights = async (req, res, next) => {
  try {
    const { cohortId } = req.params;
    const {
      quizzes = 15,
      assignments = 15,
      practicals = 15,
      codingChallenges = 10,
      attendance = 10,
      weeklyTasks = 10,
      finalProject = 25,
      passingThreshold = 70,
      reason = "Curriculum weight configuration update",
    } = req.body;

    const total =
      Number(quizzes) +
      Number(assignments) +
      Number(practicals) +
      Number(codingChallenges) +
      Number(attendance) +
      Number(weeklyTasks) +
      Number(finalProject);

    if (total !== 100) {
      return res.status(400).json({
        error: `Assessment weights must total exactly 100%. Current sum: ${total}%`,
      });
    }

    const cohort = await Cohort.findById(cohortId);
    if (!cohort) {
      return res.status(404).json({ error: "Cohort not found" });
    }

    const previousWeights = { ...cohort.completionWeights.toObject?.() || cohort.completionWeights };

    cohort.completionWeights = {
      quizzes: Number(quizzes),
      assignments: Number(assignments),
      practicals: Number(practicals),
      codingChallenges: Number(codingChallenges),
      attendance: Number(attendance),
      weeklyTasks: Number(weeklyTasks),
      finalProject: Number(finalProject),
      passingThreshold: Number(passingThreshold),
    };

    await cohort.save();

    await GradeAudit.create({
      cohortId: cohort._id,
      assessmentType: "completion_weights",
      previousWeights,
      newWeights: cohort.completionWeights,
      reason: reason.trim(),
      actor: req.user._id,
      actorRole: req.user.role,
    });

    return res.status(200).json({
      message: "Assessment weights updated and audited successfully",
      weights: cohort.completionWeights,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/lms/cohorts/:cohortId/grade-audits
 * Lists all grade audit records for the cohort
 */
export const getCohortGradeAudits = async (req, res, next) => {
  try {
    const { cohortId } = req.params;
    const audits = await GradeAudit.find({ cohortId })
      .populate("actor", "firstName lastName email role")
      .populate("studentId", "firstName lastName email")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      cohortId,
      totalAudits: audits.length,
      audits,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getCohortGradebook,
  getStudentTranscript,
  exportCohortGradebookCsv,
  overrideStudentGrade,
  updateCohortAssessmentWeights,
  getCohortGradeAudits,
};

