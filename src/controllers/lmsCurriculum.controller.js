import { Course } from "../models/Course.model.js";
import { LmsLessonProgress } from "../models/LmsLessonProgress.model.js";
import { LmsLessonComment } from "../models/LmsLessonComment.model.js";
import { LmsQuizAttempt } from "../models/LmsQuizAttempt.model.js";
import { LmsAssignment } from "../models/LmsAssignment.model.js";
import { LmsSubmission } from "../models/LmsSubmission.model.js";

/**
 * Helper to recalculate overall cohort completion percentage for a student
 */
export const computeOverallPercent = async (cohortId, courseId, userId) => {
  const course = await Course.findById(courseId);
  const modules = course?.modules || [];

  let totalLessons = 0;
  let totalQuizzes = 0;
  modules.forEach((mod) => {
    if (Array.isArray(mod.lessons)) totalLessons += mod.lessons.length;
    if (Array.isArray(mod.quizzes)) totalQuizzes += mod.quizzes.length;
  });

  const totalAssignments = await LmsAssignment.countDocuments({ cohortId });
  const totalRequired = totalLessons + totalQuizzes + totalAssignments;

  if (totalRequired === 0) return 0;

  const completedLessons = await LmsLessonProgress.countDocuments({
    cohortId,
    userId,
    status: "completed",
  });
  const passedQuizzes = await LmsQuizAttempt.find({
    cohortId,
    userId,
    passed: true,
  }).distinct("quizId");
  const submittedAssignments = await LmsSubmission.countDocuments({
    cohortId,
    userId,
    status: { $in: ["submitted", "pending_review", "graded"] },
  });

  const totalDone =
    completedLessons + passedQuizzes.length + submittedAssignments;
  return Math.round((totalDone / totalRequired) * 100);
};

/**
 * GET /api/lms/cohorts/:cohortId/curriculum
 * Returns full module tree with per-lesson status and watched duration
 */
