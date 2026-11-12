import mongoose from "mongoose";
import { Cohort } from "../models/Cohort.model.js";
import { Course } from "../models/Course.model.js";
import { User } from "../models/User.model.js";
import { LmsLessonProgress } from "../models/LmsLessonProgress.model.js";
import { LmsLiveSession } from "../models/LmsLiveSession.model.js";
import { LmsAttendance } from "../models/LmsAttendance.model.js";
import { LmsSubmission } from "../models/LmsSubmission.model.js";

const isId = (value) => mongoose.isValidObjectId(value);
const fail = (res, status, error, code) => res.status(status).json(code ? { error, code } : { error });

/** Course lessons in teaching order, each with its module and week number (one module is one week). */
const flattenLessons = (course) =>
  (course?.modules ?? []).flatMap((module, index) =>
    (module.lessons ?? []).map((lesson) => ({ lessonId: lesson._id, title: lesson.title, moduleId: module._id, moduleTitle: module.title, weekNumber: index + 1 }))
  );

/**
 * GET /api/lms/continue-learning?cohortId=
 * Where the "Continue Learning" button should open: the lesson the student was last on, or the next one when that lesson
 * is finished, with the saved scroll position. cohortGuard has already checked membership.
 */
export const getContinueLearning = async (req, res, next) => {
  try {
    const cohortId = req.cohortId;
    const course = await Course.findById(req.cohort.courseId?._id ?? req.cohort.courseId).select("modules.title modules.lessons._id modules.lessons.title").lean();
    const lessons = flattenLessons(course);
    if (lessons.length === 0) return res.status(200).json({ continueLearning: null });

    const latest = await LmsLessonProgress.findOne({ cohortId, userId: req.user._id }).sort({ lastActivityAt: -1 }).lean();
    let target = lessons[0];
    let reason = "start";
    let progress = null;

    if (latest) {
      const index = lessons.findIndex((lesson) => String(lesson.lessonId) === String(latest.lessonId));
      if (index >= 0) {
        if (latest.status === "completed" && index + 1 < lessons.length) {
          target = lessons[index + 1];
          reason = "next";
        } else {
          target = lessons[index];
          reason = latest.status === "completed" ? "finished" : "resume";
          progress = latest;
        }
      }
    }

    return res.status(200).json({
      continueLearning: {
        cohortId,
        ...target,
        reason,
        scrollPosition: progress?.scrollPosition ?? 0,
        lastPositionSeconds: progress?.lastPositionSeconds ?? 0,
        lastActivityAt: latest?.lastActivityAt ?? null,
      },
    });
  } catch (error) {
    next(error);
  }
};

const canSeeCohort = (cohort, user) => user.role === "admin" || cohort.instructorIds.some((id) => String(id) === String(user._id));

/**
 * GET /api/lms/instructor/cohorts/:cohortId/support-flags
 * Learners who may need support, from simple rules with thresholds the admin controls.
 * Low progress is only judged from week 2, otherwise everyone is flagged on day one.
 */
