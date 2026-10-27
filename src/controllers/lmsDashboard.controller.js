import { Cohort } from "../models/Cohort.model.js";
import { Course } from "../models/Course.model.js";
import { Trimester } from "../models/Trimester.model.js";
import { LmsLessonProgress } from "../models/LmsLessonProgress.model.js";
import { LmsQuizAttempt } from "../models/LmsQuizAttempt.model.js";
import { LmsAssignment } from "../models/LmsAssignment.model.js";
import { LmsSubmission } from "../models/LmsSubmission.model.js";
import { LmsLiveSession } from "../models/LmsLiveSession.model.js";
import { LmsAttendance } from "../models/LmsAttendance.model.js";

/**
 * GET /api/lms/me
 * Returns user cohorts list, academic trimester context, and resolves active cohort ID
 */
export const getLmsMe = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;

    let filter = {};
    if (userRole === "admin") {
      filter = { status: { $in: ["active", "enrolling"] } };
    } else if (userRole === "tutor" || userRole === "instructor") {
      filter = { instructorIds: userId };
    } else {
      filter = { studentIds: userId };
    }

    const userCohorts = await Cohort.find(filter)
      .populate("trimesterId")
      .populate("courseId")
      .sort({ updatedAt: -1, createdAt: -1 });

    const cohorts = userCohorts.map((c) => ({
      _id: c._id,
      name: c.name,
      trimester: c.trimesterId
        ? {
            _id: c.trimesterId._id,
            title: c.trimesterId.title,
            number: c.trimesterId.number,
            status: c.trimesterId.status,
            startDate: c.trimesterId.startDate,
            endDate: c.trimesterId.endDate,
            weeks: c.trimesterId.weeks,
          }
        : null,
      programTitle: c.courseId?.title || "Fullstack Software Engineering",
      currentWeek: c.currentWeek || 1,
      status: c.status,
      capacity: c.capacity,
      timezone: c.timezone,
    }));

    // Resolve active cohort ID
    let activeCohortId = null;
    if (req.query.cohortId) {
      const found = cohorts.find((c) => String(c._id) === String(req.query.cohortId));
      if (found) activeCohortId = found._id;
    }
    if (!activeCohortId && cohorts.length > 0) {
      const active = cohorts.find((c) => c.status === "active") || cohorts[0];
      activeCohortId = active._id;
    }

    res.status(200).json({
      role: userRole,
      cohorts,
      activeCohortId,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/lms/dashboard/student
 * Aggregates overall and weekly progress, assignment completion, and upcoming milestones
 */
export const getStudentDashboard = async (req, res, next) => {
  try {
    const cohort = req.cohort;
    const userId = req.user._id;

    // Fetch full course structure with modules, lessons, quizzes
    const course = await Course.findById(cohort.courseId);
    const modules = course?.modules || [];

    let totalLessons = 0;
    let totalQuizzes = 0;
    const allLessons = [];

    modules.forEach((mod) => {
      if (Array.isArray(mod.lessons)) {
        totalLessons += mod.lessons.length;
        mod.lessons.forEach((l) =>
          allLessons.push({ ...l.toObject(), moduleId: mod._id })
        );
      }
      if (Array.isArray(mod.quizzes)) {
        totalQuizzes += mod.quizzes.length;
      }
    });

    // Assignments in this cohort
    const assignments = await LmsAssignment.find({ cohortId: cohort._id });
    const totalAssignments = assignments.length;

    // Student completed lessons
    const completedProgresses = await LmsLessonProgress.find({
      cohortId: cohort._id,
      userId,
      status: "completed",
    });
    const completedLessonIds = new Set(
      completedProgresses.map((p) => String(p.lessonId))
    );
    const completedLessonsCount = completedLessonIds.size;

    // Student passed quizzes
    const passedQuizIds = await LmsQuizAttempt.find({
      cohortId: cohort._id,
      userId,
      passed: true,
    }).distinct("quizId");
    const passedQuizzesCount = passedQuizIds.length;

    // Student submitted assignments
    const submittedAssignmentsCount = await LmsSubmission.countDocuments({
      cohortId: cohort._id,
      userId,
      status: { $in: ["submitted", "pending_review", "graded"] },
    });

    // Overall Progress Calculation
    const totalRequiredItems = totalLessons + totalQuizzes + totalAssignments;
    const completedItems =
      completedLessonsCount + passedQuizzesCount + submittedAssignmentsCount;
    const overall =
      totalRequiredItems > 0
        ? Math.round((completedItems / totalRequiredItems) * 100)
        : 0;

    // Current Week Progress Calculation
    const currentWeekMod =
      modules[Math.max(0, (cohort.currentWeek || 1) - 1)] || modules[0];
    let weekLessons = 0;
    let weekCompleted = 0;
    if (currentWeekMod && Array.isArray(currentWeekMod.lessons)) {
      weekLessons = currentWeekMod.lessons.length;
      weekCompleted = currentWeekMod.lessons.filter((l) =>
        completedLessonIds.has(String(l._id))
      ).length;
    }
    const week =
      weekLessons > 0 ? Math.round((weekCompleted / weekLessons) * 100) : 0;

    // Upcoming deliverables
    const upcomingAssignments = await LmsAssignment.find({
      cohortId: cohort._id,
      dueAt: { $gte: new Date() },
    })
      .sort({ dueAt: 1 })
      .limit(4);

    const upcoming = upcomingAssignments.map((a) => ({
      id: a._id,
      title: a.title,
      type: "assignment",
      dueAt: a.dueAt,
    }));

    // Next incomplete lesson
    const nextIncomplete = allLessons.find(
      (l) => !completedLessonIds.has(String(l._id))
    );
    const upNext = nextIncomplete
      ? {
          lessonId: nextIncomplete._id,
          moduleId: nextIncomplete.moduleId,
          title: nextIncomplete.title,
          duration: nextIncomplete.duration,
        }
      : null;

    // Announcements
    const announcements = [
      {
        id: `ann-${cohort._id}-1`,
        title: `Welcome to ${cohort.name}!`,
        message: "Check your curriculum and submit deliverables before their respective deadlines.",
        createdAt: cohort.createdAt,
      },
    ];

    // Dynamic Attendance Calculation per spec:
    // Attendance = sessions attended divided by sessions held, excluding excused sessions
    const sessionsHeld = await LmsLiveSession.countDocuments({
      cohortId: cohort._id,
      startsAt: { $lte: new Date() },
    });

    const userAttendances = await LmsAttendance.find({
      cohortId: cohort._id,
      userId,
    });

    const sessionsAttended = userAttendances.filter((a) => a.status === "present").length;
    const sessionsExcused = userAttendances.filter((a) => a.status === "excused").length;
    const netSessions = sessionsHeld - sessionsExcused;

    const attendance = netSessions > 0
      ? Math.min(100, Math.round((sessionsAttended / netSessions) * 100))
      : 100;

    res.status(200).json({
      cohort: {
        _id: cohort._id,
        name: cohort.name,
        currentWeek: cohort.currentWeek,
        status: cohort.status,
        capacity: cohort.capacity,
        timezone: cohort.timezone,
        programTitle: course?.title || "Fullstack Software Engineering",
      },
      progress: {
        overall,
        week,
        assignments: {
          done: submittedAssignmentsCount,
          total: totalAssignments,
        },
        attendance,
      },
      upNext,
      upcoming,
      announcements,
    });
  } catch (error) {
    next(error);
  }
};