export const getCohortCurriculum = async (req, res, next) => {
  try {
    const cohort = req.cohort;
    const userId = req.user._id;

    const course = await Course.findById(cohort.courseId);
    if (!course) {
      return res.status(404).json({ error: "Curriculum course not found" });
    }

    const progresses = await LmsLessonProgress.find({
      cohortId: cohort._id,
      userId,
    });
    const progressMap = new Map(
      progresses.map((p) => [String(p.lessonId), p])
    );

    const modules = course.modules.map((mod) => ({
      _id: mod._id,
      title: mod.title,
      lessons: (mod.lessons || []).map((l) => {
        const p = progressMap.get(String(l._id));
        return {
          _id: l._id,
          title: l.title,
          duration: l.duration,
          status: p?.status || "not_started",
          watchedSeconds: p?.watchedSeconds || 0,
          completed: p?.status === "completed",
        };
      }),
      quizzes: (mod.quizzes || []).map((q) => ({
        _id: q._id,
        title: q.title,
        questionCount: q.questions?.length || 0,
        passingScore: q.passingScore || 70,
      })),
    }));

    // Generate 12-week, 22-node learning trail from curriculum modules and academic schedule
    const learningTrail = [];
    const passedQuizzes = await LmsQuizAttempt.find({
      cohortId: cohort._id,
      userId,
      passed: true
    }).distinct("quizId");
    const passedQuizSet = new Set(passedQuizzes.map(String));

    const submittedSubmissions = await LmsSubmission.find({
      cohortId: cohort._id,
      userId,
      status: { $in: ["submitted", "pending_review", "graded"] }
    }).lean();
    const submissionMap = new Map(submittedSubmissions.map((s) => [String(s.assignmentId), s]));

    // Nodes 1 to 10: Weeks 1 to 10 (Daily pattern: recorded, recorded, live, live, peer learning)
    for (let w = 1; w <= 10; w++) {
      const mod = modules[w - 1] || null;
      const lessonCount = mod?.lessons?.length || 0;
      const completedLessons = mod?.lessons?.filter((l) => l.completed)?.length || 0;
      const quizPassed = mod?.quizzes?.some((q) => passedQuizSet.has(String(q._id))) || false;

      const lessonCompletion = lessonCount > 0 ? completedLessons === lessonCount : completedLessons > 0;
      const assessmentCompletion = quizPassed;
      const taskSubmission = false; // Separate state
      const nodeCompletion = lessonCompletion && (mod?.quizzes?.length ? assessmentCompletion : true);

      let status = "available";
      if (nodeCompletion) {
        status = "completed";
      } else if (completedLessons > 0) {
        status = "in_progress";
      } else if (w > 1 && !learningTrail[w - 2]?.completed) {
        status = "available"; // or locked if strictly sequential
      }

      learningTrail.push({
        nodeIndex: w,
        week: w,
        phase: "core_foundation",
        title: mod?.title || `Week ${w}: Core Systems & Engineering`,
        description: `Week ${w} foundation sprint covering architecture, live implementation, and peer learning sessions.`,
        activities: ["recorded", "recorded", "live", "live", "peer_learning"],
        completionCriteria: "Complete weekly recordings, attend live sessions, and pass weekly checkpoint",
        moduleTitle: mod?.title || `Week ${w}`,
        moduleId: mod?._id || null,
        status,
        completed: nodeCompletion,
        lessonCompletion,
        assessmentCompletion,
        taskSubmission,
        nodeCompletion
      });
    }

    // Nodes 11 to 16: Week 11 (Assessment and practical work)
    const week11Titles = [
      "Practical Lab 1: Core System Implementation",
      "Practical Lab 2: API Engineering & Microservices",
      "Mid-Term Comprehensive Assessment",
      "Codebase Security & Performance Audit",
      "Peer Review & Collaborative Integration",
      "Capstone Pre-Submission & Architecture Review"
    ];

    for (let i = 0; i < 6; i++) {
      const nodeIdx = 11 + i;
      const title = week11Titles[i];
      const sub = submittedSubmissions[i] || null;
      const isSubDone = Boolean(sub);

      learningTrail.push({
        nodeIndex: nodeIdx,
        week: 11,
        phase: "assessment_and_practical",
        title,
        description: `Week 11 intensive practical sprint: ${title}.`,
        activities: ["practical_lab", "assessment_submission", "peer_critique"],
        completionCriteria: "Submit verified code implementation or pass technical audit",
        status: isSubDone ? "completed" : "available",
        completed: isSubDone,
        lessonCompletion: true,
        assessmentCompletion: isSubDone,
        taskSubmission: isSubDone,
        nodeCompletion: isSubDone
      });
    }

    // Nodes 17 to 22: Week 12 (Reflection, final live class, comprehensive quizzes, final assessment, final project, overall review)
    const week12Nodes = [
      { title: "Weekly Engineering Reflection & Professional Growth", activities: ["reflection_journal"], criteria: "Submit written reflection on technical progression" },
      { title: "Final Live Classroom: Industry AMA & Thesis Debrief", activities: ["live_attendance"], criteria: "Attend final live debrief classroom" },
      { title: "Comprehensive Exit Quizzes", activities: ["exit_quiz"], criteria: "Score at least 70% on exit knowledge checkpoint" },
      { title: "Final Comprehensive Academic Assessment", activities: ["final_exam"], criteria: "Complete timed practical examination" },
      { title: "Final Project Defense & Repository Submission", activities: ["capstone_defense", "code_submission"], criteria: "Deliver working project repository and defend architecture" },
      { title: "Overall Academic Review & Degree Certification", activities: ["certification_audit"], criteria: "Administrator review and automated certificate generation" }
    ];

    for (let j = 0; j < 6; j++) {
      const nodeIdx = 17 + j;
      const meta = week12Nodes[j];
      learningTrail.push({
        nodeIndex: nodeIdx,
        week: 12,
        phase: "capstone_and_review",
        title: meta.title,
        description: `Week 12 graduation requirement: ${meta.title}.`,
        activities: meta.activities,
        completionCriteria: meta.criteria,
        status: nodeIdx === 22 ? "locked" : "available",
        completed: false,
        lessonCompletion: false,
        assessmentCompletion: false,
        taskSubmission: false,
        nodeCompletion: false
      });
    }

    res.status(200).json({
      cohortId: cohort._id,
      modules,
      learningTrail,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/lms/lessons/:lessonId/watch-event
 * Receives YouTube player telemetry events, auto-completes on 90% watched, and persists watch state
 */
export const recordWatchEvent = async (req, res, next) => {
  try {
    const cohort = req.cohort;
    const userId = req.user._id;
    const { lessonId } = req.params;
    const { currentTime, duration, percent, event } = req.body;

    const course = await Course.findById(cohort.courseId);
    let targetLesson = null;
    let moduleId = null;
    course?.modules?.forEach((mod) => {
      (mod.lessons || []).forEach((l) => {
        if (String(l._id) === String(lessonId)) {
          targetLesson = l;
          moduleId = mod._id;
        }
      });
    });

    let durationSec = 900;
    if (typeof duration === "number" && duration > 0) {
      durationSec = Math.round(duration);
    } else if (targetLesson?.duration && typeof targetLesson.duration === "string") {
      const parts = targetLesson.duration.split(":").map(Number);
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        durationSec = parts[0] * 60 + parts[1];
      }
    }

    const watchedSeconds = typeof currentTime === "number" ? Math.max(0, Math.round(currentTime)) : 0;
    const calculatedPercent = typeof percent === "number"
      ? Math.max(0, Math.min(100, Math.round(percent)))
      : (durationSec > 0 ? Math.min(100, Math.round((watchedSeconds / durationSec) * 100)) : 0);

    const updateFields = {
      watchedSeconds,
      watchProgressPercent: calculatedPercent,
      lastActivityAt: new Date(),
    };
    if (moduleId) updateFields.moduleId = moduleId;

    // 90% completion rule
    if (calculatedPercent >= 90 || event === "ended") {
      updateFields.status = "completed";
      updateFields.completedAt = new Date();
    } else if (watchedSeconds > 0) {
      updateFields.status = "in_progress";
    }

    const progress = await LmsLessonProgress.findOneAndUpdate(
      { cohortId: cohort._id, userId, lessonId },
      { $set: updateFields },
      { new: true, upsert: true }
    );

    const overallPercent = await computeOverallPercent(cohort._id, cohort.courseId, userId);

    return res.status(200).json({
      saved: true,
      progress,
      overallPercent,
      completed: progress.status === "completed",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/lms/lessons/:lessonId/notes
 * Retrieves student's persisted private notes for this lesson
 */
export const getLessonNotes = async (req, res, next) => {
  try {
    const cohort = req.cohort;
    const userId = req.user._id;
    const { lessonId } = req.params;

    const progress = await LmsLessonProgress.findOne({
      cohortId: cohort._id,
      userId,
      lessonId,
    });

    return res.status(200).json({
      lessonId,
      notes: progress?.notes || "",
      lastActivityAt: progress?.lastActivityAt || null,
      scrollPosition: progress?.scrollPosition || 0,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/lms/lessons/:lessonId/notes
 * Persists student's private study notes for this lesson
 */
export const saveLessonNotes = async (req, res, next) => {
  try {
    const cohort = req.cohort;
    const userId = req.user._id;
    const { lessonId } = req.params;
    const { notes, scrollPosition } = req.body;

    const updateFields = {
      notes: typeof notes === "string" ? notes : "",
      lastActivityAt: new Date(),
    };
    if (typeof scrollPosition === "number") {
      updateFields.scrollPosition = Math.max(0, scrollPosition);
    }

    const progress = await LmsLessonProgress.findOneAndUpdate(
      { cohortId: cohort._id, userId, lessonId },
      { $set: updateFields },
      { new: true, upsert: true }
    );

    return res.status(200).json({
      saved: true,
      notes: progress.notes,
      scrollPosition: progress.scrollPosition,
      lastActivityAt: progress.lastActivityAt,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/lms/lessons/:lessonId/materials
 * Returns downloadable PDF guides, source code files, and supplementary materials
 */
export const getLessonMaterials = async (req, res, next) => {
  try {
    const cohort = req.cohort;
    const { lessonId } = req.params;

    const course = await Course.findById(cohort.courseId);
    let targetLesson = null;
    course?.modules?.forEach((mod) => {
      (mod.lessons || []).forEach((l) => {
        if (String(l._id) === String(lessonId)) targetLesson = l;
      });
    });

    if (!targetLesson) {
      return res.status(404).json({ error: "Lesson not found in curriculum" });
    }

    return res.status(200).json({
      lessonId,
      title: targetLesson.title,
      attachments: targetLesson.attachments || [],
      notes: targetLesson.notes || "",
      materials: [
        {
          title: "Official Lecture Notes & Slides",
          type: "pdf",
          url: "https://amzn-v3-buccket-gloxad-sstone.s3.eu-north-1.amazonaws.com/courses/resources/lecture-notes.pdf",
        },
        {
          title: "Starter Project & Code Snippets",
          type: "github",
          url: "https://github.com/freeCodeCamp",
        },
      ],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/lms/lessons/:lessonId
 * Returns unshielded lesson content, video playback, notes, objectives, navigation
 */
export const getLessonDetail = async (req, res, next) => {
  try {
    const cohort = req.cohort;
    const userId = req.user._id;
    const { lessonId } = req.params;

    const course = await Course.findById(cohort.courseId);
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    let targetLesson = null;
    let targetModule = null;
    const allFlatLessons = [];

    course.modules.forEach((mod) => {
      (mod.lessons || []).forEach((l) => {
        allFlatLessons.push({ lesson: l, module: mod });
        if (String(l._id) === String(lessonId)) {
          targetLesson = l;
          targetModule = mod;
        }
      });
    });

    if (!targetLesson) {
      return res.status(404).json({ error: "Lesson not found in curriculum" });
    }

    // Determine navigation links
    const currentIndex = allFlatLessons.findIndex(
      (item) => String(item.lesson._id) === String(lessonId)
    );
    const prevItem = currentIndex > 0 ? allFlatLessons[currentIndex - 1] : null;
    const nextItem =
      currentIndex < allFlatLessons.length - 1
        ? allFlatLessons[currentIndex + 1]
        : null;

    // Fetch user progress on this lesson
    const progress = await LmsLessonProgress.findOne({
      cohortId: cohort._id,
      userId,
      lessonId,
    });

    // Duration parser (e.g. "15:00" -> 900s)
    let durationSec = 900;
    if (targetLesson.duration && typeof targetLesson.duration === "string") {
      const parts = targetLesson.duration.split(":").map(Number);
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        durationSec = parts[0] * 60 + parts[1];
      }
    }

    const watchedSeconds = progress?.watchedSeconds || 0;
    const progressPercent =
      progress?.status === "completed"
        ? 100
        : Math.min(99, Math.round((watchedSeconds / durationSec) * 100));

    res.status(200).json({
      trimester: cohort.trimesterId
        ? {
            _id: cohort.trimesterId._id,
            title: cohort.trimesterId.title,
            number: cohort.trimesterId.number,
          }
        : null,
      module: {
        _id: targetModule._id,
        title: targetModule.title,
      },
      title: targetLesson.title,
      video: {
        playbackUrl:
          targetLesson.videoUrl ||
          "https://gloxad-bucket.s3.amazonaws.com/courses/express-routes.mp4",
        durationSec,
      },
      notes:
        targetLesson.notes ||
        "Comprehensive study notes covering the principles and execution of this lesson.",
      studentNotes: progress?.notes || "",
      scrollPosition: progress?.scrollPosition || 0,
      lastActivityAt: progress?.lastActivityAt || null,
      objectives:
        targetLesson.objectives?.length > 0
          ? targetLesson.objectives
          : [`Master fundamental concepts of ${targetLesson.title}`],
      attachments: targetLesson.attachments || [],
      progressPercent: progress?.watchProgressPercent !== undefined ? progress.watchProgressPercent : progressPercent,
      completed: progress?.status === "completed",
      next: nextItem
        ? { _id: nextItem.lesson._id, title: nextItem.lesson.title }
        : null,
      previousId: prevItem ? prevItem.lesson._id : null,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/lms/lessons/:lessonId/progress
 * Idempotently updates watched time and completed objectives, recalculating dashboard percentage.
 * Automatically enforces the 90% YouTube watch-completion rule and persists scroll/notes.
 */
export const updateLessonProgress = async (req, res, next) => {
  try {
    const cohort = req.cohort;
    const userId = req.user._id;
    const { lessonId } = req.params;
    const {
      watchedSeconds,
      watchProgressPercent,
      completed,
      objectivesDone,
      scrollPosition,
      notes,
    } = req.body;

    const course = await Course.findById(cohort.courseId);
    let moduleId = null;
    let targetLesson = null;
    course?.modules?.forEach((mod) => {
      (mod.lessons || []).forEach((l) => {
        if (String(l._id) === String(lessonId)) {
          moduleId = mod._id;
          targetLesson = l;
        }
      });
    });

    let durationSec = 900;
    if (targetLesson?.duration && typeof targetLesson.duration === "string") {
      const parts = targetLesson.duration.split(":").map(Number);
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        durationSec = parts[0] * 60 + parts[1];
      }
    }

    const updateFields = {
      lastActivityAt: new Date(),
    };

    if (typeof watchedSeconds === "number") {
      updateFields.watchedSeconds = Math.max(0, watchedSeconds);
    }

    let calculatedPercent = typeof watchProgressPercent === "number" ? watchProgressPercent : null;
    if (calculatedPercent === null && typeof watchedSeconds === "number" && durationSec > 0) {
      calculatedPercent = Math.min(100, Math.round((watchedSeconds / durationSec) * 100));
    }
    if (calculatedPercent !== null) {
      updateFields.watchProgressPercent = Math.max(0, Math.min(100, calculatedPercent));
    }

    if (typeof scrollPosition === "number") {
      updateFields.scrollPosition = Math.max(0, scrollPosition);
    }
    if (typeof notes === "string") {
      updateFields.notes = notes;
    }
    if (Array.isArray(objectivesDone)) {
      updateFields.objectivesDone = objectivesDone;
    }

    // 90% completion rule: if watchProgress >= 90 or completed === true, mark completed
    const meets90PercentRule =
      (calculatedPercent !== null && calculatedPercent >= 90) ||
      (typeof watchedSeconds === "number" && durationSec > 0 && (watchedSeconds / durationSec) >= 0.9);

    if (completed === true || meets90PercentRule) {
      updateFields.status = "completed";
      updateFields.completedAt = new Date();
    } else if (watchedSeconds > 0 || (calculatedPercent && calculatedPercent > 0)) {
      updateFields.status = "in_progress";
    }

    if (moduleId) {
      updateFields.moduleId = moduleId;
    }

    const progress = await LmsLessonProgress.findOneAndUpdate(
      { cohortId: cohort._id, userId, lessonId },
      { $set: updateFields },
      { new: true, upsert: true }
    );

    const overallPercent = await computeOverallPercent(
      cohort._id,
      cohort.courseId,
      userId
    );

    res.status(200).json({
      progress,
      overallPercent,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/lms/lessons/:lessonId/comments
 * Retrieves discussion threads and replies for a lesson in a cohort
 */
export const getComments = async (req, res, next) => {
  try {
    const cohort = req.cohort;
    const { lessonId } = req.params;

    const topComments = await LmsLessonComment.find({
      lessonId,
      cohortId: cohort._id,
      parentId: null,
    })
      .populate("userId", "firstName lastName name avatar role")
      .sort({ createdAt: -1 });

    const commentsWithReplies = await Promise.all(
      topComments.map(async (c) => {
        const replies = await LmsLessonComment.find({ parentId: c._id })
          .populate("userId", "firstName lastName name avatar role")
          .sort({ createdAt: 1 });
        return {
          ...c.toObject(),
          likesCount: c.likes?.length || 0,
          replies: replies.map((r) => ({
            ...r.toObject(),
            likesCount: r.likes?.length || 0,
          })),
        };
      })
    );

    res.status(200).json({
      comments: commentsWithReplies,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/lms/lessons/:lessonId/comments
 * Posts top-level discussion comment
 */
export const createComment = async (req, res, next) => {
  try {
    const cohort = req.cohort;
    const userId = req.user._id;
    const { lessonId } = req.params;
    const { body } = req.body;

    if (!body || !body.trim()) {
      return res.status(400).json({ error: "Comment body is required" });
    }

    const authorRole =
      req.user.role === "tutor" || req.user.role === "instructor"
        ? "instructor"
        : req.user.role || "student";

    const comment = await LmsLessonComment.create({
      lessonId,
      cohortId: cohort._id,
      userId,
      authorRole,
      body: body.trim(),
    });

    res.status(201).json({
      comment,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/lms/comments/:id/replies
 * Posts threaded reply to a lesson comment
 */
export const replyComment = async (req, res, next) => {
  try {
    const parentComment = await LmsLessonComment.findById(req.params.id);
    if (!parentComment) {
      return res.status(404).json({ error: "Parent comment not found" });
    }

    const { body } = req.body;
    if (!body || !body.trim()) {
      return res.status(400).json({ error: "Reply body is required" });
    }

    const authorRole =
      req.user.role === "tutor" || req.user.role === "instructor"
        ? "instructor"
        : req.user.role || "student";

    const reply = await LmsLessonComment.create({
      lessonId: parentComment.lessonId,
      cohortId: parentComment.cohortId,
      userId: req.user._id,
      authorRole,
      body: body.trim(),
      parentId: parentComment._id,
    });

    res.status(201).json({
      reply,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/lms/comments/:id/like
 * Toggles like on a comment
 */
export const likeComment = async (req, res, next) => {
  try {
    const comment = await LmsLessonComment.findById(req.params.id);
    if (!comment) {
      return res.status(404).json({ error: "Comment not found" });
    }

    const userIdStr = String(req.user._id);
    const hasLiked = comment.likes.some((id) => String(id) === userIdStr);

    if (!hasLiked) {
      comment.likes.push(req.user._id);
      await comment.save();
    }

    res.status(200).json({
      liked: true,
      likesCount: comment.likes.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/lms/comments/:id/like
 * Removes like from a comment
 */
export const unlikeComment = async (req, res, next) => {
  try {
    const comment = await LmsLessonComment.findById(req.params.id);
    if (!comment) {
      return res.status(404).json({ error: "Comment not found" });
    }

    const userIdStr = String(req.user._id);
    comment.likes = comment.likes.filter((id) => String(id) !== userIdStr);
    await comment.save();

    res.status(200).json({
      liked: false,
      likesCount: comment.likes.length,
    });
  } catch (error) {
    next(error);
  }
};