export const getSupportFlags = async (req, res, next) => {
  try {
    if (!isId(req.params.cohortId)) return fail(res, 400, "Invalid cohort ID format");
    const cohort = await Cohort.findById(req.params.cohortId).lean();
    if (!cohort) return fail(res, 404, "Cohort not found");
    if (!canSeeCohort(cohort, req.user)) return fail(res, 403, "You are not assigned to this cohort", "COHORT_ACCESS_DENIED");

    const thresholds = { lowProgressPercent: 40, lowAttendancePercent: 60, lateSubmissions: 2, ...(cohort.supportThresholds ?? {}) };
    const studentIds = cohort.studentIds ?? [];
    const course = await Course.findById(cohort.courseId).select("modules.lessons._id").lean();
    const totalLessons = flattenLessons(course).length;

    const [students, completed, endedSessions, attendance, late] = await Promise.all([
      User.find({ _id: { $in: studentIds } }).select("firstName lastName email").lean(),
      LmsLessonProgress.aggregate([{ $match: { cohortId: cohort._id, userId: { $in: studentIds }, status: "completed" } }, { $group: { _id: "$userId", n: { $sum: 1 } } }]),
      LmsLiveSession.countDocuments({ cohortId: cohort._id, status: "ended" }),
      LmsAttendance.aggregate([{ $match: { cohortId: cohort._id, userId: { $in: studentIds } } }, { $group: { _id: { u: "$userId", s: "$status" }, n: { $sum: 1 } } }]),
      LmsSubmission.aggregate([{ $match: { cohortId: cohort._id, userId: { $in: studentIds }, isLate: true } }, { $group: { _id: "$userId", n: { $sum: 1 } } }]),
    ]);

    const completedBy = new Map(completed.map((row) => [String(row._id), row.n]));
    const lateBy = new Map(late.map((row) => [String(row._id), row.n]));
    const attendanceBy = new Map();
    for (const row of attendance) attendanceBy.set(`${row._id.u}:${row._id.s}`, row.n);
    const judgeProgress = (cohort.currentWeek ?? 1) >= 2 && totalLessons > 0;

    const rows = students.map((student) => {
      const id = String(student._id);
      const progressPercent = totalLessons > 0 ? Math.round(((completedBy.get(id) ?? 0) / totalLessons) * 100) : 0;
      // Excused absences do not count against the learner
      const excused = attendanceBy.get(`${id}:excused`) ?? 0;
      const present = attendanceBy.get(`${id}:present`) ?? 0;
      const countable = endedSessions - excused;
      const attendancePercent = endedSessions > 0 && countable > 0 ? Math.min(100, Math.round((present / countable) * 100)) : null;
      const lateSubmissions = lateBy.get(id) ?? 0;

      const flags = [];
      if (judgeProgress && progressPercent < thresholds.lowProgressPercent) flags.push("low_progress");
      if (attendancePercent !== null && attendancePercent < thresholds.lowAttendancePercent) flags.push("low_attendance");
      if (lateSubmissions >= thresholds.lateSubmissions) flags.push("late_work");

      return { userId: student._id, name: [student.firstName, student.lastName].filter(Boolean).join(" "), email: student.email, progressPercent, attendancePercent, lateSubmissions, flags };
    });
    rows.sort((a, b) => b.flags.length - a.flags.length || a.name.localeCompare(b.name));

    return res.status(200).json({
      thresholds,
      summary: { total: rows.length, flagged: rows.filter((row) => row.flags.length > 0).length },
      students: rows,
    });
  } catch (error) {
    next(error);
  }
};

/** PUT /api/lms/admin/cohorts/:id/support-thresholds  { lowProgressPercent, lowAttendancePercent, lateSubmissions } */
export const updateSupportThresholds = async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return fail(res, 400, "Invalid cohort ID format");
    const cohort = await Cohort.findById(req.params.id);
    if (!cohort) return fail(res, 404, "Cohort not found");

    const body = req.body || {};
    const next_ = { ...(cohort.supportThresholds?.toObject?.() ?? cohort.supportThresholds ?? {}) };
    for (const field of ["lowProgressPercent", "lowAttendancePercent"]) {
      if (body[field] !== undefined) {
        const value = Number(body[field]);
        if (!Number.isFinite(value) || value < 0 || value > 100) return fail(res, 400, `${field} must be a number from 0 to 100`);
        next_[field] = value;
      }
    }
    if (body.lateSubmissions !== undefined) {
      const value = Number(body.lateSubmissions);
      if (!Number.isInteger(value) || value < 1) return fail(res, 400, "lateSubmissions must be a whole number of at least 1");
      next_.lateSubmissions = value;
    }
    cohort.supportThresholds = next_;
    await cohort.save();
    return res.status(200).json({ supportThresholds: cohort.supportThresholds });
  } catch (error) {
    next(error);
  }
};
